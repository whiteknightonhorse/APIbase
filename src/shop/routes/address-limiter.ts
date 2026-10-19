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
    handler: (req, res) => {
      const resetTime = (req as { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
      const retry_after = resetTime
        ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
        : Math.ceil(windowMs / 1000);
      res.status(429).json({
        error: 'rate_limited',
        error_code: 'rate_limited',
        message: 'too many requests from this address',
        suggested_action: 'retry_after_delay',
        retry_after,
        documentation_url: '/integrator/docs#registration--terms',
      });
    },
  });
