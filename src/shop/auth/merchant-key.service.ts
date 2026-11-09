import type { Request, Response, NextFunction, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { generateApiKey, hashApiKey } from '../../services/api-key.service';
import type { ShopTx } from '../db';
import { ShopAuthError } from './errors';

export const MERCHANT_KEY_PREFIX = 'mk_live_';
export const MERCHANT_SCOPES = [
  'catalog:write',
  'orders:read',
  'orders:write',
  'refunds:write',
  'webhooks:write',
  'stats:read',
] as const;
export type MerchantScope = (typeof MERCHANT_SCOPES)[number];

export const WRITE_LIMIT_PER_MIN = 60;
export const READ_LIMIT_PER_MIN = 600;

export interface AuthedMerchant {
  merchant_id: string;
  key_hash: string;
  scopes: string[];
  /** shop_merchants.status at authentication time (T-0599). */
  status: string;
  /** T-0740: set when the key is a partner grant key (shop_partner_grants); absent for the owner's keys. */
  grant_id?: string;
  partner_id?: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    merchant?: AuthedMerchant;
  }
}

/** Create a key; the plaintext is returned ONCE, only the SHA-256 hash is stored. */
export async function issueKey(
  db: ShopTx,
  merchant_id: string,
  scopes: readonly string[] = MERCHANT_SCOPES,
  label: string | null = null,
): Promise<string> {
  const key = generateApiKey(MERCHANT_KEY_PREFIX);
  await db.$executeRawUnsafe(
    `INSERT INTO shop_merchant_keys (key_hash, merchant_id, scopes, label)
     VALUES ($1, $2::uuid, $3::text[], $4)`,
    hashApiKey(key),
    merchant_id,
    [...scopes],
    label,
  );
  return key;
}

const keyOf = (req: Request): string => req.merchant?.key_hash ?? 'anon';
const limited = (max: number) =>
  rateLimit({
    windowMs: 60_000,
    limit: max,
    keyGenerator: keyOf,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    handler: (_req, res) => {
      res.status(429).json({ error: 'rate_limited', suggested_action: 'slow down and retry' });
    },
  });

// Module-level: the budget belongs to the key, not to a particular guarded route.
const writeLimiter = limited(WRITE_LIMIT_PER_MIN);
const readLimiter = limited(READ_LIMIT_PER_MIN);

export const MALFORMED_KEY_MESSAGE = 'missing or malformed merchant key';

/** Bearer mk_live_ -> hash -> shop_merchant_keys (not revoked) -> req.merchant. A grant key (T-0740)
 *  carries grant_id + partner_id; its grant must be active (a revoked grant = a revoked key, 401). */
export async function authenticateMerchantKey(
  db: ShopTx,
  authorization: string | undefined,
): Promise<AuthedMerchant> {
  const m = /^Bearer (mk_live_[0-9a-f]{32})$/.exec(authorization ?? '');
  if (!m) throw new ShopAuthError(401, MALFORMED_KEY_MESSAGE);
  const key_hash = hashApiKey(m[1]);
  const rows = await db.$queryRawUnsafe<
    Array<{
      merchant_id: string;
      scopes: string[];
      status: string | null;
      grant_id: string | null;
      partner_id: string | null;
      grant_revoked: boolean | null;
    }>
  >(
    `SELECT k.merchant_id, k.scopes, m.status, g.grant_id::text AS grant_id, g.partner_id,
            (g.revoked_at IS NOT NULL) AS grant_revoked
       FROM shop_merchant_keys k
       LEFT JOIN shop_merchants m ON m.merchant_id = k.merchant_id
       LEFT JOIN shop_partner_grants g ON g.key_hash = k.key_hash
      WHERE k.key_hash = $1 AND k.revoked_at IS NULL`,
    key_hash,
  );
  const r = rows[0];
  if (!r || (r.grant_id && r.grant_revoked)) {
    throw new ShopAuthError(401, 'invalid or revoked merchant key');
  }
  return {
    merchant_id: r.merchant_id,
    key_hash,
    scopes: r.scopes,
    status: r.status ?? 'active',
    ...(r.grant_id ? { grant_id: r.grant_id, partner_id: r.partner_id ?? '' } : {}),
  };
}

/** T-0740: what a partner grant key may never do (keys, deactivation, payouts, terms, grants, orders...). */
export function grantKeyNotAllowed(partner_id: string | undefined): ShopAuthError {
  return new ShopAuthError(
    403,
    `this key was granted to ${partner_id ?? 'a partner'}; use the merchant key`,
    'fix_request',
    'grant_key_not_allowed',
  );
}

