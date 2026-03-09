import type { Request, Response, NextFunction } from 'express';
import { httpRequestsTotal, httpRequestDurationSeconds } from '../services/metrics.service';

/**
 * Express middleware: HTTP request instrumentation (§12.197, §AP-2).
 *
 * Records:
 *   - http_requests_total{method, path, status} — counter
 *   - http_request_duration_seconds{method, path} — histogram
 *
 * Path is normalized to the route pattern (e.g. /v1/tools/:toolId)
 * to prevent label cardinality explosion from dynamic segments.
 *
 * Must be registered before routes so res.on('finish') captures the status.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationNs = Number(process.hrtime.bigint() - start);
    const durationSec = durationNs / 1e9;

    // Use Express route pattern if available, otherwise raw path.
    // Limit to first two segments to keep cardinality bounded.
    const path = normalizePath(req.route?.path as string | undefined, req.path);
    const method = req.method;
    const status = String(res.statusCode);

    httpRequestsTotal.inc({ method, path, status });
    httpRequestDurationSeconds.observe({ method, path }, durationSec);
  });

  next();
}

/**
 * Normalize request path for metric labels.
 * Uses Express route pattern when available (e.g. /v1/tools/:toolId).
 * Falls back to raw path truncated to first two segments.
 */
function normalizePath(routePath: string | undefined, rawPath: string): string {
  if (routePath) {
    return routePath;
  }

  // Fallback: /v1/tools/abc123 → /v1/tools
  const segments = rawPath.split('/').filter(Boolean);
  if (segments.length <= 2) {
    return rawPath;
  }
  return '/' + segments.slice(0, 2).join('/');
}
