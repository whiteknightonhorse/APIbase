import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkContent } from '../../services/content-filter';
import { isCategoryAllowed } from './categories';

interface BlocklistFile {
  instruction_patterns: Array<{ id: string; value: string }>;
  category_keywords: Record<string, string[]>;
}

const FILE = JSON.parse(
  readFileSync(resolve(__dirname, '../../../config/integrator/catalog-blocklist.json'), 'utf-8'),
) as BlocklistFile;

const INSTRUCTION_RULES = FILE.instruction_patterns.map((r) => ({
  id: r.id,
  re: new RegExp(r.value, 'i'),
}));
const KEYWORD_RULES = Object.entries(FILE.category_keywords).flatMap(([category, words]) =>
  words.map((w) => ({
    category,
    word: w.toLowerCase(),
    re: new RegExp(`(^|[^a-z0-9])${w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'),
  })),
);

// C0/C1 controls except \t \n \r, and zero-width / bidi-override / BOM characters (§8.3 (1)).
const HIDDEN_RE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u2064\uFEFF]/g;

export const hasHiddenChars = (s: string): boolean => new RegExp(HIDDEN_RE.source).test(s);
export const stripHidden = (s: string): string => s.replace(HIDDEN_RE, '');

const evidence = (s: string) => createHash('sha256').update(s).digest('hex');

export interface ProductForModeration {
  sku: string;
  title: string;
  description: string;
  category: string;
  /** The raw title/description carried control or zero-width characters (they are already stripped). */
  hidden_chars?: boolean;
}

export type ProductVerdict =
  | { verdict: 'ok'; evidence_hash: string }
  | { verdict: 'flagged'; reason: string; evidence_hash: string }
  | { verdict: 'rejected'; category: string; reason: string; evidence_hash: string };

/**
 * F-13 layer 1 for a product, in this order: (1) declared category must be in `allowed`;
 * (2) prohibited-category keywords and the global content-filter -> rejected;
 * (3) hidden characters and instruction-like text (§8.3) -> flagged until an LLM check.
 */
export function moderateProduct(p: ProductForModeration): ProductVerdict {
  if (!isCategoryAllowed(p.category)) {
    return {
      verdict: 'rejected',
      category: p.category,
      reason: 'category_prohibited',
      evidence_hash: evidence(`category:${p.category}`),
    };
  }
  const text = `${p.title}\n${p.description}`;
  const lower = text.toLowerCase();
  for (const k of KEYWORD_RULES) {
    if (k.re.test(lower)) {
      return {
        verdict: 'rejected',
        category: k.category,
        reason: 'category_prohibited',
        evidence_hash: evidence(k.word),
      };
    }
  }
  const global = checkContent(text, 'action');
  if (!global.allowed) {
    return {
      verdict: 'rejected',
      category: global.category ?? 'illegal',
      reason: 'category_prohibited',
      evidence_hash: evidence(global.ruleId ?? global.matched ?? 'content-filter'),
    };
  }
  if (p.hidden_chars) {
    return {
      verdict: 'flagged',
      reason: 'hidden_characters',
      evidence_hash: evidence('hidden_characters'),
    };
  }
  for (const r of INSTRUCTION_RULES) {
    const m = r.re.exec(text);
    if (m) {
      return { verdict: 'flagged', reason: r.id, evidence_hash: evidence(m[0].toLowerCase()) };
    }
  }
  return { verdict: 'ok', evidence_hash: evidence(`${p.sku}\n${text}`) };
}
