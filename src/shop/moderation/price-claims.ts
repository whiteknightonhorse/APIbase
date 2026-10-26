/**
 * T-0536 (SITE-AUDIT-1026 B-04): a currency amount stated in a product title or description must
 * equal the product's own `price_usd`. Pure text check, shared by the catalog write path and the
 * read-only report `scripts/shop/report-price-claims.ts`.
 */

const CLAIM_RE = /(?:\$\s?|\bUSD\s?)(\d+(?:\.\d+)?)/gi;

export interface PriceClaimMismatch {
  field: 'title' | 'description';
  claimed: string;
  price: string;
}

const same = (claimed: string, price: string): boolean =>
  claimed === price || Number(claimed) === Number(price);

/** The first amount in `title` or `description` that differs from `price_usd`, or null. */
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
      if (!same(m[1], price)) return { field, claimed: m[1], price };
    }
  }
  return null;
}

export const priceClaimMessage = (m: PriceClaimMismatch): string =>
  `${m.field}: states ${m.claimed} USD but price_usd is ${m.price}; make the text match the price or remove the amount`;
