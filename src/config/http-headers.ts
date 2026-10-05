/**
 * Platform HTTP header name constants (2026-09-01, F1 follow-up).
 *
 * Root cause of a live regression: idempotency.stage.ts read
 * ctx.headers['idempotency-key'] while BOTH real callers (execute.router.ts,
 * batch.service.ts) wrote 'x-idempotency-key' -- two independent string
 * literals silently drifted apart, and nothing caught it until a client's
 * retry double-charged.
 *
 * Every custom (`x-*`) header this platform reads or writes lives here ONCE,
 * so a rename or typo can no longer disagree with itself. Enforced by
 * eslint.config.mjs's no-restricted-syntax rule: any `x-*`-shaped string
 * literal outside this file (and outside src/adapters/, where each
 * provider's OWN vendor header is a one-off constant that only that single
 * adapter ever reads -- not a name two independent files must agree on)
 * fails lint.
 */

export const X_REQUEST_ID = 'x-request-id';
export const X_IDEMPOTENCY_KEY = 'x-idempotency-key';
export const X_PAYMENT = 'x-payment';
export const X_API_KEY = 'x-api-key';
export const X_AGENT_NAME = 'x-agent-name';
export const X_CACHE = 'x-cache';
export const X_ROBOTS_TAG = 'x-robots-tag';
export const X_POWERED_BY = 'x-powered-by';
export const X_RATELIMIT_LIMIT = 'x-ratelimit-limit';
export const X_RATELIMIT_REMAINING = 'x-ratelimit-remaining';
export const X_RATELIMIT_RESET = 'x-ratelimit-reset';

// x402 spec's own header name, not one of ours -- but every call site that
// resolves the x-payment/payment-signature alias pair belongs here too, so a
// third one can't silently check only one of the two again (T-0187B2).
export const PAYMENT_SIGNATURE = 'payment-signature';

export function resolveX402PaymentHeader(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  const value = headers[X_PAYMENT] ?? headers[PAYMENT_SIGNATURE];
  return Array.isArray(value) ? value[0] : value;
}

// Outbound merchant webhooks (T-INT-14, F-6). Written to a merchant's receiver, never read here.
export const X_APIBASE_EVENT = 'X-APIbase-Event';
export const X_APIBASE_DELIVERY_ID = 'X-APIbase-Delivery-Id';
export const X_APIBASE_SIGNATURE = 'X-APIbase-Signature';
