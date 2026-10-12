import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkContent } from '../../services/content-filter';
import { isCategoryAllowed } from './categories';

interface BlocklistFile {
  instruction_patterns: Array<{ id: string; value: string }>;
  category_keywords: Record<string, string[]>;
  layer3_only?: string[];
}

const FILE = JSON.parse(
  readFileSync(resolve(__dirname, '../../../config/integrator/catalog-blocklist.json'), 'utf-8'),
) as BlocklistFile;

const INSTRUCTION_RULES = FILE.instruction_patterns.map((r) => ({
  id: r.id,
  re: new RegExp(r.value, 'i'),
}));
// Words whose separator-free form is shorter than this are matched only on the delimited pass:
// as a substring of joined text ("begun", "tweed", "loaned") they would misfire constantly.
const JOINED_MIN_LEN = 6;

const joinText = (s: string): string => s.replace(/[^a-z0-9]/g, '');

const KEYWORD_RULES = Object.entries(FILE.category_keywords).flatMap(([category, words]) =>
  words.map((w) => {
    const word = w.toLowerCase();
    const joined = joinText(word);
    return {
      category,
      word,
      re: new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'),
      joined: joined.length >= JOINED_MIN_LEN ? joined : null,
    };
  }),
);

const CONFUSABLES: Record<string, string> = Object.fromEntries(
  Object.entries(
    (
      JSON.parse(
        readFileSync(
          resolve(__dirname, '../../../config/integrator/catalog-confusables.json'),
          'utf-8',
        ),
      ) as { map: Record<string, string> }
    ).map,
  ).map(([k, v]) => [String.fromCharCode(parseInt(k.slice(2), 16)), v]),
);
const CONFUSABLE_RE = new RegExp(`[${Object.keys(CONFUSABLES).join('')}]`, 'g');

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};
const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'l',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '@': 'a',
  $: 's',
};

function decodeEntities(s: string): string {
  let cur = s;
  for (let i = 0; i < 3; i++) {
    const next = cur.replace(
      /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z]+));/g,
      (m, d?: string, h?: string, n?: string) => {
        if (n !== undefined) return NAMED_ENTITIES[n.toLowerCase()] ?? m;
        const cp = d !== undefined ? parseInt(d, 10) : parseInt(h as string, 16);
        return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
      },
    );
    if (next === cur) break;
    cur = next;
  }
  return cur;
}

/**
 * Fold text to a comparable ASCII form: entities decoded, NFKC (fullwidth, ligatures), lower case,
 * Cyrillic/Greek lookalikes to Latin, leet digits/symbols to letters only inside tokens that
 * contain a letter (plain numbers and prices stay intact), whitespace collapsed. `1` is ambiguous
 * (l or i), so callers scan both readings.
 */
export function normalizeForScan(input: unknown, oneAs: 'l' | 'i' = 'l'): string {
  if (typeof input !== 'string') return '';
  return decodeEntities(input)
    .normalize('NFKC')
    .toLowerCase()
    .replace(CONFUSABLE_RE, (c) => CONFUSABLES[c] ?? c)
    .replace(/[a-z0-9@$]+/g, (tok) =>
      /[a-z]/.test(tok)
        ? tok.replace(/[0134578@$]/g, (c) => (c === '1' ? oneAs : (LEET[c] ?? c)))
        : tok,
    )
    .replace(/\s+/g, ' ')
    .trim();
}

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
  /** Extra free-text fields (attributes, tags, ...) scanned with the same rules as title/description. */
  extra_texts?: string[];
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
  const extras = Array.isArray(p.extra_texts)
    ? p.extra_texts.filter((t): t is string => typeof t === 'string')
    : [];
  const text = [p.title, p.description, ...extras].join('\n');
  const texts = [p.title, p.description, ...extras, text];
  for (const t of texts) {
    for (const oneAs of ['l', 'i'] as const) {
      const norm = normalizeForScan(t, oneAs);
      const joined = joinText(norm);
      for (const k of KEYWORD_RULES) {
        if (k.re.test(norm) || (k.joined !== null && joined.includes(k.joined))) {
          return {
            verdict: 'rejected',
            category: k.category,
            reason: 'category_prohibited',
            evidence_hash: evidence(k.word),
          };
        }
      }
    }
  }
  for (const t of texts) {
    const global = checkContent(t, 'action');
    if (!global.allowed) {
      return {
        verdict: 'rejected',
        category: global.category ?? 'illegal',
        reason: 'category_prohibited',
        evidence_hash: evidence(global.ruleId ?? global.matched ?? 'content-filter'),
      };
    }
  }
  if (p.hidden_chars) {
    return {
      verdict: 'flagged',
      reason: 'hidden_characters',
      evidence_hash: evidence('hidden_characters'),
    };
  }
  for (const t of texts) {
    for (const r of INSTRUCTION_RULES) {
      const m = r.re.exec(t);
      if (m) {
        return { verdict: 'flagged', reason: r.id, evidence_hash: evidence(m[0].toLowerCase()) };
      }
    }
  }
  return { verdict: 'ok', evidence_hash: evidence(`${p.sku}\n${text}`) };
}
