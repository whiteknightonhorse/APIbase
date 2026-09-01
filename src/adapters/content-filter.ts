/**
 * Content moderation filter (F2/C-2, §12.43 MODERATION).
 *
 * Rule-driven: loads config/content-blocklist.json once at module init, no DB
 * queries, no async -- pure CPU check. Each rule carries a stable id +
 * category (written into the ledger + appeal record on a block, see
 * moderation.stage.ts) and an `absolute` flag.
 *
 * Two moderation classes (config/content-moderation-classes.json decides
 * which a provider gets):
 *  - 'action'  (telegram, twilio, telnyx, resend, future devices): checked
 *    against every rule. These channels DO something in the real world.
 *  - 'data'    (search, news, and everything not explicitly listed as
 *    'action'): checked against only `absolute: true` rules (CSAM). A
 *    search/news query ABOUT a banned topic is not the act of doing it --
 *    e.g. "news about isis recruitment tactics" must pass here even though
 *    the same phrase sent as a telegram message must not.
 *
 * 2026-09-01: moved from a per-adapter check (telegram/index.ts only -- the
 * other three action-class channels, twilio/telnyx/resend, had NO filtering
 * at all) into this single pipeline stage. The rule now lives in one place.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type ModerationClass = 'action' | 'data';

interface BlocklistRule {
  id: string;
  category: string;
  type: 'exact' | 'pattern' | 'url';
  value: string;
  absolute: boolean;
}

interface Blocklist {
  rules: BlocklistRule[];
  warning_keywords: string[];
}

const blocklist = JSON.parse(
  readFileSync(resolve(__dirname, '../../config/content-blocklist.json'), 'utf-8'),
) as Blocklist;

interface CompiledRule {
  id: string;
  category: string;
  type: 'exact' | 'pattern' | 'url';
  absolute: boolean;
  matcher: string | RegExp; // exact/url: lowercased literal substring; pattern: RegExp
}

function compile(rule: BlocklistRule): CompiledRule {
  return {
    id: rule.id,
    category: rule.category,
    type: rule.type,
    absolute: rule.absolute,
    matcher: rule.type === 'pattern' ? new RegExp(rule.value, 'i') : rule.value.toLowerCase(),
  };
}

const allRules: CompiledRule[] = blocklist.rules.map(compile);
const absoluteRules: CompiledRule[] = allRules.filter((r) => r.absolute);

const warningSet = new Set(blocklist.warning_keywords.map((s) => s.toLowerCase()));

export interface FilterResult {
  allowed: boolean;
  reason?: string;
  matched?: string;
  ruleId?: string;
  category?: string;
  /** Offset of the match inside the ORIGINAL (not lowercased) text, so the
   * appeal record (moderation.stage.ts) can store where in the full field
   * value the rule fired -- see ШАГ 2 (2026-09-02). Assumes toLowerCase()
   * preserves character offsets, true for the ASCII blocklist content this
   * filter matches against; not re-derived per rule type beyond that. */
  matchStart?: number;
  matchEnd?: number;
}

/**
 * Check text content against the blocklist for the given moderation class.
 * Returns { allowed: true } if content is safe (or text is empty).
 */
export function checkContent(text: string, moderationClass: ModerationClass): FilterResult {
  if (!text || text.length === 0) return { allowed: true };

  const lower = text.toLowerCase();
  const rules = moderationClass === 'action' ? allRules : absoluteRules;

  for (const rule of rules) {
    if (rule.type === 'pattern') {
      const match = lower.match(rule.matcher as RegExp);
      if (match && match.index !== undefined) {
        return {
          allowed: false,
          reason: `Content matches prohibited pattern (${rule.category})`,
          matched: match[0],
          ruleId: rule.id,
          category: rule.category,
          matchStart: match.index,
          matchEnd: match.index + match[0].length,
        };
      }
    } else {
      const idx = lower.indexOf(rule.matcher as string);
      if (idx !== -1) {
        return {
          allowed: false,
          reason:
            rule.type === 'url'
              ? `Content contains blocked URL pattern (${rule.category})`
              : `Content contains prohibited phrase (${rule.category})`,
          matched: rule.matcher as string,
          ruleId: rule.id,
          category: rule.category,
          matchStart: idx,
          matchEnd: idx + (rule.matcher as string).length,
        };
      }
    }
  }

  return { allowed: true };
}

export interface WarningMatch {
  keyword: string;
}

/**
 * Check if content triggers soft warnings (not blocked, just flagged).
 * 2026-09-01: wired into moderation.stage.ts for action-class content
 * (log-only, never blocks) -- was dead code (defined, never called) before.
 */
export function checkWarnings(text: string): WarningMatch[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const warnings: WarningMatch[] = [];
  for (const kw of warningSet) {
    if (lower.includes(kw)) warnings.push({ keyword: kw });
  }
  return warnings;
}
