/**
 * T-0802 (SELLER-LIVE-1112 ruling-3): a partner handoff that asked for the grant is signed once.
 * One server-built message states, in this order, the shop's encryption key, the registration, the
 * four documents (id, version, sha256) and the partner's permission. The page sends only the public
 * key; the browser never composes the text. The nonce record (Redis, 300 s, single use) holds every
 * value of the message, so the verifier rebuilds it and compares byte for byte. One transaction then
 * writes the same records as the per-purpose routes (encryption key, registration, one acceptance per
 * document, grant), each with this message and its signature as the proof, and the handoff ends
 * `granted`. The per-purpose messages and routes are unchanged.
 */
import { randomBytes } from 'node:crypto';
import { ShopAuthError } from '../auth/errors';
import { issueKey } from '../auth/merchant-key.service';
import { GRANT_ALLOWS_LINE, NONCE_TTL_S, type NonceRedis } from '../auth/nonce.service';
import { currentDocs, REQUIRED_DOCS, termsNotAccepted, type LegalDoc } from '../auth/terms.guard';
import type { ShopTx } from '../db';
import { acceptanceMethod, writeAcceptances, type ShopDeps } from '../merchant-lifecycle.service';
import { MerchantRegisterError, registerMerchant, type RegisterCtx } from '../merchant.service';
import { QuoteError } from '../quote.errors';
import { verifyWalletSignature as checkWalletSignature } from '../wallet-signature';
import { findPartner, grantExists, writeGrant, type PartnerRef } from './grant.service';
import { bindHandoff, UUID_RE } from './handoff.service';

const DOC = '/integrator/docs#partner-handoff';
const PREFIX = 'shop:hnonce:';
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const SLUG_RE = /^[a-z0-9-]{3,40}$/;
const KID_RE = /^[A-Za-z0-9._-]{1,64}$/;
/** raw X25519 public key (32 bytes), standard base64 as the page exports it */
const PUB_RE = /^[A-Za-z0-9+/]{43}=$/;
const TAIL_RE = /\nNonce: ([0-9a-f]{32})\nIssued At: (\S+)$/;

/** One statement of a combined message: a heading line and its value lines. */
export interface Statement {
  heading: string;
  lines: string[];
}

/**
 * The builder: a plain first line, then each statement numbered in the given order, then the nonce
 * and the time. It takes any list of statements (the direct flow may use it later by a separate ruling).
 */
export function statementsMessage(p: {
  title: string;
  statements: Statement[];
  nonce: string;
  issuedAt: string;
}): string {
  const body = p.statements.map((s, i) => [`${i + 1}. ${s.heading}`, ...s.lines].join('\n'));
  return [p.title, ...body, `Nonce: ${p.nonce}`, `Issued At: ${p.issuedAt}`].join('\n');
}

/** The value lines of the encryption-key statement are the lines of the per-purpose key text. */
export const encryptionKeyStatement = (k: {
  kid: string;
  alg: string;
  pub: string;
}): Statement => ({
  heading: 'Encryption key of the shop',
  lines: [`kid: ${k.kid}`, `alg: ${k.alg}`, `pub: ${k.pub}`],
});
export const registrationStatement = (address: string): Statement => ({
  heading: 'Registration',
  lines: [`Address: ${address}`, 'Purpose: register'],
});
export const documentsStatement = (
  docs: Array<Pick<LegalDoc, 'doc_id' | 'version' | 'sha256'>>,
): Statement => ({
  heading: 'I accept the APIbase documents',
  lines: docs.map((d) => `${d.doc_id} v${d.version} sha256:${d.sha256}`),
});
/** The value lines of the per-purpose grant text (nonce.service grantMessage), word for word. */
export const permissionStatement = (partner: { id: string; name: string }): Statement => ({
  heading: `Permission for ${partner.name}`,
  lines: [
    `Partner: ${partner.id}`,
    GRANT_ALLOWS_LINE,
    'Does not allow: payouts, keys, orders, refunds',
    `Revoke any time: DELETE /api/v1/shop/merchants/me/grants/${partner.id}`,
  ],
});

