import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { logger } from '../config/logger';
import { refundForReceipt, type PublicRefund } from '../services/refund-ledger.service';
import {
  canonicalJson,
  executionIdFromReceiptId,
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

/** T-0596: the settle state of a pending receipt, read from the ledger by execution id. */
export interface PendingSettle {
  state: 'settled' | 'pending' | 'failed';
  tx?: string;
}

export async function ledgerPendingSettle(receiptId: string): Promise<PendingSettle> {
  const { getPrisma } = await import('../services/prisma.service');
  const rows = (await getPrisma().$queryRawUnsafe(
    `SELECT x402_settle_state, settle_tx_hash, x402_onchain_settled FROM execution_ledger
      WHERE execution_id = $1::uuid LIMIT 1`,
    executionIdFromReceiptId(receiptId),
  )) as Array<{
    x402_settle_state: string | null;
    settle_tx_hash: string | null;
    x402_onchain_settled: boolean | null;
  }>;
  const r = rows[0];
  if (!r) return { state: 'pending' };
  if (r.x402_settle_state === 'settled' && r.settle_tx_hash) {
    return { state: 'settled', tx: r.settle_tx_hash.toLowerCase() };
  }
  if (r.x402_settle_state === 'pending') return { state: 'pending' };
  return { state: 'failed' };
}

/**
 * T-0596: a stored body with status 'pending' is write-once; the final state is merged in at read
 * time. settled -> payment_tx set, status dropped; failed -> status 'failed'; pending -> unchanged.
 */
async function withSettle(
  body: string,
  id: string,
  lookup: (receiptId: string) => Promise<PendingSettle>,
): Promise<{ text: string; final: boolean }> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return { text: body, final: true };
  }
  if (parsed.status !== 'pending') return { text: body, final: true };
  try {
    const r = await lookup(id);
    if (r.state === 'settled' && r.tx) {
      const { status: _s, ...rest } = parsed;
      return { text: canonicalJson({ ...rest, payment_tx: r.tx }), final: true };
    }
    if (r.state === 'failed')
      return { text: canonicalJson({ ...parsed, status: 'failed' }), final: false };
  } catch (err) {
    logger.error({ err, receipt_id: id }, 'receipt: settle lookup failed, serving pending body');
  }
  return { text: body, final: false };
}

export function createReceiptRouter(
  store: ReceiptStore = pgReceiptStore,
  refunds: (receiptId: string) => Promise<PublicRefund | null> = (id) => refundForReceipt(id),
  settles: (receiptId: string) => Promise<PendingSettle> = ledgerPendingSettle,
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
    const settled = await withSettle(body, id as string, settles);
    const out = await withRefund(settled.text, id as string, refunds);
    res.setHeader('Content-Type', 'application/json');
    // A receipt with a refund object changes as the refund moves owed -> sent: not immutable.
    res.setHeader(
      'Cache-Control',
      out.hasRefund || !settled.final
        ? 'public, max-age=60'
        : 'public, max-age=31536000, immutable',
    );
    res.status(200).send(Buffer.from(out.text, 'utf8'));
  });

  return router;
}
