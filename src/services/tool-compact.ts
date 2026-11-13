/**
 * T-0836: compact view of a catalog entry for GET /api/tools and /api/v1/tools (?view=compact).
 * Pure functions, no I/O, so a unit test can load them without the DB or Redis clients.
 */

/** Longest `summary` of a compact item, in characters. */
export const COMPACT_SUMMARY_MAX = 160;

export interface CompactToolItem {
  id: string;
  name: string;
  category: string;
  price_usd: number;
  summary: string;
}

const ABBREVIATIONS = new Set([
  'e.g',
  'i.e',
  'etc',
  'vs',
  'approx',
  'incl',
  'excl',
  'no',
  'st',
  'dr',
  'inc',
  'ltd',
  'co',
]);

/** Index of the character that ends the first sentence of `text`, or -1 when none does. */
function firstSentenceEnd(text: string): number {
  const re = /[.!?](?=\s|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (text[m.index] === '.') {
      const word = /([A-Za-z.]+)$/.exec(text.slice(0, m.index))?.[1]?.toLowerCase() ?? '';
      // an abbreviation ("e.g.", "etc.", "U.S.") or a single letter does not end a sentence
      if (ABBREVIATIONS.has(word) || /^[a-z]$/.test(word) || /^([a-z]\.)+[a-z]$/.test(word)) {
        continue;
      }
      // a sentence does not continue in lower case
      if (/^\s+[a-z]/.test(text.slice(m.index + 1))) continue;
    }
    return m.index;
  }
  return -1;
}

/** First sentence of a description, cut at COMPACT_SUMMARY_MAX characters on a word boundary. */
export function summarize(description: unknown): string {
  if (typeof description !== 'string') return '';
  const text = description.replace(/\s+/g, ' ').trim();
  const end = firstSentenceEnd(text);
  const sentence = end >= 0 ? text.slice(0, end + 1) : text;
  if (sentence.length <= COMPACT_SUMMARY_MAX) return sentence;
  const cut = sentence.slice(0, COMPACT_SUMMARY_MAX);
  const space = cut.lastIndexOf(' ');
  return (space > 0 ? cut.slice(0, space) : cut).trimEnd();
}

export function toCompact(entry: {
  id: string;
  name: string;
  category: string;
  description: string;
  pricing: { price_usd: number };
}): CompactToolItem {
  return {
    id: entry.id,
    name: entry.name,
    category: entry.category,
    price_usd: entry.pricing.price_usd,
    summary: summarize(entry.description),
  };
}
