import type { ServerResponse } from 'node:http';
import { decodePaymentSignatureHeader } from '@x402/core/http';
import * as client from 'prom-client';
import { logger } from '../config/logger';
import type { PipelineContext } from './types';

/** T-0662: x402 calls recorded NOT_CHARGED, by reason (client_disconnected). */
export const x402NotChargedTotal = new client.Counter({
  name: 'x402_not_charged_total',
  help: 'x402 calls recorded NOT_CHARGED, by reason',
  labelNames: ['reason'] as const,
});

/**
 * T-0662 (REFUND-WALLET-1026 ruling-3 section 1): record that the client connection closed before the
 * result was written (gateway 504 after the nginx deadline, client timeout). ESCROW_FINALIZE reads
 * the flag and does not settle an x402 authorization nobody received a result for. This is the one
 * and only setter; REST and MCP both call it.
 */
export function watchClientDisconnect(
  res: Pick<ServerResponse, 'writableFinished' | 'once'>,
  ctx: Pick<PipelineContext, 'clientDisconnected'>,
): void {
  if (typeof res?.once !== 'function') return; // hand-built response doubles in tests
  // The RESPONSE 'close' event, not req: on Node 20 IncomingMessage emits 'close' as soon as the
  // request body is consumed, long before any result is written.
  res.once('close', () => {
    if (!res.writableFinished) ctx.clientDisconnected = true;
  });
}

function nonceOf(auth: unknown): string | null {
  const n = (auth as { nonce?: unknown } | undefined)?.nonce;
  return typeof n === 'string' || typeof n === 'number' ? String(n) : null;
}

/**
 * Give back the replay-guard claims (key format = payment-nonce.service) of an authorization that
 * was never submitted on-chain, so the payer may present it again. Best effort, never throws.
 */
export async function releaseX402NonceClaims(ctx: PipelineContext): Promise<void> {
  try {
    if (!ctx.x402PaymentHeader) return;
    const decoded = decodePaymentSignatureHeader(ctx.x402PaymentHeader) as unknown as {
      payload?: Record<string, unknown>;
    };
    const p = decoded?.payload;
    if (!p || typeof p !== 'object') return;
    const nonces = [
      nonceOf(p.authorization ?? p.permit2Authorization),
      nonceOf((p.feeAuthorization as { authorization?: unknown } | undefined)?.authorization),
    ].filter((n): n is string => n !== null);
    if (nonces.length === 0) return;
    const { ensureRedisConnected } = await import('../services/redis.service');
    const r = await ensureRedisConnected();
    await r.del(...nonces.map((n) => `payment-nonce:x402:${n}`));
  } catch (e) {
    logger.error(
      { requestId: ctx.requestId, err: e instanceof Error ? e.message : String(e) },
      'client_disconnected: nonce release failed',
    );
  }
}
