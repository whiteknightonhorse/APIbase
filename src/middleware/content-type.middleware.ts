import type { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCode } from '../types/errors';

/**
 * JSON-only content negotiation (§12.112, §6.1).
 *
 * Agent-first API: all responses are application/json.
 * Rejects requests with Accept headers that exclude JSON.
 */
export function contentTypeMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Always respond with JSON
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  // Check Accept header — reject if it explicitly excludes JSON
  const accept = req.headers.accept;
  if (accept && !accept.includes('application/json') && !accept.includes('text/event-stream') && !accept.includes('*/*') && accept !== '*') {
    throw new AppError(ErrorCode.NOT_ACCEPTABLE, 'Accept header must be application/json');
  }

  next();
}
