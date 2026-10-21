import type { Request, Response, NextFunction } from 'express';
import { decodePaymentSignatureHeader, encodePaymentSignatureHeader } from '@x402/core/http';
import type { PaymentPayload } from '@x402/core/types';
import { parsePaymentPayload } from '@x402/core/schemas';
import { getX402Config, toMicroUsdc } from '../config/x402.config';
import { logger } from '../config/logger';
import { AppError, ErrorCode } from '../types/errors';
import { resolveX402PaymentHeader, X_PAYMENT } from '../config/http-headers';

/**
 * x402 MCP transport v2 (specs/transports-v2): the payment payload rides in the JSON-RPC
 * `params._meta` of a tools/call under this key (constants of @x402/mcp 2.28, not imported at
 * runtime: dev dependency only). The settlement receipt comes back under the response key.
 */
export const MCP_PAYMENT_META_KEY = 'x402/payment';
export const MCP_PAYMENT_RESPONSE_META_KEY = 'x402/payment-response';
export const MCP_PAYMENT_REQUIRED_META_KEY = 'x402/payment-required';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Python/Go clients serialize unset optionals as explicit null (2.18): drop them before parsing.
 * Object.fromEntries defines own data properties (CreateDataProperty), so a client-supplied
 * `__proto__` / `constructor` key never reaches the prototype setter (CodeQL js/remote-property-injection).
 */
export function stripNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripNulls);
  if (!isRecord(v)) return v;
  return Object.fromEntries(
    Object.entries(v)
      .filter(([, val]) => val !== null)
      .map(([k, val]) => [k, stripNulls(val)]),
  );
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (!isRecord(v)) return JSON.stringify(v) ?? 'null';
  return `{${Object.keys(v)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
    .join(',')}}`;
}

/** The `_meta` x402 payment of the first tools/call in a JSON-RPC body (single or batch), if any. */
function metaPaymentFromBody(body: unknown): unknown {
  const messages: unknown[] = Array.isArray(body) ? body : [body];
  for (const m of messages) {
    if (!isRecord(m) || m.method !== 'tools/call' || !isRecord(m.params)) continue;
    const meta = m.params._meta;
    if (isRecord(meta) && meta[MCP_PAYMENT_META_KEY] !== undefined) {
      return meta[MCP_PAYMENT_META_KEY];
    }
  }
  return undefined;
}

/**
 * T-0429: header first, `_meta` second. With no header the `_meta` payload is re-encoded as the
 * X-Payment value so every downstream stage (ESCROW binding included) sees one representation.
 * Both present and different -> 400. Only POST /mcp and /messages carry JSON-RPC.
 */
function reconcileMetaPayment(req: Request): void {
  if (req.method !== 'POST' || (req.path !== '/mcp' && req.path !== '/messages')) return;
  const raw = metaPaymentFromBody(req.body);
  if (raw === undefined) return;
  if (!isRecord(raw)) {
    throw new AppError(ErrorCode.BAD_REQUEST, 'Invalid x402 payment in _meta');
  }
  const meta = stripNulls(raw);
  const header = resolveX402PaymentHeader(req.headers);
  if (header === undefined) {
    req.headers[X_PAYMENT] = encodePaymentSignatureHeader(meta as unknown as PaymentPayload);
    return;
  }
  let decoded: unknown;
  try {
    decoded = decodePaymentSignatureHeader(header);
  } catch {
    throw new AppError(ErrorCode.BAD_REQUEST, 'Invalid x402 payment header');
  }
  if (canonical(stripNulls(decoded)) !== canonical(meta)) {
    throw new AppError(
      ErrorCode.BAD_REQUEST,
      'x402 payment sent in both the X-Payment header and params._meta with different payloads; send it in exactly one place.',
    );
  }
}

