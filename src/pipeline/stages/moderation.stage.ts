import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  type Stage,
  type PipelineContext,
  type PipelineError,
  type Result,
  ok,
  err,
} from '../types';
import { checkContent, checkWarnings, type ModerationClass } from '../../adapters/content-filter';
import { getToolProvider } from './tool-status.stage';
import { getPrisma } from '../../services/prisma.service';
import { logger } from '../../config/logger';
import { banIdentity, checkBan, recordBlock } from '../../services/moderation-ban.service';

/**
 * MODERATION stage (F2/C-2, §12.43 -- inserted between ESCROW and
 * PROVIDER_CALL). This is the ONLY place content moderation runs now:
 * telegram/index.ts used to check its own params inline, and twilio/telnyx/
 * resend (also outbound-to-the-real-world channels: SMS, calls, email) had
 * NO filtering at all -- 372 adapters, exactly 1 filtered. One rule, one
 * place, applied to every current and future action-class tool with zero
 * per-adapter wiring.
 *
 * Runs AFTER escrow so a paid request's payment already exists by the time
 * a block is decided -- required for settle-on-block (F2/C-3): see
 * blockRequest() below and escrow-finalize.stage.ts's moderationBlocked
 * branch. This is a deliberate departure from "reject as early as possible"
 * (Fable decision, not to be re-litigated here).
 */

const moderationClassesConfig = JSON.parse(
  readFileSync(resolve(__dirname, '../../../config/content-moderation-classes.json'), 'utf-8'),
) as { action: string[] };
const actionProviders = new Set(moderationClassesConfig.action.map((p) => p.toLowerCase()));

/**
 * 'action' (full ruleset) for providers explicitly listed in
 * config/content-moderation-classes.json; 'data' (narrow, absolute-only
 * ruleset) for everything else -- the permissive default, see that file's
 * doc comment for why defaulting the OTHER way would be worse.
 */
function classify(provider: string | undefined): ModerationClass {
  if (!provider) return 'data';
  return actionProviders.has(provider.toLowerCase()) ? 'action' : 'data';
}

/**
 * Top-level string values from the request body. Generic on purpose: a
 * per-tool field map (telegram.text, twilio.body, resend.subject/text/html,
 * ...) would need a new entry every time an action-class tool is added.
 * Scanning every string field costs nothing extra and cannot miss one.
 */
function collectStrings(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];
  const out: string[] = [];
  for (const v of Object.values(body as Record<string, unknown>)) {
    if (typeof v === 'string') out.push(v);
  }
  return out;
}

const APPEAL_WINDOW_MS = 72 * 60 * 60 * 1000;

interface BlockMatch {
  ruleId?: string;
  category?: string;
}

async function blockRequest(
  ctx: PipelineContext,
  match: BlockMatch,
  identity: string | undefined,
): Promise<Result<PipelineContext, PipelineError>> {
  const ruleId = match.ruleId ?? 'unknown';
  const category = match.category ?? 'unknown';
  const priceUsd = ctx.toolPrice ?? 0;
  const isPaid = priceUsd > 0;

  // Settle-on-block (F2/C-3): a PAID request's payment already happened at
  // ESCROW (this stage runs after it) -- create the appeal record now so
  // there is an appeal_id to write into the ledger row (pipeline.ts's
  // MODERATION error branch runs ESCROW_FINALIZE + LEDGER_WRITE against
  // this same ctx before returning the block to the client). An unpaid
  // (free-tool) block has nothing to settle, so no appeal record either --
  // there is no charge to contest.
  let appealId: string | undefined;
  if (isPaid) {
    try {
      const appeal = await getPrisma().moderationAppeal.create({
        data: {
          execution_id: ctx.executionId ?? null,
          agent_id: ctx.agentId ?? null,
          tool_id: ctx.toolId ?? 'unknown',
          rule_id: ruleId,
          category,
          response_due_at: new Date(Date.now() + APPEAL_WINDOW_MS),
        },
      });
      appealId = appeal.appeal_id;
    } catch (e) {
      logger.error(
        { err: e, requestId: ctx.requestId },
        'MODERATION: failed to create appeal record for a paid block',
      );
    }
  }

  ctx.moderationBlocked = true;
  ctx.moderationRuleId = ruleId;
  ctx.moderationCategory = category;
  ctx.moderationAppealId = appealId;

  if (identity) {
    await recordBlock(identity);
  }

  logger.warn(
    {
      requestId: ctx.requestId,
      toolId: ctx.toolId,
      agentId: ctx.agentId,
      ruleId,
      category,
      isPaid,
      appealId,
    },
    'MODERATION blocked request',
  );

  return err<PipelineError>({
    code: 403,
    error: 'content_blocked',
    message: isPaid
      ? `This request was blocked by content moderation (${category}). Payment for this call was still charged -- see appeal_url to contest it.`
      : `This request was blocked by content moderation (${category}).`,
    extra: {
      rule_id: ruleId,
      category,
      settle_on_block: isPaid,
      ...(appealId
        ? {
            appeal_id: appealId,
            appeal_url: `https://apibase.pro/appeals/${appealId}`,
            appeal_response_hours: 72,
          }
        : {}),
    },
  });
}

export const moderationStage: Stage = {
  name: 'MODERATION',

  async execute(ctx: PipelineContext) {
    // A cache hit serves a PRIOR execution's already-moderated response --
    // nothing new to check. (Action-class send tools are not expected to
    // ever have cache_ttl > 0, but this keeps the invariant explicit rather
    // than accidental if one ever does.)
    if (ctx.cacheHit) {
      return ok(ctx);
    }

    const identity = banIdentity(ctx);
    if (identity) {
      const ban = await checkBan(identity);
      if (ban.banned) {
        return err<PipelineError>({
          code: 403,
          error: 'moderation_banned',
          message: 'Too many content-moderation blocks in the last 24 hours. Try again later.',
          retryAfter: ban.retryAfterSecs,
        });
      }
    }

    const provider = getToolProvider(ctx.toolId ?? '');
    const moderationClass = classify(provider);
    const strings = collectStrings(ctx.body);

    if (moderationClass === 'action') {
      for (const text of strings) {
        for (const w of checkWarnings(text)) {
          logger.warn(
            {
              requestId: ctx.requestId,
              toolId: ctx.toolId,
              agentId: ctx.agentId,
              keyword: w.keyword,
            },
            'Content moderation warning (not blocked)',
          );
        }
      }
    }

    for (const text of strings) {
      const result = checkContent(text, moderationClass);
      if (!result.allowed) {
        return blockRequest(ctx, result, identity);
      }
    }

    return ok(ctx);
  },
};
