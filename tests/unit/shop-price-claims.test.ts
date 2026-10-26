/** T-0536: price_claim_mismatch gate (pure rule) and the read-only report script. No DB. */
import { findPriceClaimMismatch, priceClaimMessage } from '../../src/shop/moderation/price-claims';
import { run } from '../../scripts/shop/report-price-claims';
import type { ShopTx } from '../../src/shop/db';

describe('findPriceClaimMismatch (T-0536)', () => {
  it('a $0.75 claim in a $1.00 title is a mismatch naming both values', () => {
    const m = findPriceClaimMismatch('Verify call ($0.75 micro-tier)', 'plain', '1.00');
    expect(m).toEqual({ field: 'title', claimed: '0.75', price: '1.00' });
    const msg = priceClaimMessage(m!);
    expect(msg).toContain('0.75');
    expect(msg).toContain('1.00');
  });

  it('$1.00, $1 and "USD 1" on a 1.00 product are accepted', () => {
    expect(findPriceClaimMismatch('Pass $1.00', '', '1.00')).toBeNull();
    expect(findPriceClaimMismatch('Pass $ 1', 'costs USD 1.00', 1)).toBeNull();
  });

  it('"micro-tier" without a number is accepted', () => {
    expect(findPriceClaimMismatch('Verifier micro-tier', 'a small check', '1.00')).toBeNull();
  });

  it('a description claim and a "USD <n>" claim are caught', () => {
    expect(findPriceClaimMismatch('Pass', 'only USD 5 today', '1.00')?.field).toBe('description');
    expect(findPriceClaimMismatch('Pass', 'only USD 5 today', '5.00')).toBeNull();
  });

  it('non-string inputs never throw', () => {
    expect(findPriceClaimMismatch({}, ['$9'], '1.00')).toBeNull();
    expect(findPriceClaimMismatch('$9', '', undefined)).toBeNull();
  });
});

describe('report-price-claims (T-0536)', () => {
  const rows = [
    {
      slug: 'aegis-verifier',
      sku: 'm1',
      title: 'Check ($0.75 micro-tier)',
      description: null,
      price_usd: '1.00',
    },
    { slug: 'aegis-verifier', sku: 'ok', title: 'Check', description: '$1.00', price_usd: '1.00' },
  ];
  const db = { $queryRawUnsafe: jest.fn(async () => rows) } as unknown as ShopTx;

  it('lists only the mismatching product and writes nothing', async () => {
    const out = (await run([], db)) as { count: number; items: Array<Record<string, string>> };
    expect(out.count).toBe(1);
    expect(out.items[0]).toMatchObject({
      slug: 'aegis-verifier',
      sku: 'm1',
      claimed: '0.75',
      price_usd: '1.00',
    });
    const sql = String((db.$queryRawUnsafe as jest.Mock).mock.calls[0][0]);
    expect(sql).not.toMatch(/\b(UPDATE|INSERT|DELETE)\b/i);
  });

  it('rejects unknown arguments', async () => {
    await expect(run(['--fix'], db)).rejects.toThrow('unknown argument');
  });
});
