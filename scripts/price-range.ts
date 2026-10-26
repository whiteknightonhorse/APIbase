/**
 * price-range.ts — the one public per-call price range (T-0341).
 *
 * Input: the committed snapshot (scripts/discovery-snapshot.tsv, `tool_id<TAB>provider<TAB>price_usd`
 * for every non-unavailable tool). min = lowest price over tools with price > 0, max = highest
 * price over all rows, p90 = nearest-rank 90th percentile over tools with price > 0.
 */
export interface PriceRange {
  min: number;
  max: number;
  p90: number;
  text: string;
}

/** 0.0005 -> "0.0005", 29.99 -> "29.99", 1 -> "1.00": trailing zeros trimmed, at least 2 decimals. */
export function formatUsd(x: number): string {
  let s = x.toFixed(6).replace(/0+$/, '');
  const dec = s.length - s.indexOf('.') - 1;
  if (dec < 2) s += '0'.repeat(2 - dec);
  return s;
}

export function buildPriceRange(snapshotText: string): PriceRange {
  const prices: number[] = [];
  let max = 0;
  for (const line of snapshotText.split('\n').filter(Boolean)) {
    const p = Number(line.split('\t')[2]);
    if (!Number.isFinite(p)) throw new Error(`price-range: bad price in snapshot line "${line}"`);
    if (p > max) max = p;
    if (p > 0) prices.push(p);
  }
  if (prices.length === 0) throw new Error('price-range: snapshot has no priced tools');
  prices.sort((a, b) => a - b);
  const min = prices[0];
  const p90 = prices[Math.ceil(prices.length * 0.9) - 1];
  const text = `$${formatUsd(min)}–$${formatUsd(max)} per call (p90 $${formatUsd(p90)})`;
  return { min, max, p90, text };
}
