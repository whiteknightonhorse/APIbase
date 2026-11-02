/** HTTP-shaped error for the shop auth layer; INT-04 routes map `status` straight to the response. */
export class ShopAuthError extends Error {
  constructor(
    readonly status: 401 | 403 | 409 | 410 | 429 | 503,
    message: string,
    readonly suggested_action?: string,
    readonly error_code?: string,
  ) {
    super(message);
    this.name = 'ShopAuthError';
  }
}
