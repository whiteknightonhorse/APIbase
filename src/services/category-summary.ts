/**
 * Category rule and category summary, shared by discover(), the categories call (REST and MCP)
 * and scripts/gen-discovery.ts (T-0835). Pure: no config, DB or cache imports, so a script can
 * import it without pulling in the service layer.
 */

/** Category of a tool that has no definition category. One name, used everywhere. */
export const UNCATEGORIZED = 'uncategorized';

/** The one category rule: the definition category, else `uncategorized`. */
export function categoryOf(def: { category?: string }): string {
  return def.category ?? UNCATEGORIZED;
}

export interface CategorySummaryRow {
  category: string;
  tools: number;
  price_usd: { min: number; median: number; max: number };
}

export interface CategorySummary {
  total_tools: number;
  categories: CategorySummaryRow[];
}

function round8(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

/** Median of a non-empty numeric array: the middle value, or the mean of the two middle ones. */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : round8((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Group tools by category (sorted by name) with count and min/median/max price. */
export function summarizeCategories(
  items: ReadonlyArray<{ category: string; price_usd: number }>,
): CategorySummary {
  const byCategory = new Map<string, number[]>();
  for (const it of items) {
    const prices = byCategory.get(it.category);
    if (prices) prices.push(it.price_usd);
    else byCategory.set(it.category, [it.price_usd]);
  }
  const categories = [...byCategory.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([category, prices]) => ({
      category,
      tools: prices.length,
      price_usd: { min: Math.min(...prices), median: median(prices), max: Math.max(...prices) },
    }));
  return { total_tools: items.length, categories };
}
