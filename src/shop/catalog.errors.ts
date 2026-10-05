import type { SuggestedAction } from '../types/errors';

/** HTTP-shaped refusal of the catalog layer (422 validation, 404 not found, 409 open quotes). */
export class CatalogError extends Error {
  constructor(
    readonly status: 404 | 409 | 422,
    readonly error_code: string,
    message: string,
    readonly suggested_action: SuggestedAction,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CatalogError';
  }
}
