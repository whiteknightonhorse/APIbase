import { ensureRedisConnected } from '../services/redis.service';
import { logger } from '../config/logger';
import { AppError, ErrorCode } from '../types/errors';
import { x402OperatorLockWaitSeconds } from '../services/metrics.service';

/**
 * Redis SETNX-based lock for serializing on-chain settles per operator address.
 *
 * Why: viem's per-process nonce manager cannot coordinate across containers
 * (api + worker). Two concurrent `transferWithAuthorization` submissions from
 * the same operator address would race on `eth_getTransactionCount` and
 * collide ("nonce too low") on the slower one.
 *
 * Strategy: hold a Redis lock keyed by operator address while a settle is
 * inflight. TTL caps deadlock risk if a process dies mid-settle.
 *
 * Throughput at 100K settles/mo ≈ 140/h ≈ 2.3/min — well below the lock's
 * one-inflight-at-a-time bound (each settle ~1-3s on Base).
 */

const LOCK_TTL_MS = 60_000; // settle should never exceed 30s; 60s is safe ceiling
const ACQUIRE_TIMEOUT_MS = 30_000; // give up if we can't get the lock in 30s
const RETRY_DELAY_MS = 100;

function lockKey(operatorAddress: string): string {
  return `x402:settle-lock:${operatorAddress.toLowerCase()}`;
}

/**
 * Run `fn` while holding the operator lock.
 * Throws AppError(SERVICE_UNAVAILABLE) if the lock cannot be acquired in time.
 * Releases the lock in a finally block, even if `fn` throws.
 */
export async function withOperatorLock<T>(
  operatorAddress: string,
  fn: () => Promise<T>,
): Promise<T> {
  const redis = await ensureRedisConnected();
  const key = lockKey(operatorAddress);
  const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const deadline = Date.now() + ACQUIRE_TIMEOUT_MS;

  // Acquire — SET NX with PX for atomic lock + auto-expiry.
  // Track success in-loop to avoid post-loop race (we may have just acquired
  // the lock right before deadline, or our TTL could expire between the
  // successful SET and a separate GET — both produce false negatives on a
  // post-loop GET check).
  const acquireStart = Date.now();
  let acquired = false;
  while (Date.now() < deadline) {
    const got = await redis.set(key, token, 'PX', LOCK_TTL_MS, 'NX');
    if (got === 'OK') {
      acquired = true;
      break;
    }
    await sleep(RETRY_DELAY_MS);
  }
  x402OperatorLockWaitSeconds.observe((Date.now() - acquireStart) / 1000);

  if (!acquired) {
    throw new AppError(
      ErrorCode.SERVICE_UNAVAILABLE,
      `Could not acquire operator lock within ${ACQUIRE_TIMEOUT_MS}ms`,
    );
  }

  try {
    return await fn();
  } finally {
    // Release only if we still own the lock — avoids stomping on a lock
    // that took over after our TTL expired (would only happen if fn
    // exceeded LOCK_TTL_MS, which is logged below).
    try {
      const release = await redis.eval(
        `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
        1,
        key,
        token,
      );
      if (release !== 1) {
        logger.warn(
          { operator: operatorAddress },
          'x402 operator lock: TTL expired before release — settle exceeded LOCK_TTL_MS',
        );
      }
    } catch (err) {
      logger.warn(
        { err, operator: operatorAddress },
        'x402 operator lock: release failed (will auto-expire via TTL)',
      );
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
