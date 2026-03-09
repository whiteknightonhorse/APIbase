import type { Request, Response, NextFunction } from 'express';
import { resolveRequestId, createRequestLogger } from '../config/logger';
// Global Express Request type extensions are in src/types/request.ts

/**
 * Express middleware: X-Request-ID propagation (§12.108, §12.123).
 *
 * 1. Read client-provided X-Request-ID (priority over server-generated).
 * 2. Validate / truncate to 128 chars; generate UUID if absent or invalid.
 * 3. Set response header X-Request-ID for the agent.
 * 4. Attach `req.requestId` and `req.log` (child Pino logger) for downstream.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const clientHeader = req.headers['x-request-id'];
  const clientValue = Array.isArray(clientHeader) ? clientHeader[0] : clientHeader;

  const requestId = resolveRequestId(clientValue);

  req.requestId = requestId;
  req.log = createRequestLogger(requestId);

  res.setHeader('X-Request-ID', requestId);

  next();
}
