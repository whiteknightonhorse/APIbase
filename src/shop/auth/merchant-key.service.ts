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

/** Bearer mk_live_ -> hash -> shop_merchant_keys (not revoked) -> req.merchant. */
export async function authenticateMerchantKey(
  db: ShopTx,
  authorization: string | undefined,
): Promise<AuthedMerchant> {
  const m = /^Bearer (mk_live_[0-9a-f]{32})$/.exec(authorization ?? '');
  if (!m) throw new ShopAuthError(401, 'missing or malformed merchant key');
  const key_hash = hashApiKey(m[1]);
  const rows = await db.$queryRawUnsafe<Array<{ merchant_id: string; scopes: string[] }>>(
    `SELECT merchant_id, scopes FROM shop_merchant_keys
      WHERE key_hash = $1 AND revoked_at IS NULL`,
    key_hash,
  );
  if (!rows[0]) throw new ShopAuthError(401, 'invalid or revoked merchant key');
  return { merchant_id: rows[0].merchant_id, key_hash, scopes: rows[0].scopes };
}

/** express guard: requires every scope in `scopes` (403 otherwise), then rate-limits per key. */
export function requireMerchantKey(
  scopes: readonly string[],
  getDb: () => ShopTx | Promise<ShopTx>,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.merchant = await authenticateMerchantKey(await getDb(), req.headers.authorization);
    } catch (err) {
      if (err instanceof ShopAuthError) {
        res.status(err.status).json({ error: err.message });
      } else {
        res.status(503).json({ error: 'auth backend unavailable' });
      }
      return;
    }
    const have = new Set(req.merchant.scopes);
    const missing = scopes.filter((s) => !have.has(s));
    if (missing.length > 0) {
      res.status(403).json({ error: 'insufficient_scope', missing });
      return;
    }
    const isRead = req.method === 'GET' || req.method === 'HEAD';
    (isRead ? readLimiter : writeLimiter)(req, res, next);
  };
}
