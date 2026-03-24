/**
 * Content moderation filter for outbound messaging (Telegram, Google Ads, etc.)
 *
 * Checks text against prohibited keywords, regex patterns, and URL blocklist.
 * Loaded once at module init, no DB queries, no async — pure CPU check.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const blocklist = JSON.parse(
  readFileSync(resolve(__dirname, '../../config/content-blocklist.json'), 'utf-8'),
) as {
  prohibited_exact: string[];
  prohibited_patterns: string[];
  prohibited_urls: string[];
  warning_keywords: string[];
};

export interface FilterResult {
  allowed: boolean;
  reason?: string;
  matched?: string;
  category?: 'prohibited_exact' | 'prohibited_pattern' | 'prohibited_url' | 'warning';
}

const exactSet = new Set(
  blocklist.prohibited_exact.map((s: string) => s.toLowerCase()),
);

const patterns = blocklist.prohibited_patterns.map(
  (p: string) => new RegExp(p, 'i'),
);

const blockedUrls = blocklist.prohibited_urls.map(
  (u: string) => u.toLowerCase(),
);

const warningSet = new Set(
  blocklist.warning_keywords.map((s: string) => s.toLowerCase()),
);

/**
 * Check text content against the blocklist.
 * Returns { allowed: true } if content is safe.
 * Returns { allowed: false, reason, matched, category } if blocked.
 */
export function checkContent(text: string): FilterResult {
  if (!text || text.length === 0) return { allowed: true };

  const lower = text.toLowerCase();

  // Layer 1: Exact phrase match
  for (const phrase of exactSet) {
    if (lower.includes(phrase)) {
      return {
        allowed: false,
        reason: 'Content contains prohibited phrase',
        matched: phrase,
        category: 'prohibited_exact',
      };
    }
  }

  // Layer 2: Regex pattern match
  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match) {
      return {
        allowed: false,
        reason: 'Content matches prohibited pattern',
        matched: match[0],
        category: 'prohibited_pattern',
      };
    }
  }

  // Layer 3: URL blocklist
  for (const url of blockedUrls) {
    if (lower.includes(url)) {
      return {
        allowed: false,
        reason: 'Content contains blocked URL pattern',
        matched: url,
        category: 'prohibited_url',
      };
    }
  }

  return { allowed: true };
}

/**
 * Check if content triggers warnings (not blocked, just flagged).
 */
export function checkWarnings(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const warnings: string[] = [];
  for (const kw of warningSet) {
    if (lower.includes(kw)) warnings.push(kw);
  }
  return warnings;
}
