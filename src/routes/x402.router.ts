import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyMessage } from 'viem';
import { X_PAYER_ADDRESS, X_PAYER_SIGNATURE } from '../config/http-headers';
import { logger } from '../config/logger';
import {
  pgReceiptStore,
  RECEIPT_ID_RE,
  resultKey,
  type ReceiptStore,
} from '../services/public-receipt.service';

/**
 * T-0554: GET /x402/retrieve/<receipt_id> -- the payer fetches the result of a paid call for 24 h.
 * Auth: EIP-191 personal_sign by the payer wallet over `apibase-retrieve:<receipt_id>:<unix minute>`
 * (current or previous minute). Free: this route never charges, never touches escrow and never issues
 * a receipt.
 */
const retrieveLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate limited' },
});

const RETRIEVE_SIG_RE = /^0x[0-9a-fA-F]{130}$/;
const ADDR_RE = /^0x[0-9a-f]{40}$/;

export function retrieveMessage(receiptId: string, minute: number): string {
  return `apibase-retrieve:${receiptId}:${minute}`;
}

export interface ResultReader {
  get(receiptId: string): Promise<string | null>;
}

const redisResultReader: ResultReader = {
  async get(receiptId) {
    const { ensureRedisConnected } = await import('../services/redis.service');
    const r = await ensureRedisConnected();
    return r.get(resultKey(receiptId));
  },
};

export type SignatureVerifier = (a: {
  address: `0x${string}`;
  message: string;
  signature: `0x${string}`;
}) => Promise<boolean>;

const defaultVerifier: SignatureVerifier = (a) => verifyMessage(a);

function header(req: Request, name: string): string | null {
  const v: unknown = req.headers[name];
  return typeof v === 'string' ? v : null;
}

function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: code, message });
}

export function createX402Router(
  receipts: ReceiptStore = pgReceiptStore,
  results: ResultReader = redisResultReader,
  verify: SignatureVerifier = defaultVerifier,
  now: () => number = Date.now,
): Router {
  const router = Router();

  router.get(
    '/x402/retrieve/:receiptId',
    retrieveLimiter,
    async (req: Request, res: Response): Promise<void> => {
      res.setHeader('Cache-Control', 'no-store');
      const id: unknown = req.params.receiptId;
      if (typeof id !== 'string' || !RECEIPT_ID_RE.test(id)) {
        fail(res, 404, 'not_found', 'Receipt not found');
        return;
      }
      let receipt: Record<string, unknown> | null = null;
      try {
        const raw = await receipts.get(id);
        receipt = raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
      } catch (err) {
        logger.error({ err, receipt_id: id }, 'retrieve: receipt lookup failed');
        fail(res, 503, 'retrieve_unavailable', 'receipt store unavailable');
        return;
      }
      if (!receipt) {
        fail(res, 404, 'not_found', 'Receipt not found');
        return;
      }

      const payer = typeof receipt.payer === 'string' ? receipt.payer.toLowerCase() : '';
      const addrHeader = header(req, X_PAYER_ADDRESS);
      const sig = header(req, X_PAYER_SIGNATURE);
      if (!ADDR_RE.test(payer) || addrHeader === null || addrHeader.toLowerCase() !== payer) {
        fail(res, 401, 'retrieve_signature_invalid', 'X-Payer-Address must be the receipt payer');
        return;
      }
      if (sig === null || !RETRIEVE_SIG_RE.test(sig)) {
        if (receipt.rail === 'mpp-tempo' && sig !== null) {
          fail(
            res,
            401,
            'retrieve_unsupported_key',
            'only secp256k1 (EIP-191) signatures are supported',
          );
        } else {
          fail(res, 401, 'retrieve_signature_invalid', 'X-Payer-Signature missing or malformed');
        }
        return;
      }
      const minute = Math.floor(now() / 60_000);
      let ok = false;
      for (const m of [minute, minute - 1]) {
        try {
          if (
            await verify({
              address: payer as `0x${string}`,
              message: retrieveMessage(id, m),
              signature: sig as `0x${string}`,
            })
          ) {
            ok = true;
            break;
          }
        } catch {
          // a malformed signature is simply not valid
        }
      }
      if (!ok) {
        fail(res, 401, 'retrieve_signature_invalid', 'signature does not match the receipt payer');
        return;
      }

      let stored: string | null;
      try {
        stored = await results.get(id);
      } catch (err) {
        logger.error({ err, receipt_id: id }, 'retrieve: result store lookup failed');
        fail(res, 503, 'retrieve_unavailable', 'result store unavailable');
        return;
      }
      if (stored === null) {
        res.status(410).json({
          receipt_id: id,
          status: 'delivered',
          result_retained_until: receipt.result_retained_until ?? null,
          response_sha256: receipt.response_sha256,
          message:
            'the result was retained for 24 hours after delivery; the receipt proves what was delivered',
        });
        return;
      }
      let result: unknown = stored;
      try {
        result = JSON.parse(stored);
      } catch {
        // non-JSON body is returned as the stored string
      }
      res.status(200).json({
        receipt_id: id,
        status: 'delivered',
        charged: false,
        upstream_status: receipt.upstream_status,
        response_sha256: receipt.response_sha256,
        result,
      });
    },
  );

  return router;
}

export const x402Router = createX402Router();
