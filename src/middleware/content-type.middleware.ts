import type { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCode } from '../types/errors';

/**
 * T-0790: true when an Accept header value does not exclude JSON. Absent or empty is accepted.
 * Takes `unknown` because a request-derived value can be anything (CodeQL type-confusion rule).
 */
export function acceptsJson(accept: unknown): boolean {
  if (accept === undefined || accept === '') return true;
  if (typeof accept !== 'string') return false;
  return (
    accept.includes('application/json') ||
    accept.includes('text/event-stream') ||
    accept.includes('*/*') ||
    accept === '*'
  );
}

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
  if (!acceptsJson(req.headers.accept)) {
    throw new AppError(ErrorCode.NOT_ACCEPTABLE, 'Accept header must be application/json');
  }

  next();
}
