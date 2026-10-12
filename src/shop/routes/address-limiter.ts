import rateLimit, { type Options } from 'express-rate-limit';

export const PROBE_LIMIT_PER_MIN = 100;

export const limiter = (windowMs: number, limit: number, extra: Partial<Options> = {}) =>
  rateLimit({
    windowMs,
    limit,
    ...extra,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: 'rate_limited',
        error_code: 'rate_limited',
        message: 'too many requests from this address',
        suggested_action: 'retry_after_delay',
        documentation_url: '/integrator/docs#registration--terms',
      });
    },
  });
