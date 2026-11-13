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

/** First sentence of a description, cut at COMPACT_SUMMARY_MAX characters on a word boundary. */
export function summarize(description: unknown): string {
  if (typeof description !== 'string') return '';
  const text = description.replace(/\s+/g, ' ').trim();
  const stop = /[.!?](?=\s|$)/.exec(text);
  const sentence = stop ? text.slice(0, stop.index + 1) : text;
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
