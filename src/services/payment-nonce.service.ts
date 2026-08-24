import { ensureRedisConnected } from './redis.service';

/**
 * Payment nonce replay guard (A-01).
 *
 * Shared by every payment rail (x402, MPP, and any future rail). Verification
 * of a signed payment authorization is stateless — the same signed value
 * presented N times in parallel passes verify N times. This is the single
 * server-side primitive that makes a signed authorization single-use: Redis
 * `SET NX` on a rail-scoped, payload-derived key. First caller wins; every
 * concurrent or later replay of the exact same signed value gets `false`.
 *
 * TTL must be the caller-supplied window until the signed value itself
 * expires (e.g. EIP-3009 `validBefore`, MPP challenge `expires`) — never
 * longer, or an expired-anyway authorization keeps memory pinned.
 *
 * Throws on Redis failure. Callers MUST fail closed (§12.186): a thrown error
 * means "unknown", never "not yet claimed".
 */
const PREFIX = 'payment-nonce';
const MAX_TTL_SECONDS = 3600;

export async function claimPaymentNonce(
  rail: string,
  nonce: string,
  ttlSeconds: number,
): Promise<boolean> {
  const r = await ensureRedisConnected();
  const key = `${PREFIX}:${rail}:${nonce}`;
  const ttl = Math.min(MAX_TTL_SECONDS, Math.max(1, Math.ceil(ttlSeconds)));
  const result = await r.set(key, '1', 'EX', ttl, 'NX');
  return result === 'OK';
}
