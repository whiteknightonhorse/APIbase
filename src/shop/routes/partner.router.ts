/**
 * T-0739 (SOUKBASE-A16-1109 ruling-1 A-1): partner handoff routes, authenticated by the partner's
 * `pk_live_` key (sha256 in config/integrator/partners.json). Never logs the key, the prefill or the wallet.
 */
import { timingSafeEqual } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { hashApiKey } from '../../services/api-key.service';
import { decryptSecret } from '../../services/secret-crypto.service';
import { config } from '../../config';
import { logger } from '../../config/logger';
import type { ShopTx } from '../db';
import { limiter, PROBE_LIMIT_PER_MIN } from './address-limiter';
import { partners as registry, type Partner } from './integrator.router';
import {
  createHandoff,
  HandoffValidationError,
  readHandoff,
  validateHandoffInput,
} from '../partner/handoff.service';

declare module 'express-serve-static-core' {
  interface Request {
    partner?: { id: string; name: string; return_url: string };
  }
}

const DOC = '/integrator/docs#partner-handoff';
const KEY_RE = /^Bearer (pk_live_[0-9a-f]{32})$/;

const err = (res: Response, status: number, code: string, message: string, extra: object = {}) =>
  res.status(status).json({
    error: code,
    error_code: code,
    message,
    suggested_action: 'fix_request',
    documentation_url: DOC,
    ...extra,
  });

/** Key of the per-key limiters: the sha256 of the presented key (never the key itself). */
const keyOf = (req: Request): string => {
  const h: unknown = req.headers.authorization;
  return typeof h === 'string' && h.length <= 128 ? `pk:${hashApiKey(h)}` : `ip:${req.ip ?? ''}`;
};

/** `Authorization: Bearer pk_live_<32hex>` -> sha256 -> registry entry. Malformed or unknown = 401 partner_key_invalid. */
export function requirePartnerKey(list: () => readonly Partner[] = registry) {
  return (req: Request, res: Response, next: NextFunction) => {
    const h: unknown = req.headers.authorization;
    const m = typeof h === 'string' ? KEY_RE.exec(h) : null;
    const hash = m ? Buffer.from(hashApiKey(m[1]), 'hex') : null;
    const p = hash
      ? list().find((x) => timingSafeEqual(Buffer.from(x.key_sha256, 'hex'), hash))
      : undefined;
    if (!p) {
      err(res, 401, 'partner_key_invalid', 'a valid partner key is required (Bearer pk_live_...)');
      return;
    }
    req.partner = { id: p.id, name: p.name, return_url: p.return_url };
    next();
  };
}

export interface PartnerRouterOptions {
  db?: ShopTx;
  partners?: () => readonly Partner[];
  /** T-0740: key of the parked grant keys (default: config.ENCRYPTION_KEY). */
  encryptionKey?: string;
}

const lazyDb = (): ShopTx => {
  const prisma = async () => (await import('../../services/prisma.service')).getPrisma();
  return {
    $queryRawUnsafe: async (q, ...v) => (await prisma()).$queryRawUnsafe(q, ...v),
    $executeRawUnsafe: async (q, ...v) => (await prisma()).$executeRawUnsafe(q, ...v),
  };
};

export function createPartnerRouter(opts: PartnerRouterOptions = {}): Router {
  const router = Router();
  const db = opts.db ?? lazyDb();
  // T-0740: the partner's grant key is parked encrypted on the handoff; decrypted for that one answer only.
  const decryptKey = (enc: string): string =>
    decryptSecret(enc, opts.encryptionKey ?? config.ENCRYPTION_KEY);
  const guard = requirePartnerKey(opts.partners);
  // CodeQL js/missing-rate-limiting: the per-address failure limiter caps key probing; the per-key
  // limiters (keyed by the key hash) cap a partner's own traffic. Both run before the guard.
  const probeLimiter = limiter(60_000, PROBE_LIMIT_PER_MIN, { skipSuccessfulRequests: true });
  const createLimiter = limiter(60_000, 60, { keyGenerator: keyOf });
  const readLimiter = limiter(60_000, 600, { keyGenerator: keyOf });

  router.post(
    '/api/v1/shop/partners/handoffs',
    probeLimiter,
    createLimiter,
    guard,
    async (req: Request, res: Response) => {
      try {
        const input = validateHandoffInput(req.body);
        res.status(201).json(await createHandoff(db, req.partner?.id ?? '', input));
      } catch (e) {
        if (e instanceof HandoffValidationError) {
          err(res, 422, 'validation_failed', `${e.field} is invalid`, { field: e.field });
          return;
        }
        logger.error({ err: e, partner: req.partner?.id }, 'partner handoff create failed');
        res.status(500).json({ error: 'internal_error', error_code: 'internal_error' });
      }
    },
  );

  router.get(
    '/api/v1/shop/partners/handoffs/:id',
    probeLimiter,
    readLimiter,
    guard,
    async (req: Request, res: Response) => {
      try {
        const h = await readHandoff(db, req.partner?.id ?? '', req.params.id, decryptKey);
        if (!h) {
          err(res, 404, 'not_found', 'no such handoff for this partner');
          return;
        }
        res.json(h);
      } catch (e) {
        logger.error({ err: e, partner: req.partner?.id }, 'partner handoff read failed');
        res.status(500).json({ error: 'internal_error', error_code: 'internal_error' });
      }
    },
  );

  return router;
}
