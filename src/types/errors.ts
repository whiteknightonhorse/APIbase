/**
 * API Error Codes Registry (§12.243).
 * All API errors return JSON — never HTML.
 */

export const ErrorCode = {
  BAD_REQUEST: 'bad_request',
  SCHEMA_VALIDATION_FAILED: 'schema_validation_failed',
  UNAUTHORIZED: 'unauthorized',
  PAYMENT_REQUIRED: 'payment_required',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  NOT_ACCEPTABLE: 'not_acceptable',
  CONFLICT: 'conflict',
  API_VERSION_SUNSET: 'api_version_sunset',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  INTERNAL_ERROR: 'internal_error',
  BAD_GATEWAY: 'bad_gateway',
  PROVIDER_UNAVAILABLE: 'provider_unavailable',
  SERVICE_UNAVAILABLE: 'service_unavailable',
  GATEWAY_TIMEOUT: 'gateway_timeout',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Standard error response body (§12.243). */
export interface ApiErrorResponse {
  error: ErrorCodeValue;
  message: string;
  request_id: string;
  retry_after?: number;
  price_usd?: string;
  payment_address?: string;
  price_version?: number;
}

/** Map error codes to their default HTTP status. */
export const ErrorHttpStatus: Record<ErrorCodeValue, number> = {
  [ErrorCode.BAD_REQUEST]: 400,
  [ErrorCode.SCHEMA_VALIDATION_FAILED]: 400,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.PAYMENT_REQUIRED]: 402,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.NOT_ACCEPTABLE]: 406,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.API_VERSION_SUNSET]: 410,
  [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.BAD_GATEWAY]: 502,
  [ErrorCode.PROVIDER_UNAVAILABLE]: 503,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.GATEWAY_TIMEOUT]: 504,
};

/**
 * Operational error with structured code and HTTP status.
 * Thrown in pipeline stages, caught by the error handler middleware.
 */
export class AppError extends Error {
  public readonly code: ErrorCodeValue;
  public readonly httpStatus: number;
  public readonly retryAfter?: number;

  constructor(code: ErrorCodeValue, message: string, retryAfter?: number) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = ErrorHttpStatus[code];
    this.retryAfter = retryAfter;
  }
}
