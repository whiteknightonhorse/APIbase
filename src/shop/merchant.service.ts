import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { verifyMessage } from 'viem';
import { logger } from '../config/logger';
import { checkBan, recordBlock } from '../services/moderation-ban.service';
import type { Alternative, SuggestedAction } from '../types/errors';
import type { ShopTx } from './db';
import { ShopAuthError } from './auth/errors';
import { verifyWalletSignature, type NonceRedis } from './auth/nonce.service';
import { isCategoryAllowed, nearestAllowed } from './moderation/categories';
import { isRestrictedEntityCountry, isRestrictedIp } from './moderation/countries';
import { isSanctioned } from './moderation/sanctions';

export const REGISTRATIONS_PER_IP_PER_HOUR = 5;
const SLUG_RE = /^[a-z0-9-]{3,40}$/;
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

const DEFAULT_LIMITS = {
  max_order_usd: 10000,
  new_merchant_cap_usd: 200,
  quote_ttl_s: 900,
};
const DEFAULT_POLICY = { confirm_sla_h: 48 };

export interface EncryptionKey {
  kid: string;
  alg: string;
  pub: string;
  sig_by_wallet: string;
}

/** The text the wallet signs to vouch for its encryption key (`sig_by_wallet`, EIP-191). */
export function encryptionKeyMessage(k: Pick<EncryptionKey, 'kid' | 'alg' | 'pub'>): string {
  return `apibase.pro merchant encryption key\nkid: ${k.kid}\nalg: ${k.alg}\npub: ${k.pub}`;
}

/** `sig_by_wallet` check, the ONE implementation: registration (INT-03) and key rotation (INT-21). */
export async function verifyEncryptionKeySignature(
  wallet: string,
  k: Pick<EncryptionKey, 'kid' | 'alg' | 'pub' | 'sig_by_wallet'>,
): Promise<boolean> {
  try {
    return await verifyMessage({
      address: wallet as `0x${string}`,
      message: encryptionKeyMessage(k),
      signature: k.sig_by_wallet as `0x${string}`,
    });
  } catch {
    return false;
  }
}

export interface RegisterInput {
  wallet: string;
  slug: string;
  name: string;
  category: string;
  country: string;
  contact_email: string;
  site_url: string;
  payout_wallet?: string;
  payout_wallet_base?: string;
  payout_wallet_tempo?: string;
  recovery_wallet?: string;
  encryption_key: EncryptionKey;
  /** EIP-191 sign-in message, purpose `register` (INT-02). */
  signed: { message: string; signature: string };
}

