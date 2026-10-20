import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { logger } from '../config/logger';
import {
  pgReceiptStore,
  RECEIPT_ID_RE,
  type ReceiptStore,
} from '../services/public-receipt.service';

/**
 * A-GA-01: GET /r/<receipt_id>.json -- public, read-only, immutable receipts (apibase-receipt/1).
 * Validators fetch each receipt several times per minute; responses are immutable and CDN-cacheable.
 * There is no write route: receipts are inserted by the pipeline callers only.
 */
const receiptLimiter = rateLimit({
  windowMs: 60_000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate limited' },
});

/** The id from `<id>.json`, or null for anything that is not a well-formed receipt filename. */
export function parseReceiptFile(file: unknown): string | null {
  if (typeof file !== 'string' || !file.endsWith('.json')) return null;
  const id = file.slice(0, -'.json'.length);
  return RECEIPT_ID_RE.test(id) ? id : null;
}

export function createReceiptRouter(store: ReceiptStore = pgReceiptStore): Router {
  const router = Router();

  router.get('/r/:file', receiptLimiter, async (req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const id = parseReceiptFile(req.params.file);
    let body: string | null = null;
    if (id) {
      try {
        body = await store.get(id);
      } catch (err) {
        logger.error({ err }, 'receipt: lookup failed');
        res.setHeader('Cache-Control', 'no-store');
        res.status(503).json({ error: 'receipt store unavailable' });
        return;
      }
    }
    if (body === null) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(404).json({ error: 'no such receipt' });
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.status(200).send(Buffer.from(body, 'utf8'));
  });

  return router;
}