export function x402Middleware(req: Request, _res: Response, next: NextFunction): void {
  try {
    reconcileMetaPayment(req);
  } catch (err) {
    next(err);
    return;
  }
  const paymentHeader = resolveX402PaymentHeader(req.headers);

  if (paymentHeader === undefined) {
    next();
    return;
  }
  if (paymentHeader.trim() === '') {
    next(new AppError(ErrorCode.BAD_REQUEST, 'X-Payment header must not be empty'));
    return;
  }

  verifyPayment(req, paymentHeader)
    .then(() => next())
    .catch(next);
}

async function verifyPayment(req: Request, paymentHeader: string): Promise<void> {
  const log = req.log ?? logger;

  let decoded: unknown;
  try {
    decoded = decodePaymentSignatureHeader(paymentHeader);
  } catch {
    log.warn({ requestId: req.requestId }, 'x402: failed to decode payment header');
    throw new AppError(ErrorCode.BAD_REQUEST, 'Invalid x402 payment header');
  }

  const parsed = parsePaymentPayload(decoded);
  if (!parsed.success) {
    log.warn(
      { requestId: req.requestId, errors: parsed.error.issues },
      'x402: payment payload validation failed',
    );
    throw new AppError(ErrorCode.BAD_REQUEST, 'Invalid x402 payment payload');
  }

  // STRUCTURAL VALIDATION ONLY. The authoritative payment binding — verifying
  // the signed authorization against SERVER-trusted requirements (payTo, asset,
  // network, and the tool's REAL price) — happens in the ESCROW pipeline stage,
  // the only place the per-tool price is known (the /mcp toolId lives in the
  // JSON-RPC body, not the URL). Verifying here against the client-supplied
  // `payload.accepted` is exactly the bypass reported in issue #103, so we do
  // NOT do it. `verified` below means "payment intent present & well-formed",
  // NOT "cryptographically bound" — ESCROW makes the money decision and sets
  // the real payer.
  req.x402Payment = {
    verified: true,
    payer: 'pending',
    amount: '0',
    network: '',
    scheme: 'exact',
  };

  log.info(
    { requestId: req.requestId },
    'x402: payment header accepted (binding enforced in ESCROW)',
  );
}

/**
 * The one place `/api/v1/tools/${toolId}/call` is templated (T-0187B3): every
 * real 402's resource.url must name the absolute URL that, called again,
 * produces the identical challenge — not a relative/non-callable stand-in.
 */
export function toolCallResourceUrl(host: string, toolId: string): string {
  return `https://${host}/api/v1/tools/${toolId}/call`;
}

export function buildPaymentRequiredResponse(
  toolId: string,
  priceUsd: number,
  priceVersion: number,
  requestId: string,
  host: string,
): Record<string, unknown> {
  const cfg = getX402Config();
  return {
    x402Version: 2,
    error: 'payment_required',
    resource: {
      url: toolCallResourceUrl(host, toolId),
      mimeType: 'application/json',
      description: `Tool invocation: ${toolId}`,
    },
    accepts: [
      {
        scheme: 'exact',
        network: cfg.network,
        amount: toMicroUsdc(priceUsd),
        asset: cfg.usdcAddress,
        payTo: cfg.paymentAddress,
        maxTimeoutSeconds: cfg.maxTimeoutSeconds,
        extra: { name: 'USD Coin', version: '2' },
      },
    ],
    request_id: requestId,
    error_code: 'PAYMENT_REQUIRED',
    suggested_action: 'add_payment',
    documentation_url: 'https://apibase.pro/frameworks#rest',
    price_usd: String(priceUsd),
    /**
     * Minimum on-chain USDC balance an agent should hold to call this tool
     * successfully. Equals price_usd today (cache-hit pays full sticker via
     * payment rail; cache discount applies only to balance-tier agents).
     * Agents can short-circuit signing if their wallet balance < this value.
     */
    min_balance_usd: String(priceUsd),
    payment_address: cfg.paymentAddress,
    price_version: priceVersion,
  };
}