export interface RegisterCtx {
  db: ShopTx;
  redis?: NonceRedis & {
    incr(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<unknown>;
  };
  now?: () => number;
  /** Caller-supplied: this tree has no IP-geo mechanism, so null/absent = IP rule not applied. */
  ip?: string;
  ip_country?: string | null;
  ip_region?: string | null;
  user_agent?: string;
  client_name?: string;
  client_version?: string;
  path?: string;
}

/** Refusal with the F-15 shape: suggested_action + documentation_url + alternatives[]. */
export class MerchantRegisterError extends Error {
  constructor(
    readonly status: 403 | 409 | 422 | 429,
    readonly error_code: string,
    message: string,
    readonly suggested_action: SuggestedAction,
    readonly documentation_url: string,
    readonly alternatives?: Alternative[],
    readonly retry_after?: number,
  ) {
    super(message);
    this.name = 'MerchantRegisterError';
  }
}

const fail = (
  status: MerchantRegisterError['status'],
  code: string,
  msg: string,
  action: SuggestedAction,
  doc: string,
  alts?: Alternative[],
  retry?: number,
) => new MerchantRegisterError(status, code, msg, action, doc, alts, retry);

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function ipPrefix(ip?: string): string | null {
  if (!ip) return null;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(ip);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
  return ip.includes(':') ? `${ip.split(':').slice(0, 3).join(':')}::/48` : null;
}

function configDefaults(): { limits: object; policy: object } {
  try {
    const raw = JSON.parse(
      readFileSync(resolve(__dirname, '../../config/integrator/risk.private.json'), 'utf-8'),
    ) as { limits?: object; policy?: object };
    return {
      limits: { ...DEFAULT_LIMITS, ...raw.limits },
      policy: { ...DEFAULT_POLICY, ...raw.policy },
    };
  } catch {
    return { limits: DEFAULT_LIMITS, policy: DEFAULT_POLICY };
  }
}

async function emitConnectEvent(ctx: RegisterCtx, wallet: string, error_code: string) {
  const prefix = ipPrefix(ctx.ip);
  try {
    await ctx.db.$executeRawUnsafe(
      `INSERT INTO shop_connect_events
         (identity_hash, client_name, client_version, user_agent, ip_prefix, error_code, path)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      sha(`${wallet.toLowerCase()}|${prefix ?? ''}`),
      ctx.client_name ?? null,
      ctx.client_version ?? null,
      ctx.user_agent ?? null,
      prefix,
      error_code,
      ctx.path ?? '/shop/merchant/register',
    );
  } catch (err) {
    logger.warn({ err }, 'shop_connect_events insert failed');
  }
}

async function checkIpRate(ctx: RegisterCtx): Promise<void> {
  if (!ctx.ip) return;
  let n = 0;
  try {
    const r =
      ctx.redis ??
      ((await (
        await import('../services/redis.service')
      ).ensureRedisConnected()) as never as NonNullable<RegisterCtx['redis']>);
    const key = `shop:reg:ip:${sha(ctx.ip).slice(0, 16)}`;
    n = await r.incr(key);
    if (n === 1) await r.expire(key, 3600);
  } catch {
    return; // fail-open, like the moderation ban
  }
  if (n > REGISTRATIONS_PER_IP_PER_HOUR) {
    throw fail(
      429,
      'rate_limited',
      'too many registrations from this address',
      'retry_after_delay',
      '/legal/aup',
      undefined,
      3600,
    );
  }
}

async function validate(input: RegisterInput): Promise<void> {
  const bad = (m: string) => fail(422, 'validation_failed', m, 'fix_request', '/docs/integrator');
  if (!SLUG_RE.test(input.slug ?? '')) throw bad('slug must match [a-z0-9-]{3,40}');
  if (!ADDR_RE.test(input.wallet ?? '')) throw bad('wallet must be an EVM address');
  if (typeof input.name !== 'string' || input.name.length < 1 || input.name.length > 120)
    throw bad('name must be 1-120 characters');
  if (typeof input.category !== 'string' || !input.category) throw bad('category is required');
  if (!/^[A-Za-z]{2}$/.test(input.country ?? '')) throw bad('country must be ISO 3166-1 alpha-2');
  if (!EMAIL_RE.test(input.contact_email ?? '')) throw bad('contact_email is invalid');
  try {
    if (new URL(input.site_url).protocol !== 'https:') throw new Error();
  } catch {
    throw bad('site_url must be an https URL');
  }
  for (const w of [
    input.payout_wallet,
    input.payout_wallet_base,
    input.payout_wallet_tempo,
    input.recovery_wallet,
  ]) {
    if (w !== undefined && !ADDR_RE.test(w)) throw bad('wallet fields must be EVM addresses');
  }
  const k = input.encryption_key;
  if (!k || !k.kid || !k.alg || !k.pub || !k.sig_by_wallet)
    throw bad('encryption_key {kid, alg, pub, sig_by_wallet} is required');
  const ok = await verifyEncryptionKeySignature(input.wallet, k);
  if (!ok) throw bad('encryption_key.sig_by_wallet is not a signature by wallet');
}

const SANCTIONED_MSG = 'payout wallet cannot be used';

async function recordSanctionedPayout(d: RegisterCtx, input: RegisterInput, wallet: string) {
  // shop_moderation_reviews.merchant_id is NOT NULL: a deactivated stub row carries the review (INT-13 source).
  const rows = await d.db.$queryRawUnsafe<Array<{ merchant_id: string }>>(
    `INSERT INTO shop_merchants (slug, name, category, country, registration_ip_country, wallet_address,
        payout_wallet_base, payout_wallet_tempo, encryption_key, contact_email, site_url, status, status_reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8::jsonb,$9,$10,'deactivated','payout_wallet_sanctioned')
     ON CONFLICT DO NOTHING RETURNING merchant_id`,
    input.slug,
    input.name,
    input.category,
    input.country.toUpperCase(),
    d.ip_country ?? null,
    wallet,
    input.payout_wallet_base ?? input.payout_wallet ?? wallet,
    JSON.stringify(input.encryption_key),
    input.contact_email,
    input.site_url,
  );
  if (rows[0]) {
    await d.db.$executeRawUnsafe(
      `INSERT INTO shop_moderation_reviews (merchant_id, scope, layer, verdict, category)
       VALUES ($1::uuid, 'merchant', 'rules', 'reject', 'ofac')`,
      rows[0].merchant_id,
    );
  }
}

/** Layer-1 registration (UC-10/UC-22/F-13). Any refusal is also written to shop_connect_events. */
export async function registerMerchant(
  input: RegisterInput,
  ctx: RegisterCtx,
): Promise<{ merchant_id: string; status: 'pending'; agent_id: string }> {
  const wallet = (input.wallet ?? '').toLowerCase();
  try {
    await checkIpRate(ctx);

    // 1. signature (INT-02, purpose register)
    await verifyWalletSignature(
      { ...input.signed, expectedAddress: wallet, purpose: 'register' },
      { redis: ctx.redis, now: ctx.now },
    );

    // 2. shape + uniqueness + encryption key signature
    await validate(input);
    const taken = await ctx.db.$queryRawUnsafe<
      Array<{ slug: string; wallet_address: string; status_reason: string | null }>
    >(
      `SELECT slug, wallet_address, status_reason FROM shop_merchants WHERE slug = $1 OR wallet_address = $2`,
      input.slug,
      wallet,
    );
    const sanctionedStub = taken.some(
      (t) => t.wallet_address === wallet && t.status_reason === 'payout_wallet_sanctioned',
    );
    if (sanctionedStub) {
      throw fail(403, 'payout_wallet_sanctioned', SANCTIONED_MSG, 'contact_support', '/legal/aup');
    }
    if (taken.some((t) => t.slug === input.slug)) {
      throw fail(409, 'slug_taken', 'slug already registered', 'fix_request', '/docs/integrator');
    }
    if (taken.length > 0) {
      throw fail(
        409,
        'wallet_registered',
        'wallet already registered',
        'fix_request',
        '/docs/integrator',
      );
    }

    // 3. countries (form entity country OR IP country/region)
    if (isRestrictedEntityCountry(input.country) || isRestrictedIp(ctx.ip_country, ctx.ip_region)) {
      throw fail(
        403,
        'country_not_supported',
        'not available in your country',
        'contact_support',
        '/legal/aup',
      );
    }

    // 4. category
    if (!isCategoryAllowed(input.category)) {
      await recordBlock(`merchant:${wallet}`);
      throw fail(
        403,
        'category_prohibited',
        'this category is not supported',
        'fix_request',
        '/legal/aup#categories',
        nearestAllowed(input.category, 3).map((value) => ({
          kind: 'category',
          value,
          documentation_url: '/legal/aup#categories',
        })),
      );
    }

    // 5. OFAC for the payout wallets
    const payouts = [
      input.payout_wallet_base ?? input.payout_wallet ?? wallet,
      input.payout_wallet_tempo ?? input.payout_wallet ?? wallet,
    ].map((a) => a.toLowerCase());
    for (const p of payouts) {
      if (await isSanctioned(ctx.db, p)) {
        await recordSanctionedPayout(ctx, input, wallet);
        await recordBlock(`merchant:${wallet}`);
        throw fail(
          403,
          'payout_wallet_sanctioned',
          SANCTIONED_MSG,
          'contact_support',
          '/legal/aup',
        );
      }
    }

    // 6. moderation ban
    const ban = await checkBan(`merchant:${wallet}`);
    if (ban.banned) {
      throw fail(
        403,
        'moderation_banned',
        'registration temporarily unavailable',
        'retry_after_delay',
        '/legal/aup',
        undefined,
        ban.retryAfterSecs,
      );
    }

    // 7. create
    const agent = await ctx.db.$queryRawUnsafe<Array<{ agent_id: string }>>(
      `INSERT INTO agents (api_key_hash, tier, status) VALUES ($1, 'paid', 'active')
       ON CONFLICT (api_key_hash) DO UPDATE SET api_key_hash = EXCLUDED.api_key_hash
       RETURNING agent_id`,
      sha(`x402:${wallet}`),
    );
    const { limits, policy } = configDefaults();
    let merchant_id: string;
    try {
      const rows = await ctx.db.$queryRawUnsafe<Array<{ merchant_id: string }>>(
        `INSERT INTO shop_merchants (slug, name, category, country, registration_ip_country, wallet_address,
            payout_wallet_base, payout_wallet_tempo, recovery_wallet, encryption_key, contact_email, site_url,
            status, limits, policy, agent_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,'pending',$13::jsonb,$14::jsonb,$15::uuid)
         RETURNING merchant_id`,
        input.slug,
        input.name,
        input.category,
        input.country.toUpperCase(),
        ctx.ip_country ?? null,
        wallet,
        payouts[0],
        payouts[1],
        input.recovery_wallet?.toLowerCase() ?? null,
        JSON.stringify(input.encryption_key),
        input.contact_email,
        input.site_url,
        JSON.stringify(limits),
        JSON.stringify(policy),
        agent[0].agent_id,
      );
      merchant_id = rows[0].merchant_id;
    } catch (err) {
      if (/unique|23505/i.test(String((err as Error)?.message ?? err))) {
        throw fail(
          409,
          'slug_taken',
          'slug or wallet already registered',
          'fix_request',
          '/docs/integrator',
        );
      }
      throw err;
    }
    await ctx.db.$executeRawUnsafe(
      `INSERT INTO shop_moderation_reviews (merchant_id, scope, layer, verdict)
       VALUES ($1::uuid, 'merchant', 'rules', 'ok')`,
      merchant_id,
    );
    logger.info({ merchant_id, slug: input.slug }, 'merchant registered (pending)');
    return { merchant_id, status: 'pending', agent_id: agent[0].agent_id };
  } catch (err) {
    const code =
      err instanceof MerchantRegisterError
        ? err.error_code
        : err instanceof ShopAuthError
          ? err.status === 503
            ? 'nonce_store_unavailable'
            : 'unauthorized'
          : 'internal_error';
    await emitConnectEvent(ctx, wallet, code);
    throw err;
  }
}
