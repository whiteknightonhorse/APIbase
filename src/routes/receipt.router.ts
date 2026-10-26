import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { logger } from '../config/logger';
import { refundForReceipt, type PublicRefund } from '../services/refund-ledger.service';
import {
  canonicalJson,
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

/**
 * T-0551: the stored body is immutable; when a refund-owed row exists for the receipt it is merged
 * in as `refund` at read time. A failed ledger read serves the stored body unchanged.
 */
async function withRefund(
  body: string,
  id: string,
  lookup: (receiptId: string) => Promise<PublicRefund | null>,
): Promise<{ text: string; hasRefund: boolean }> {
  try {
    const refund = await lookup(id);
    if (!refund) return { text: body, hasRefund: false };
    const parsed = JSON.parse(body) as Record<string, unknown>;
    return { text: canonicalJson({ ...parsed, refund }), hasRefund: true };
  } catch (err) {
    logger.error({ err, receipt_id: id }, 'receipt: refund lookup failed, serving stored body');
    return { text: body, hasRefund: false };
  }
}

export function createReceiptRouter(
  store: ReceiptStore = pgReceiptStore,
  refunds: (receiptId: string) => Promise<PublicRefund | null> = (id) => refundForReceipt(id),
): Router {
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
    const out = await withRefund(body, id as string, refunds);
    res.setHeader('Content-Type', 'application/json');
    // A receipt with a refund object changes as the refund moves owed -> sent: not immutable.
    res.setHeader(
      'Cache-Control',
      out.hasRefund ? 'public, max-age=60' : 'public, max-age=31536000, immutable',
    );
    res.status(200).send(Buffer.from(out.text, 'utf8'));
  });

  return router;
}