/** Everything the message states; kept as the nonce record. */
export interface HandoffNonceRecord {
  address: string;
  handoff_id: string;
  partner_id: string;
  slug: string;
  kid: string;
  alg: 'x25519';
  pub: string;
  docs: Array<{ doc_id: string; version: string; sha256: string }>;
  nonce: string;
  issued_at: string;
}

export function handoffMessage(
  r: HandoffNonceRecord,
  partner: { id: string; name: string },
): string {
  return statementsMessage({
    title: `apibase.pro: open the shop apibase.pro/m/${r.slug} and allow ${partner.name} to act for it`,
    statements: [
      encryptionKeyStatement(r),
      registrationStatement(r.address),
      documentsStatement(r.docs),
      permissionStatement(partner),
    ],
    nonce: r.nonce,
    issuedAt: r.issued_at,
  });
}

const invalid = (field: string, message = `${field} is invalid`) =>
  new QuoteError(422, 'validation_failed', message, 'fix_request', {
    field,
    documentation_url: DOC,
  });

interface HandoffRow {
  partner_id: string;
  mode: string;
  grant_requested: boolean;
  expected_wallet: string | null;
  state: string;
  live: boolean;
}

async function liveHandoff(db: ShopTx, handoff_id: string): Promise<HandoffRow | null> {
  const rows = await db.$queryRawUnsafe<HandoffRow[]>(
    `SELECT partner_id, mode, grant_requested, expected_wallet, state, (expires_at > now()) AS live
       FROM shop_partner_handoffs WHERE handoff_id = $1::uuid`,
    handoff_id,
  );
  const h = rows[0];
  return h &&
    h.live &&
    (h.state === 'created' || h.state === 'opened') &&
    h.mode === 'register' &&
    h.grant_requested
    ? h
    : null;
}

const wrongWallet = () =>
  new ShopAuthError(
    401,
    'this wallet is not the wallet the partner expects for this handoff',
    'connect the wallet you use on the partner',
  );

/** The same 409s as POST /merchants, before anything is signed. */
async function takenCheck(db: ShopTx, slug: string, wallet: string): Promise<void> {
  const taken = await db.$queryRawUnsafe<Array<{ slug: string; wallet_address: string }>>(
    `SELECT slug, wallet_address FROM shop_merchants WHERE slug = $1 OR wallet_address = $2`,
    slug,
    wallet,
  );
  if (taken.some((t) => t.wallet_address === wallet))
    throw new MerchantRegisterError(
      409,
      'wallet_registered',
      'wallet already registered',
      'fix_request',
      '/integrator/docs',
    );
  if (taken.length > 0)
    throw new MerchantRegisterError(
      409,
      'slug_taken',
      'slug already registered',
      'fix_request',
      '/integrator/docs',
    );
}

async function docsNow(d: ShopDeps): Promise<LegalDoc[]> {
  const docs = await currentDocs(d.db, (d.now ?? Date.now)());
  if (docs.length !== REQUIRED_DOCS.length) {
    throw new ShopAuthError(503, 'legal documents unavailable', 'retry shortly');
  }
  return docs;
}

async function redisOf(d: ShopDeps): Promise<NonceRedis> {
  if (d.redis) return d.redis;
  const { ensureRedisConnected } = await import('../../services/redis.service');
  return (await ensureRedisConnected()) as unknown as NonceRedis;
}

/**
 * GET /api/v1/shop/auth/nonce?purpose=handoff&wallet=&handoff=&slug=&kid=&pub= : the combined message
 * for a live register handoff that asked for the grant. Refuses before anything is signed what the
 * write would refuse: another wallet than the handoff expects, a wallet or slug already taken.
 */
