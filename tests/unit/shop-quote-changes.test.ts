/** T-0905: quoteChanges, the what-moved field of 410 quote_expired (pure, no DB). */
import { quoteChanges } from '../../src/shop/quote.service';

jest.mock('../../src/config', () => ({ config: { ENCRYPTION_KEY: 'k'.repeat(40) } }));

const line = (sku: string, unit: number, qty = 1, variant?: string) => ({
  sku,
  ...(variant ? { variant } : {}),
  title: 'Thing',
  qty,
  unit_price_usd: unit,
  line_total_usd: unit * qty,
});

describe('quoteChanges', () => {
  it('QC1: same prices -> changed false, lines [], no shipping key', () => {
    const items = [line('a', 10, 2), line('b', 3.5)];
    const c = quoteChanges(
      { items, total_usd: '23.5', shipping_usd: '0', shipping_option: null },
      { items: items.map((l) => ({ ...l })), total_usd: 23.5 },
    );
    expect(c).toEqual({ changed: false, total_usd: { old: 23.5, new: 23.5 }, lines: [] });
    expect('shipping_usd' in c).toBe(false);
  });

  it('QC2: one unit price moved -> one line (with variant) and both totals', () => {
    const c = quoteChanges(
      {
        items: [line('a', 10, 2), line('b', 3.5, 1, 'red')],
        total_usd: '23.5',
        shipping_usd: '0',
        shipping_option: null,
      },
      { items: [line('a', 10, 2), line('b', 4.25, 1, 'red')], total_usd: 24.25 },
    );
    expect(c).toEqual({
      changed: true,
      total_usd: { old: 23.5, new: 24.25 },
      lines: [{ sku: 'b', variant: 'red', unit_price_usd: { old: 3.5, new: 4.25 } }],
    });
  });

  it('QC3: shipping price moved -> shipping_usd old/new, changed true, lines []', () => {
    const items = [line('p', 20)];
    const c = quoteChanges(
      { items, total_usd: '25', shipping_usd: '5', shipping_option: 'std' },
      { items, total_usd: 27, shipping_usd: 7 },
    );
    expect(c).toEqual({
      changed: true,
      total_usd: { old: 25, new: 27 },
      shipping_usd: { old: 5, new: 7 },
      lines: [],
    });
  });

  it('QC4: shipping unchanged is still reported (present when either quote has it), changed false', () => {
    const items = [line('p', 20)];
    const c = quoteChanges(
      { items, total_usd: '25', shipping_usd: '5', shipping_option: 'std' },
      { items, total_usd: 25, shipping_usd: 5 },
    );
    expect(c).toEqual({
      changed: false,
      total_usd: { old: 25, new: 25 },
      shipping_usd: { old: 5, new: 5 },
      lines: [],
    });
  });

  it('QC5: inputs are not mutated (the fresh quote stays as built)', () => {
    const old = {
      items: [line('a', 10)],
      total_usd: '10',
      shipping_usd: '0',
      shipping_option: null,
    };
    const fresh = { items: [line('a', 12)], total_usd: 12 };
    const before = structuredClone({ old, fresh });
    quoteChanges(old, fresh);
    expect({ old, fresh }).toEqual(before);
  });
});
