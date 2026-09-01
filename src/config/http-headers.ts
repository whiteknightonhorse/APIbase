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
export const X_POWERED_BY = 'x-powered-by';
export const X_RATELIMIT_LIMIT = 'x-ratelimit-limit';
export const X_RATELIMIT_REMAINING = 'x-ratelimit-remaining';
export const X_RATELIMIT_RESET = 'x-ratelimit-reset';