export async function issueHandoffNonce(
  d: ShopDeps,
  q: { wallet: unknown; handoff: unknown; slug: unknown; kid: unknown; pub: unknown },
): Promise<{ nonce: string; issued_at: string; expires_in: number; message: string }> {
  if (typeof q.wallet !== 'string' || !ADDR_RE.test(q.wallet)) throw invalid('wallet');
  if (typeof q.handoff !== 'string' || !UUID_RE.test(q.handoff)) throw invalid('handoff');
  if (typeof q.slug !== 'string' || !SLUG_RE.test(q.slug)) throw invalid('slug');
  if (typeof q.kid !== 'string' || !KID_RE.test(q.kid)) throw invalid('kid');
  if (typeof q.pub !== 'string' || !PUB_RE.test(q.pub)) throw invalid('pub');
  const wallet = q.wallet.toLowerCase();
  const h = await liveHandoff(d.db, q.handoff);
  const p = h ? await findPartner(h.partner_id) : undefined;
  if (!h || !p) {
    throw invalid('handoff', 'handoff is not a live register handoff that asked for the grant');
  }
  if (h.expected_wallet && h.expected_wallet !== wallet) throw wrongWallet();
  await takenCheck(d.db, q.slug, wallet);
  const docs = await docsNow(d);
  const r: HandoffNonceRecord = {
    address: q.wallet,
    handoff_id: q.handoff.toLowerCase(),
    partner_id: p.id,
    slug: q.slug,
    kid: q.kid,
    alg: 'x25519',
    pub: q.pub,
    docs: docs.map(({ doc_id, version, sha256 }) => ({ doc_id, version, sha256 })),
    nonce: randomBytes(16).toString('hex'),
    issued_at: new Date((d.now ?? Date.now)()).toISOString(),
  };
  try {
    await (await redisOf(d)).set(PREFIX + r.nonce, JSON.stringify(r), 'EX', NONCE_TTL_S);
  } catch {
    throw new ShopAuthError(503, 'nonce store unavailable', 'retry shortly');
  }
  return {
    nonce: r.nonce,
    issued_at: r.issued_at,
    expires_in: NONCE_TTL_S,
    message: handoffMessage(r, p),
  };
}

export interface HandoffRegisterResult {
  merchant_id: string;
  slug: string;
  status: 'active';
  handoff: { handoff_id: string; state: 'granted' };
  grant: { grant_id: string; partner: string; mode: string; scopes: string[]; created_at: string };
  /** only for a partner whose registry `seller_keys` is not `hidden` */
  api_key?: string;
}

/**
 * POST /api/v1/shop/merchants/handoff: verify the one signature once, then write every record in one
 * transaction. Partner with `seller_keys: hidden`: no API key is minted (the registration needs none;
 * the owner page and keys/reissue work with the wallet). Otherwise the key is minted and returned once.
 */
