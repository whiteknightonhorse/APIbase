import { z } from 'zod';
import { getPrisma } from './prisma.service';
import { ensureRedisConnected } from './redis.service';
import { logger } from '../config/logger';

/**
 * Moderation appeal service (F2/C-3, §12.43 MODERATION).
 *
 * The appeal RECORD itself is created automatically at block time
 * (moderation.stage.ts) -- rule_id/category/tool_id/agent_id/response_due_at
 * are already known then. This service only lets the blocked party ADD
 * contact info + their side of the story, and lets anyone holding the
 * appeal_id (an unguessable UUID, functioning as the access token -- the
 * same pattern as the payment-nonce / execution_id UUIDs elsewhere in this
 * codebase) check its status.
 *
 * Resolution (UPHELD / OVERTURNED) is operator-only, done directly against
 * the DB (or a future scripts/moderation-appeal-resolve.py, mirroring
 * scripts/mpp-refund-resolve.py) -- never automated here. Same boundary as
 * the MPP refund: a human decides whether a block was correct.
 */

export interface AppealView {
  appeal_id: string;
  tool_id: string;
  rule_id: string;
  category: string;
  status: string;
  created_at: Date;
  response_due_at: Date;
  resolved_at: Date | null;
  resolution_note: string | null;
  contact_email: string | null;
  message: string | null;
}

// appeal_id is @db.Uuid — Prisma's UUID cast THROWS (uncaught) on a
// malformed string instead of returning null like a normal missed lookup
// ("Inconsistent column data: Error creating UUID, invalid character...").
// Checked here, once, so every current and future caller of getAppeal()
// is protected regardless of whether the route layer remembers to check.
export function isValidAppealId(id: string): boolean {
  return z.string().uuid().safeParse(id).success;
}

export async function getAppeal(appealId: string): Promise<AppealView | null> {
  if (!isValidAppealId(appealId)) return null;
  const row = await getPrisma().moderationAppeal.findUnique({ where: { appeal_id: appealId } });
  if (!row) return null;
  return row;
}

// 3 submissions per appeal_id per hour — an appeal_id is a UUID (not
// guessable) but still worth a light rate limit against accidental
// double-submit loops from a client retry.
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_SEC = 3600;

export async function checkAppealSubmitRateLimit(
  appealId: string,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const key = `appeal:submit:ratelimit:${appealId}`;
  try {
    const r = await ensureRedisConnected();
    const count = await r.incr(key);
    if (count === 1) await r.expire(key, RATE_LIMIT_WINDOW_SEC);
    if (count > RATE_LIMIT_MAX) {
      const ttl = await r.ttl(key);
      return { allowed: false, retryAfter: ttl > 0 ? ttl : RATE_LIMIT_WINDOW_SEC };
    }
    return { allowed: true };
  } catch (err) {
    logger.warn({ err, appealId }, 'Appeal submit rate limit Redis error, allowing submission');
    return { allowed: true };
  }
}

export interface SubmitAppealInput {
  contact_email?: string;
  message?: string;
}

export type SubmitAppealResult =
  | { ok: true; appeal: AppealView }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'already_resolved'; appeal: AppealView };

/** Attach contact info + the appellant's message to an existing OPEN appeal. */
export async function submitAppeal(
  appealId: string,
  input: SubmitAppealInput,
): Promise<SubmitAppealResult> {
  const db = getPrisma();
  const existing = await getAppeal(appealId);
  if (!existing) return { ok: false, reason: 'not_found' };
  if (existing.status !== 'OPEN')
    return { ok: false, reason: 'already_resolved', appeal: existing };

  const updated = await db.moderationAppeal.update({
    where: { appeal_id: appealId },
    data: {
      contact_email: input.contact_email ?? existing.contact_email,
      message: input.message ?? existing.message,
    },
  });

  logger.info({ appealId, toolId: updated.tool_id }, 'Moderation appeal submitted');
  return { ok: true, appeal: updated };
}
