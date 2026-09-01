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
 * Top-level string fields from the request body, WITH their field names.
 * Generic on purpose: a per-tool field map (telegram.text, twilio.body,
 * resend.subject/text/html, ...) would need a new entry every time an
 * action-class tool is added. Scanning every string field costs nothing
 * extra and cannot miss one.
 *
 * The field name travels alongside its value (ШАГ 2, 2026-09-02) so a block
 * can record WHICH field the rule matched in, not just that some field did --
 * the appeal record stores the full field value the rule fired on (capped,
 * see CONTENT_MAX_BYTES below), because a short "matched" excerpt alone
 * (e.g. "cr**isis** support") strips exactly the surrounding context that
 * would tell a reviewer the block was a false positive.
 */
function collectStrings(body: unknown): Array<{ field: string; value: string }> {
  if (!body || typeof body !== 'object') return [];
  const out: Array<{ field: string; value: string }> = [];
  for (const [field, v] of Object.entries(body as Record<string, unknown>)) {
    if (typeof v === 'string') out.push({ field, value: v });
  }
  return out;
}

const APPEAL_WINDOW_MS = 72 * 60 * 60 * 1000;
// ШАГ 2 retention: unappealed content is wiped 14 days after the block.
const CONTENT_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

// ШАГ 2 (2026-09-02): what the appeal record keeps of the content that
// tripped a rule -- and what it never does. See moderation-policy text /
// policy/moderation for the operator-facing version of this same rule.
const CONTENT_MAX_BYTES = 4096;
// Absolute exception: CSAM content is NEVER stored, in any form, at any
// length -- not the field name, not an excerpt, not offsets. A CSAM block's
// appeal row carries only the skeleton (rule_id/category/appeal_id/status).
// This is a hard line, not a default that a future rule could accidentally
// relax; checked by category string, the only field a rule's identity is
// keyed on, not by rule id (a new CSAM rule id must still hit this).
const CSAM_CATEGORY = 'csam';

/** Cap a matched field's value at CONTENT_MAX_BYTES (UTF-8), truncating on a
 * whole-character boundary so a multi-byte character never gets split. */
function capContent(value: string): { content: string; truncated: boolean } {
  if (Buffer.byteLength(value, 'utf8') <= CONTENT_MAX_BYTES) {
    return { content: value, truncated: false };
  }
  let content = Buffer.from(value, 'utf8').subarray(0, CONTENT_MAX_BYTES).toString('utf8');
  // Buffer truncation can land mid-codepoint -- toString() replaces the
  // broken tail with U+FFFD; strip trailing replacement characters instead
  // of keeping a mangled boundary in what a human will read.
  content = content.replace(/�+$/, '');
  return { content, truncated: true };
}

interface BlockMatch {
  ruleId?: string;
  category?: string;
  matchStart?: number;
  matchEnd?: number;
}

async function blockRequest(
  ctx: PipelineContext,
  match: BlockMatch,
  identity: string | undefined,
  matchedField: string | undefined,
  matchedValue: string | undefined,
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
  // there is no charge to contest, and ШАГ 2's boundary ("only for BLOCKED
  // PAID requests") is enforced automatically: no row, nothing stored.
  let appealId: string | undefined;
  if (isPaid) {
    const isCsam = category === CSAM_CATEGORY;
    const capped = !isCsam && matchedValue !== undefined ? capContent(matchedValue) : undefined;
    try {
      const appeal = await getPrisma().moderationAppeal.create({
        data: {
          execution_id: ctx.executionId ?? null,
          agent_id: ctx.agentId ?? null,
          tool_id: ctx.toolId ?? 'unknown',
          rule_id: ruleId,
          category,
          response_due_at: new Date(Date.now() + APPEAL_WINDOW_MS),
          // CSAM: every one of these stays null -- absolute exception, no
          // content in any form, ever. Non-CSAM: full (capped) field value
          // + where in it the rule matched.
          matched_field: !isCsam ? (matchedField ?? null) : null,
          matched_content: capped?.content ?? null,
          content_truncated: capped?.truncated ?? false,
          match_start: !isCsam ? (match.matchStart ?? null) : null,
          match_end: !isCsam ? (match.matchEnd ?? null) : null,
          // 14 days from creation if never appealed (§ШАГ 2 retention);
          // submitAppeal() pushes this out on submission, and the operator
          // resolve script sets the final resolved_at+30d value.
          content_expires_at: new Date(Date.now() + CONTENT_RETENTION_MS),
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
      // ШАГ 4 (2026-09-02): every block response links to the policy page
      // explaining how moderation works, appeals, and content retention --
      // present regardless of whether this block has an appeal (a free
      // block has nothing to contest, but the "why" is still worth linking).
      policy_url: 'https://apibase.pro/policy/moderation',
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
      for (const { value } of strings) {
        for (const w of checkWarnings(value)) {
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

    for (const { field, value } of strings) {
      const result = checkContent(value, moderationClass);
      if (!result.allowed) {
        return blockRequest(ctx, result, identity, field, value);
      }
    }

    return ok(ctx);
  },
};