const grantKeyNotAllowedBody = (partner_id: string | undefined) => ({
  error: 'grant_key_not_allowed',
  error_code: 'grant_key_not_allowed',
  message: grantKeyNotAllowed(partner_id).message,
  suggested_action: 'fix_request',
  documentation_url: '/integrator/docs#partner-grants',
});

/**
 * T-0740 guard, listed after requireMerchantKey: a partner grant key is refused with 403
 * grant_key_not_allowed. On a wallet-signed route without requireMerchantKey (acceptances) a
 * presented grant key is looked up and refused the same way; no key or an owner key passes.
 */
export function ownerKeyOnly(getDb: () => ShopTx | Promise<ShopTx>): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    let m = req.merchant;
    const h: unknown = req.headers.authorization;
    if (!m && typeof h === 'string' && h.startsWith('Bearer mk_live_')) {
      try {
        m = await authenticateMerchantKey(await getDb(), h);
      } catch {
        m = undefined;
      }
    }
    if (m?.grant_id) {
      res.status(403).json(grantKeyNotAllowedBody(m.partner_id));
      return;
    }
    next();
  };
}

/** T-0599: a suspended/deactivated merchant's key may only read and finish open orders. */
export const INACTIVE_STATUSES: readonly string[] = ['suspended', 'deactivated'];
export const isInactiveMerchant = (m: Pick<AuthedMerchant, 'status'>): boolean =>
  INACTIVE_STATUSES.includes(m.status);

/** Non-GET routes still open to an inactive merchant: close/fulfil orders, confirm refunds, settle, cancel. */
const INACTIVE_WRITE_ALLOWED: readonly RegExp[] = [
  /^\/api\/v1\/shop\/merchants\/me\/orders\/[^/]+\/(confirm|ship|document)$/,
  /^\/api\/v1\/shop\/merchants\/me\/refunds$/,
  /^\/api\/v1\/shop\/merchants\/me\/streams\/[^/]+\/settled$/,
  /^\/api\/v1\/shop\/merchants\/me\/subscriptions\/[^/]+\/(renewed|cancel)$/,
  /^\/api\/v1\/shop\/merchants\/me\/fee-invoices\/[^/]+\/paid$/,
  /^\/api\/v1\/shop\/merchants\/me\/deactivate$/,
];

export function inactiveWriteAllowed(method: string, path: string): boolean {
  if (method === 'GET' || method === 'HEAD') return true;
  return INACTIVE_WRITE_ALLOWED.some((re) => re.test(path));
}

export function merchantInactiveError(): ShopAuthError {
  return new ShopAuthError(
    410,
    'merchant is suspended or deactivated: only reads and closing open orders are allowed',
    'contact_support',
    'merchant_inactive',
  );
}

/** express guard: requires every scope in `scopes` (403 otherwise), then rate-limits per key.
 *  The key lookup runs before that limiter: routes must put a per-address limiter in front
 *  of this guard (merchant.router `probeLimiter`), CodeQL js/missing-rate-limiting. */
export function requireMerchantKey(
  scopes: readonly string[],
  getDb: () => ShopTx | Promise<ShopTx>,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.merchant = await authenticateMerchantKey(await getDb(), req.headers.authorization);
    } catch (err) {
      if (err instanceof ShopAuthError && err.message === MALFORMED_KEY_MESSAGE) {
        res.status(401).json({
          error: 'unauthorized',
          error_code: 'unauthorized',
          message: err.message,
          suggested_action: 'send Authorization: Bearer mk_live_...',
          documentation_url: '/integrator/agent-guide#unauthorized',
        });
      } else if (err instanceof ShopAuthError) {
        res.status(err.status).json({ error: err.message });
      } else {
        res.status(503).json({ error: 'auth backend unavailable' });
      }
      return;
    }
    if (isInactiveMerchant(req.merchant) && !inactiveWriteAllowed(req.method, req.path)) {
      const e = merchantInactiveError();
      res.status(410).json({
        error: 'merchant_inactive',
        error_code: 'merchant_inactive',
        message: e.message,
        suggested_action: e.suggested_action,
      });
      return;
    }
    const have = new Set(req.merchant.scopes);
    const missing = scopes.filter((s) => !have.has(s));
    if (missing.length > 0 && req.merchant.grant_id) {
      // T-0740: a partner grant key outside its two scopes gets the grant answer, not a scope list.
      res.status(403).json(grantKeyNotAllowedBody(req.merchant.partner_id));
      return;
    }
    if (missing.length > 0) {
      res.status(403).json({ error: 'insufficient_scope', missing });
      return;
    }
    const isRead = req.method === 'GET' || req.method === 'HEAD';
    (isRead ? readLimiter : writeLimiter)(req, res, next);
  };
}
