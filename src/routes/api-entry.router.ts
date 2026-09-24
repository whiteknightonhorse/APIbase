import { Router, type Request, type Response, type NextFunction } from 'express';
import { encodePaymentRequiredHeader } from '@x402/core/http';
import type { PaymentRequired } from '@x402/core/types';
import { getToolPriceUsd } from '../pipeline/stages/tool-status.stage';
import { buildPaymentRequiredResponse } from '../middleware/x402.middleware';
import { buildMppChallengeHeader } from '../middleware/mpp.middleware';
import { AppError, ErrorCode } from '../types/errors';
import { resolveX402PaymentHeader } from '../config/http-headers';

/**
 * T-0187A (taskloop 0187 ruling-1, §1): `GET /api` and `GET /api/v1` used to be two static
 * nginx `return 402` literals — hand-typed base64, x402Version 1, pointing at a tool
 * (`coingecko.get_price`) that doesn't exist, at a price that had drifted from the real one.
 * That's why isitagentready.com's scanner read it as neutral rather than pass. Moving the
 * marker here means it's built by the exact same function (`buildPaymentRequiredResponse`)
 * that produces every real 402 the pipeline emits, against a tool id and price this process
 * actually has seeded — it can't go stale independently of the catalog again.
 */
const ENTRY_MARKER_TOOL_ID = 'coingecko.get_market';

export const apiEntryRouter = Router();

async function handleEntryMarker(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const paymentHeader = resolveX402PaymentHeader(req.headers);

    if (paymentHeader !== undefined) {
      // This location is a discovery signal, not a payable resource — the SDK's own
      // "request -> 402 -> pay resource.url -> retry" cycle would otherwise dead-end here.
      throw new AppError(
        ErrorCode.BAD_REQUEST,
        `Not a payable resource — pay at the resource.url from this endpoint's 402 response, i.e. POST /api/v1/tools/${ENTRY_MARKER_TOOL_ID}/call`,
      );
    }

    const priceUsd = getToolPriceUsd(ENTRY_MARKER_TOOL_ID);
    if (priceUsd === undefined) {
      throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'Entry-point marker tool unavailable');
    }

    const requestId = req.requestId ?? 'unknown';
    const host = req.get('host') ?? '';
    const body = buildPaymentRequiredResponse(ENTRY_MARKER_TOOL_ID, priceUsd, 1, requestId, host);
    const resource = body.resource as { url: string; description: string };
    resource.description =
      `Entry point: every APIbase tool is pay-per-call. Terms shown here are for ` +
      `${ENTRY_MARKER_TOOL_ID} as a worked example — full catalog at https://${host}/api/v1/tools.`;

    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader(
      'PAYMENT-REQUIRED',
      encodePaymentRequiredHeader(body as unknown as PaymentRequired),
    );

    const mppHeader = await buildMppChallengeHeader(
      ENTRY_MARKER_TOOL_ID,
      priceUsd,
      `https://${host}${req.originalUrl}`,
    );
    if (mppHeader) {
      res.setHeader('WWW-Authenticate', mppHeader);
    }

    res.status(402).json(body);
  } catch (err) {
    next(err);
  }
}

apiEntryRouter.get('/api', handleEntryMarker);
apiEntryRouter.get('/api/v1', handleEntryMarker);
