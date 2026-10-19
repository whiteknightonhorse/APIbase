import type { Request, Response, NextFunction } from 'express';

/**
 * Every 402 we emit carries `Cache-Control: no-store` (x402 SDK 2.21 convention): a payment
 * challenge is per-request state and must never be served from a shared cache. Hooked at
 * writeHead so it covers x402, MPP, shop and /mcp 402s without touching each emitter.
 */
export function no402CacheMiddleware(_req: Request, res: Response, next: NextFunction): void {
  const originalWriteHead = res.writeHead as (...args: unknown[]) => Response;
  res.writeHead = function patchedWriteHead(this: Response, ...args: unknown[]): Response {
    const status = typeof args[0] === 'number' ? args[0] : this.statusCode;
    if (status === 402 && !this.headersSent) {
      this.setHeader('Cache-Control', 'no-store');
    }
    return originalWriteHead.apply(this, args);
  } as typeof res.writeHead;
  next();
}
