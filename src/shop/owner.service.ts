import { createHash, randomBytes } from 'node:crypto';
import { ShopAuthError } from './auth/errors';
import { verifyWalletSignature } from './auth/nonce.service';
import type { ShopDeps } from './merchant-lifecycle.service';
import { loadFeeReceivables, type FeeReceivables } from './fee-invoice.service';
import { webhookHealth } from './stats.service';

export const OWNER_TOKEN_TTL_S = 900;
export const OWNER_COOKIE = 'apibase_owner';
const TOKEN_PREFIX = 'shop:owner:';
const ADDRESS_RE = /\nAddress: (0x[0-9a-fA-F]{40})\n/;
const SLUG_RE = /^[a-z0-9-]{3,40}$/;
const ORDER_LIMIT = 50;

/** The Redis calls used for the owner token (ioredis satisfies it; tests inject a fake). */
interface TokenRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
}

async function redisOf(deps: ShopDeps): Promise<TokenRedis> {
  if (deps.redis) return deps.redis as unknown as TokenRedis;
  const { ensureRedisConnected } = await import('../services/redis.service');
  return (await ensureRedisConnected()) as unknown as TokenRedis;
}

const tokenKey = (token: string) => TOKEN_PREFIX + createHash('sha256').update(token).digest('hex');

export class OwnerError extends Error {
  constructor(
    readonly status: 401 | 404 | 503,
    message: string,
  ) {
    super(message);
  }
}

export interface OwnerMerchant {
  merchant_id: string;
  slug: string;
  name: string;
  status: string;
  status_reason: string | null;
  wallet_address: string;
}

export async function loadOwnerMerchant(deps: ShopDeps, slug: unknown): Promise<OwnerMerchant> {
  const rows =
    typeof slug === 'string' && SLUG_RE.test(slug)
      ? await deps.db.$queryRawUnsafe<OwnerMerchant[]>(
          `SELECT merchant_id, slug, name, status, status_reason, wallet_address
             FROM shop_merchants WHERE slug = $1`,
          slug,
        )
      : [];
  if (!rows[0]) throw new OwnerError(404, 'not found');
  return rows[0];
}

/**
 * Spec F-1 (Q-O2) read-only owner access. The credential is a wallet signature over the sign-in
 * message (purpose `owner`, one-time nonce from GET /api/v1/shop/auth/nonce); it is exchanged for a
 * 15-minute token that the caller keeps in a cookie. No credential -> 401; a valid signature of a
 * wallet that is not this merchant's identity -> 404 (the page is not disclosed to others).
 */
export async function authenticateOwner(
  deps: ShopDeps,
  slug: unknown,
  cred: { token?: string; message?: string; signature?: string },
): Promise<{ merchant: OwnerMerchant; token?: string }> {
  if (!cred.token && !(cred.message && cred.signature)) {
    throw new OwnerError(401, 'sign the owner message with the merchant wallet');
  }
  if (cred.token) {
    let merchant_id: string | null = null;
    try {
      merchant_id = await (await redisOf(deps)).get(tokenKey(cred.token));
    } catch {
      throw new OwnerError(503, 'session store unavailable');
    }
    if (!merchant_id) throw new OwnerError(401, 'owner session expired, sign again');
    const merchant = await loadOwnerMerchant(deps, slug);
    if (merchant.merchant_id !== merchant_id) throw new OwnerError(404, 'not found');
    return { merchant };
  }
  const address = ADDRESS_RE.exec(cred.message ?? '')?.[1];
  if (!address) throw new OwnerError(401, 'malformed sign-in message');
  try {
    await verifyWalletSignature(
      {
        message: cred.message as string,
        signature: cred.signature as string,
        expectedAddress: address,
        purpose: 'owner',
      },
      { redis: deps.redis, now: deps.now },
    );
  } catch (err) {
    if (err instanceof ShopAuthError) {
      throw new OwnerError(err.status === 503 ? 503 : 401, err.message);
    }
    throw err;
  }
  const merchant = await loadOwnerMerchant(deps, slug);
  if (merchant.wallet_address.toLowerCase() !== address.toLowerCase()) {
    throw new OwnerError(404, 'not found');
  }
  const token = randomBytes(32).toString('hex');
  try {
    await (await redisOf(deps)).set(tokenKey(token), merchant.merchant_id, 'EX', OWNER_TOKEN_TTL_S);
  } catch {
    throw new OwnerError(503, 'session store unavailable');
  }
  return { merchant, token };
}

export interface OwnerView {
  merchant: Pick<OwnerMerchant, 'slug' | 'name' | 'status' | 'status_reason'>;
  fee: {
    owed_usd: string;
    collected_usd: string;
    invoiced_usd: string;
    open_invoices: FeeReceivables['open_invoices'];
  };
  orders: Array<{
    order_id: string;
    state: string;
    rail: string | null;
    total_usd: string;
    fee_usd: string;
    created_at: string;
    tx_hash: string | null;
  }>;
  webhook: {
    endpoints: Array<{ url: string; status: string; failures_in_row: number }>;
    deliveries: number;
    success_pct: number | null;
    p95_delivery_ms: number | null;
  };
}

/** The data of the owner page: status, last 50 orders, accrued fee (owed / collected), webhook health. */
export async function loadOwnerView(deps: ShopDeps, m: OwnerMerchant): Promise<OwnerView> {
  const now = (deps.now ?? Date.now)();
  const from = new Date(now - 30 * 86_400_000);
  const to = new Date(now + 1000);
  const [fee, orders, endpoints, health, recv] = await Promise.all([
    deps.db.$queryRawUnsafe<Array<{ collected: string }>>(
      `SELECT coalesce(sum(fee_usd) FILTER (WHERE status = 'collected'), 0)::text AS collected
         FROM shop_fee_ledger WHERE merchant_id = $1::uuid`,
      m.merchant_id,
    ),
    deps.db.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT o.order_id, o.state, o.rail, o.total_usd::text AS total_usd,
              o.fee_usd::text AS fee_usd, o.created_at, o.tx_hash
         FROM shop_orders o JOIN shop_quotes q ON q.quote_id = o.quote_id
        WHERE o.merchant_id = $1::uuid AND NOT q.is_test
          AND o.state NOT IN ('QUOTED', 'EXPIRED', 'CANCELLED')
        ORDER BY o.created_at DESC, o.order_id LIMIT ${ORDER_LIMIT}`,
      m.merchant_id,
    ),
    deps.db.$queryRawUnsafe<OwnerView['webhook']['endpoints']>(
      `SELECT url, status, failures_in_row FROM shop_webhook_endpoints
        WHERE merchant_id = $1::uuid ORDER BY created_at`,
      m.merchant_id,
    ),
    webhookHealth(deps.db, m.merchant_id, from, to),
    loadFeeReceivables(deps.db, m.merchant_id),
  ]);
  return {
    merchant: { slug: m.slug, name: m.name, status: m.status, status_reason: m.status_reason },
    fee: {
      owed_usd: recv.owed_usd,
      collected_usd: fee[0]?.collected ?? '0',
      invoiced_usd: recv.invoiced_usd,
      open_invoices: recv.open_invoices,
    },
    orders: orders.map((o) => ({
      order_id: String(o.order_id),
      state: String(o.state),
      rail: (o.rail as string | null) ?? null,
      total_usd: String(o.total_usd),
      fee_usd: String(o.fee_usd),
      created_at: o.created_at instanceof Date ? o.created_at.toISOString() : String(o.created_at),
      tx_hash: (o.tx_hash as string | null) ?? null,
    })),
    webhook: { endpoints, ...health },
  };
}
