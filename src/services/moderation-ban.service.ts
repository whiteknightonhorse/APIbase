import { ensureRedisConnected } from './redis.service';

/**
 * Escalating moderation ban (F2/C-2 step 6, §12.43 MODERATION).
 *
 * N content-moderation blocks within a 24h window, keyed by the same
 * identity a wallet-paying agent cannot cheaply rotate (on-chain payer
 * address) or, absent one, the API key's agent_id -- refuses ALL further
 * requests from that identity until the window expires, regardless of
 * whether the specific new request would itself have been blocked.
 *
 * BAN_THRESHOLD is an ordinary tunable, not a spec value -- 5 blocks/24h
 * chosen as a reasonable default (mirrors the order of magnitude of other
 * unilaterally-set thresholds in this codebase, e.g. the margin gate's 1.3x
 * multiplier); adjust here if it proves too strict or too loose in practice.
 */

const BAN_WINDOW_SECONDS = 24 * 60 * 60;
const BAN_THRESHOLD = 5;

function banKey(identity: string): string {
  return `moderation:blocks:${identity}`;
}

/**
 * The identity an escalating ban is tracked against: the on-chain payer
 * address when one exists (x402/MPP -- costs real money to rotate), else
 * the authenticated agent_id. Exported so the pipeline stage and tests
 * agree on exactly one derivation.
 */
export function banIdentity(ctx: {
  agentId?: string;
  x402Payer?: string;
  mppPayer?: string;
}): string | undefined {
  return ctx.x402Payer ?? ctx.mppPayer ?? ctx.agentId;
}

export interface BanStatus {
  banned: boolean;
  retryAfterSecs: number;
}

/** Check ban status WITHOUT recording a new block. Fail-open on Redis error
 *  (a moderation ban is a deterrent, not the primary safety control -- the
 *  content check itself still runs and still blocks). */
export async function checkBan(identity: string): Promise<BanStatus> {
  try {
    const r = await ensureRedisConnected();
    const key = banKey(identity);
    const count = await r.get(key);
    if (!count || Number(count) <= BAN_THRESHOLD) {
      return { banned: false, retryAfterSecs: 0 };
    }
    const ttl = await r.ttl(key);
    return { banned: true, retryAfterSecs: ttl > 0 ? ttl : BAN_WINDOW_SECONDS };
  } catch {
    return { banned: false, retryAfterSecs: 0 };
  }
}

/** Record a new content-moderation block for this identity. Call AFTER a
 *  block is decided, so the count reflects blocks including this one --
 *  the ban then applies to the NEXT request, never retroactively to the one
 *  that tripped the threshold (that one is already refused for its own
 *  content reason). Fail-open on Redis error, same rationale as checkBan. */
export async function recordBlock(identity: string): Promise<void> {
  try {
    const r = await ensureRedisConnected();
    const key = banKey(identity);
    const count = await r.incr(key);
    if (count === 1) {
      await r.expire(key, BAN_WINDOW_SECONDS);
    }
  } catch {
    // Best-effort deterrent — never let a Redis hiccup block a request that
    // MODERATION's own content check would otherwise have allowed.
  }
}

/** Test-only: read the raw threshold so tests don't hardcode a second copy. */
export function __getBanThresholdForTest(): number {
  return BAN_THRESHOLD;
}
