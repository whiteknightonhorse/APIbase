import type { Request, Response, NextFunction } from 'express';
import {
  AppError,
  ErrorCode,
  ErrorHttpStatus,
  SuggestedActionByStatus,
  type ApiErrorResponse,
} from '../types/errors';
import { logger } from '../config/logger';

const DOCS_URL = 'https://apibase.pro/frameworks#rest';

/**
 * Global error handler (§12.243).
 *
 * Catches all errors and returns structured JSON — never HTML.
 * Must be registered LAST in the middleware chain.
 */
export function errorHandlerMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.requestId ?? 'unknown';

  if (err instanceof AppError) {
    const body: ApiErrorResponse = {
      error: err.code,
      error_code: err.code.toUpperCase(),
      message: err.message,
      request_id: requestId,
      suggested_action: SuggestedActionByStatus[err.httpStatus] ?? 'contact_support',
      documentation_url: DOCS_URL,
    };

    if (err.retryAfter !== undefined) {
      body.retry_after = err.retryAfter;
      res.setHeader('Retry-After', String(err.retryAfter));
    }

    if (err.httpStatus >= 500) {
      (req.log ?? logger).error({ err, status: err.httpStatus }, err.message);
    } else {
      (req.log ?? logger).warn({ status: err.httpStatus, code: err.code }, err.message);
    }

    res.status(err.httpStatus).json(body);
    return;
  }

  // JSON body parse error — 400 (malformed request body)
  if (err instanceof SyntaxError && 'body' in err) {
    (req.log ?? logger).warn({ status: 400, code: ErrorCode.BAD_REQUEST }, 'Malformed JSON body');
    const parseBody: ApiErrorResponse = {
      error: ErrorCode.BAD_REQUEST,
      error_code: 'BAD_REQUEST',
      message: 'Malformed JSON in request body',
      request_id: requestId,
      suggested_action: 'fix_request',
      documentation_url: DOCS_URL,
    };
    res.status(400).json(parseBody);
    return;
  }

  // Unexpected error — 500 (§12.166)
  (req.log ?? logger).error({ err }, 'Unhandled error');

  const body: ApiErrorResponse = {
    error: ErrorCode.INTERNAL_ERROR,
    error_code: 'INTERNAL_ERROR',
    message: 'Unexpected server error',
    request_id: requestId,
    suggested_action: 'contact_support',
    documentation_url: DOCS_URL,
  };

  res.status(ErrorHttpStatus[ErrorCode.INTERNAL_ERROR]).json(body);
}
