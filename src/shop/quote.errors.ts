import type { SuggestedAction } from '../types/errors';

/** HTTP-shaped refusal of the quote layer (404/409/410/422/429); `extra` is merged into the body. */
export class QuoteError extends Error {
  constructor(
    readonly status: 404 | 409 | 410 | 422 | 429,
    readonly error_code: string,
    message: string,
    readonly suggested_action: SuggestedAction,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'QuoteError';
  }
}
