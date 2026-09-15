/**
 * Shared keyword matching for tool discovery (ZZ-03-05).
 *
 * Extracted out of prompt-adapter.ts's `discover_tools`, which had the only implementation of
 * this scoring logic before this task. `src/services/discovery.service.ts`'s `discover()` is
 * now the sole ranking implementation (03-SPECIFICATION.md P-1/M-1 / zz-03 Q1 ruling-1) and
 * `discover_tools` calls it instead of re-scoring on its own — this module is what both share,
 * so there is exactly one stemmer/scorer, not two that can drift apart.
 */

import type { McpToolDefinition } from './types';

/** Minimal stemmer — strip common English suffixes for search matching. Only used internally by
 *  extractKeywords()/scoreTool() below — not part of this module's public surface. */
function stem(word: string): string {
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
  if (word.endsWith('es') && word.length > 3) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);
  if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
  if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
  return word;
}

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'and',
  'or',
  'not',
  'no',
  'but',
  'if',
  'so',
  'as',
  'it',
  'do',
  'does',
  'did',
  'will',
  'would',
  'can',
  'could',
  'should',
  'has',
  'have',
  'had',
  'i',
  'me',
  'my',
  'we',
  'our',
  'you',
  'your',
  'he',
  'she',
  'they',
  'them',
  'this',
  'that',
  'what',
  'which',
  'how',
  'get',
  'find',
  'search',
  'look',
  'up',
  'about',
  'some',
  'any',
  'all',
  'want',
  'need',
  'near',
]);

/** Extract meaningful keywords from an intent string. Returns both original and stemmed forms. */
export function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  // Deduplicate: include both original and stemmed forms
  const unique = new Set<string>();
  for (const w of words) {
    unique.add(w);
    const s = stem(w);
    if (s !== w) unique.add(s);
  }
  return [...unique];
}

export interface ToolMatch {
  score: number;
  /** Which fields contributed to `score` — a subset of ['title', 'id', 'description', 'category']. */
  matchedOn: string[];
}

/** Weighted keyword scoring: title=3, toolId/mcpName=2, description=1, category=1. */
export function scoreTool(tool: McpToolDefinition, keywords: string[]): ToolMatch {
  const title = (tool.title ?? '').toLowerCase();
  const toolId = tool.toolId.toLowerCase();
  const mcpName = (tool.mcpName ?? '').toLowerCase();
  const desc = tool.description.toLowerCase();
  const cat = (tool.category ?? '').toLowerCase();

  let score = 0;
  const matchedOn = new Set<string>();
  for (const kw of keywords) {
    const stemmed = stem(kw);
    if (title.includes(kw) || title.includes(stemmed)) {
      score += 3;
      matchedOn.add('title');
    }
    if (
      toolId.includes(kw) ||
      toolId.includes(stemmed) ||
      mcpName.includes(kw) ||
      mcpName.includes(stemmed)
    ) {
      score += 2;
      matchedOn.add('id');
    }
    if (desc.includes(kw) || desc.includes(stemmed)) {
      score += 1;
      matchedOn.add('description');
    }
    if (cat.includes(kw) || cat.includes(stemmed)) {
      score += 1;
      matchedOn.add('category');
    }
  }
  return { score, matchedOn: [...matchedOn] };
}