export async function registerByHandoff(
  d: ShopDeps,
  body: unknown,
  ctx: Partial<RegisterCtx> = {},
): Promise<HandoffRegisterResult> {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const { wallet, handoff_id, message, signature } = b;
  if (typeof wallet !== 'string' || !ADDR_RE.test(wallet)) throw invalid('wallet');
  if (typeof handoff_id !== 'string' || !UUID_RE.test(handoff_id)) throw invalid('handoff_id');
  if (typeof message !== 'string' || typeof signature !== 'string') {
    throw new ShopAuthError(401, 'wallet signature required', 'sign the handoff message');
  }
  const tail = TAIL_RE.exec(message);
  if (!tail) throw new ShopAuthError(401, 'malformed handoff message');
  // single use: the record is taken before anything else is checked
  let raw: string | null;
  try {
    raw = await (await redisOf(d)).getdel(PREFIX + tail[1]);
  } catch {
    throw new ShopAuthError(503, 'nonce store unavailable', 'retry shortly');
  }
  if (!raw) throw new ShopAuthError(401, 'nonce unknown, expired or used');
  const r = JSON.parse(raw) as HandoffNonceRecord;
  const p = await findPartner(r.partner_id);
  if (!p) throw new ShopAuthError(401, 'partner no longer registered');
  if (message !== handoffMessage(r, p)) {
    throw new ShopAuthError(
      401,
      'message does not match the nonce message',
      'sign the message returned by GET /auth/nonce?purpose=handoff',
    );
  }
  const lower = wallet.toLowerCase();
  if (r.address.toLowerCase() !== lower || r.handoff_id !== handoff_id.toLowerCase()) {
    throw new ShopAuthError(401, 'message does not match wallet/handoff');
  }
  if (b.slug !== undefined && b.slug !== r.slug)
    throw invalid('slug', 'slug differs from the signed message');
  const age = ((d.now ?? Date.now)() - Date.parse(r.issued_at)) / 1000;
  if (!Number.isFinite(age) || age > NONCE_TTL_S || age < -NONCE_TTL_S) {
    throw new ShopAuthError(401, 'handoff message expired');
  }
  const sig = await checkWalletSignature({ address: r.address, message, signature });
  if (!sig.ok) throw new ShopAuthError(401, 'invalid signature');
  const h = await liveHandoff(d.db, r.handoff_id);
  if (!h || h.partner_id !== p.id) {
    throw invalid('handoff_id', 'handoff is no longer live');
  }
  if (h.expected_wallet && h.expected_wallet !== lower) throw wrongWallet();
  const docs = await docsNow(d);
  const same =
    docs.length === r.docs.length &&
    docs.every(
      (c, i) =>
        c.doc_id === r.docs[i].doc_id &&
        c.version === r.docs[i].version &&
        c.sha256 === r.docs[i].sha256,
    );
  if (!same) throw termsNotAccepted(docs);

  const proof = { message, signature };
  const out = await d
    .transaction(async (tx) => {
      const reg = await registerMerchant(
        {
          ...(b as object),
          wallet: r.address,
          slug: r.slug,
          handoff_id: undefined, // bound below: here a stale handoff fails the whole write
          encryption_key: {
            kid: r.kid,
            alg: r.alg,
            pub: r.pub,
            sig_by_wallet: signature,
            signed_message: message,
          },
          signed: proof,
        } as never,
        {
          ...ctx,
          db: tx,
          eventsDb: d.db,
          redis: d.redis,
          now: d.now,
          path: '/api/v1/shop/merchants/handoff',
        },
        { signer_kind: sig.signer_kind, ...proof },
      );
      if (!(await bindHandoff(tx, r.handoff_id, reg.merchant_id, r.slug, lower))) {
        throw invalid('handoff_id', 'handoff is no longer live');
      }
      await writeAcceptances(tx, reg.merchant_id, docs, {
        method: acceptanceMethod(sig.signer_kind, 'wallet_signature'),
        signer: lower,
        ...proof,
        ip: ctx.ip,
        user_agent: ctx.user_agent,
      });
      await tx.$executeRawUnsafe(
        `UPDATE shop_merchants SET status = 'active' WHERE merchant_id = $1::uuid AND status = 'pending'`,
        reg.merchant_id,
      );
      const g = await writeGrant(
        d,
        tx,
        { merchant_id: reg.merchant_id, slug: r.slug },
        p as PartnerRef,
        {
          handoff_id: r.handoff_id,
          wallet: lower,
          proof,
        },
      );
      if (!g.handoff_bound) throw invalid('handoff_id', 'handoff is no longer live');
      const api_key =
        p.seller_keys === 'hidden'
          ? undefined
          : await issueKey(tx, reg.merchant_id, undefined, 'initial');
      return { merchant_id: reg.merchant_id, grant: g.grant, api_key };
    })
    .catch((e: unknown) => {
      if (/shop_partner_grants_active_uq/.test(String((e as Error)?.message)))
        throw grantExists(p.id);
      throw e;
    });
  d.onRegistered?.(r.slug);
  const g = out.grant;
  return {
    merchant_id: out.merchant_id,
    slug: r.slug,
    status: 'active',
    handoff: { handoff_id: r.handoff_id, state: 'granted' },
    grant: {
      grant_id: g.grant_id,
      partner: g.partner,
      mode: g.mode,
      scopes: g.scopes,
      created_at: g.created_at,
    },
    ...(out.api_key ? { api_key: out.api_key } : {}),
  };
}
