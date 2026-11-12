/**
 * T-0536 (SITE-AUDIT-1026 B-04), narrowed by T-0803: an amount written `$N` or `USD N` in a product
 * title or description must equal the product's own `price_usd` only when the text states it as the
 * price (after price/priced/cost/costs, next to only/just, or followed by `tier`); other amounts are
 * content and are not checked. Pure text check, shared by the catalog write path and the read-only
 * report `scripts/shop/report-price-claims.ts`.
 */

const N = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)`;
const AMOUNT = String.raw`(?:\$\s?|\bUSD\s?)${N}`;
const FILL = String.raw`(?:\s*[:=–—-]\s*|\s+(?:is|of|at|now|only|just)\b)*\s*`;
const CLAIM_RE = new RegExp(
  String.raw`(?<![-\w])(?:price|priced|costs?)\b${FILL}${AMOUNT}` +
    String.raw`|(?<![-\w])(?:only|just)\s+${AMOUNT}` +
    String.raw`|${AMOUNT}\s+only\b` +
    String.raw`|${AMOUNT}\s+(?:[a-z]+-)?tier\b`,
  'gi',
);

export interface PriceClaimMismatch {
  field: 'title' | 'description';
  /** The matched text as written. */
  phrase: string;
  /** The amount without thousands commas. */
  claimed: string;
  price: string;
}

const same = (claimed: string, price: string): boolean =>
  claimed === price || Number(claimed) === Number(price);

/** The first stated price in `title` or `description` that differs from `price_usd`, or null. */
export function findPriceClaimMismatch(
  title: unknown,
  description: unknown,
  price_usd: unknown,
): PriceClaimMismatch | null {
  if (typeof price_usd !== 'string' && typeof price_usd !== 'number') return null;
  const price = String(price_usd);
  const fields: Array<['title' | 'description', unknown]> = [
    ['title', title],
    ['description', description],
  ];
  for (const [field, text] of fields) {
    if (typeof text !== 'string') continue;
    for (const m of text.matchAll(CLAIM_RE)) {
      const raw = m.slice(1).find((g) => g !== undefined);
      if (raw === undefined) continue;
      const claimed = raw.replace(/,/g, '');
      if (!same(claimed, price)) return { field, phrase: m[0], claimed, price };
    }
  }
  return null;
}

export const priceClaimMessage = (m: PriceClaimMismatch): string =>
  `${m.field}: "${m.phrase}" states a price of ${m.claimed} USD but price_usd is ${m.price}; make it equal to price_usd or reword the sentence`;
