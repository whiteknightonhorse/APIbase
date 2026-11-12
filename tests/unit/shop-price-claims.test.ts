/** T-0536: price_claim_mismatch gate (pure rule) and the read-only report script. No DB. */
import { findPriceClaimMismatch, priceClaimMessage } from '../../src/shop/moderation/price-claims';
import { run } from '../../scripts/shop/report-price-claims';
import type { ShopTx } from '../../src/shop/db';

describe('findPriceClaimMismatch (T-0536)', () => {
  it('a $0.75 claim in a $1.00 title is a mismatch naming both values', () => {
    const m = findPriceClaimMismatch('Verify call ($0.75 micro-tier)', 'plain', '1.00');
    expect(m).toEqual({
      field: 'title',
      phrase: '$0.75 micro-tier',
      claimed: '0.75',
      price: '1.00',
    });
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

describe('findPriceClaimMismatch: a stated price, not every amount (T-0803)', () => {
  const D = (d: string, price: string | number = 5) => findPriceClaimMismatch('t', d, price);
  const PASS: Array<[string, string | undefined, string, string | number]> = [
    [
      'P1',
      undefined,
      'Four tables: seller fees as stated, price points found, and what a seller keeps of a $1, $5 and $20 sale under the stated formulas.',
      5,
    ],
    [
      'P2',
      undefined,
      'A fixed fee decides whether a $1 file can be sold. Lemon Squeezy (5% + $0.50) leaves the seller $0.45 of a $1.00 sale.',
      5,
    ],
    ['P3', undefined, 'The fee moved from $0.03 to $0.005 per listing.', 5],
    ['P4', undefined, 'pricing a $1 to $20 file for agent buyers', 5],
    ['P5', '$10 of API credits', '', 5],
    ['P6', undefined, 'Prompts that earned $1,000 in a month', 5],
    ['P7', undefined, 'prices from $1 to $20', 5],
    ['P8', undefined, 'price points of $1, $5 and $20', 5],
    ['P9', undefined, 'a low-cost $3 plan is compared', 5],
    ['P10', undefined, 'Was $10, now $5.', 5],
    ['P11', undefined, 'Save $3 against the list price.', 5],
    ['P12', undefined, 'Price: $5', 5],
    ['P13', undefined, 'Price: $5.', 5],
    ['P14', undefined, 'The price is only $5.00', 5],
    ['P15', undefined, 'priced at USD 5', 5],
    ['P16', undefined, 'Only $5 today', 5],
    ['P17', undefined, '$5 only', 5],
    ['P18', undefined, 'costs just $5', 5],
    ['P19', undefined, 'Price: 3 USDC', 5],
    ['P20', undefined, 'Price: $1,000', 1000],
    ['P21', 'Verify call ($1.00 micro-tier)', '', '1.00'],
    ['P22', undefined, 'the $5 and $20 tiers are compared', 5],
    ['P23', undefined, 'a two-tier plan from $3', 5],
    ['P24', 'Verifier micro-tier', 'a small check', '1.00'],
  ];
  it.each(PASS)('%s returns null', (_id, title, desc, price) => {
    expect(findPriceClaimMismatch(title ?? 't', desc, price)).toBeNull();
  });

  const REFUSE: Array<[string, string, string, string | number, string, string, string]> = [
    ['R1', 'Guide to fees - only $3', '', 5, 'title', 'only $3', '3'],
    ['R2', 't', 'Price: $3', 5, 'description', 'Price: $3', '3'],
    ['R3', 't', 'The price is only $1', 5, 'description', 'price is only $1', '1'],
    ['R4', 't', 'It costs $4.50.', 5, 'description', 'costs $4.50', '4.50'],
    ['R5', 't', 'priced at USD 3', 5, 'description', 'priced at USD 3', '3'],
    ['R6', 't', 'Just $1 for the whole pack', 5, 'description', 'Just $1', '1'],
    ['R7', 't', '$3 only', 5, 'description', '$3 only', '3'],
    ['R8', 't', 'Price - USD 3', 5, 'description', 'Price - USD 3', '3'],
    ['R9', 't', 'for the price of $1', 5, 'description', 'price of $1', '1'],
    ['R10', 't', 'Price: $5,000', 5, 'description', 'Price: $5,000', '5000'],
    ['R11', 't', 'Price: $5. Bundle price: $9.', 5, 'description', 'price: $9', '9'],
    ['R12', 't', 'cost = $ 4', 5, 'description', 'cost = $ 4', '4'],
    ['R13', 'Only $3', 'Price: $4', 5, 'title', 'Only $3', '3'],
    ['R14', 'Verify call ($0.75 micro-tier)', 'plain', '1.00', 'title', '$0.75 micro-tier', '0.75'],
    ['R15', 'Check $0.05 micro-tier', '', '1.00', 'title', '$0.05 micro-tier', '0.05'],
    ['R16', 't', 'the $3 tier', 5, 'description', '$3 tier', '3'],
    ['R17', 't', 'USD 3 Micro-Tier', 5, 'description', 'USD 3 Micro-Tier', '3'],
  ];
  it.each(REFUSE)('%s is refused', (_id, title, desc, price, field, phrase, claimed) => {
    expect(findPriceClaimMismatch(title, desc, price)).toMatchObject({ field, phrase, claimed });
  });

  it('the message quotes the phrase', () => {
    const m = D('Price: $3')!;
    expect(priceClaimMessage(m)).toBe(
      'description: "Price: $3" states a price of 3 USD but price_usd is 5; make it equal to price_usd or reword the sentence',
    );
  });

  it('a price_usd that is neither string nor number gives null; non-string texts are skipped', () => {
    expect(findPriceClaimMismatch('Price: $3', 'Price: $3', null)).toBeNull();
    expect(findPriceClaimMismatch(5, { a: 1 }, 5)).toBeNull();
  });

  it.each([
    ['price + 2000 spaces', 'price' + ' '.repeat(2000)],
    ['$5 + 2000 spaces', '$5' + ' '.repeat(2000)],
    ['price + 2000 x " is"', 'price' + ' is'.repeat(2000)],
    ['price + 2000 x "- " then free', 'Price ' + '- '.repeat(2000) + 'free'],
    ['price + 2000 x ": " then free', 'Price ' + ': '.repeat(2000) + 'free'],
    ['price + 2000 x "= " then free', 'Price ' + '= '.repeat(2000) + 'free'],
  ])('%s returns in under 50 ms', (_n, text) => {
    const t0 = Date.now();
    findPriceClaimMismatch('t', text, 5);
    expect(Date.now() - t0).toBeLessThan(50);
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
      phrase: '$0.75 micro-tier',
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
