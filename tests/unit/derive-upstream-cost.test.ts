import {
  isFreeProvider,
  planDerivation,
  todoMarkdown,
  COST_SOURCE_FREE,
} from '../../scripts/pricing/derive-upstream-cost';

describe('T-0583 derive-upstream-cost', () => {
  it('treats unlimited and free-windowed plans without a paid tier marker as free', () => {
    expect(isFreeProvider({ limit_type: 'unlimited' })).toBe(true);
    expect(
      isFreeProvider({ limit_type: 'monthly', limit_proof: 'Free plan: 1000 calls/month' }),
    ).toBe(true);
    expect(
      isFreeProvider({ limit_type: 'monthly', limit_proof: 'Starter: 1000 calls/month' }),
    ).toBe(false);
  });

  it('never derives zero for a provider with a paid tier marker, credits, trial or no entry', () => {
    expect(isFreeProvider({ limit_type: 'unlimited', pricing_url: 'https://x.invalid' })).toBe(
      false,
    );
    expect(isFreeProvider({ limit_type: 'unlimited', billing: {} })).toBe(false);
    expect(isFreeProvider({ limit_type: 'credits', limit_proof: 'free credits' })).toBe(false);
    expect(isFreeProvider({ limit_type: 'trial', limit_proof: 'free trial' })).toBe(false);
    expect(isFreeProvider(undefined)).toBe(false);
  });

  it('plans only NULL-cost rows and lists the rest, >= $0.01 first', () => {
    const limits = {
      freeco: { limit_type: 'unlimited' },
      paidco: { limit_type: 'unlimited', pricing_url: 'u' },
    };
    const rows = [
      { tool_id: 'a.1', provider: 'freeco', price_usd: 0.001, cost: null },
      { tool_id: 'a.2', provider: 'freeco', price_usd: 0.001, cost: '0.0004' },
      { tool_id: 'b.1', provider: 'paidco', price_usd: 0.002, cost: null },
      { tool_id: 'b.2', provider: 'paidco', price_usd: 0.5, cost: null },
    ];
    const { derive, remaining } = planDerivation(rows, limits);
    expect(derive.map((r) => r.tool_id)).toEqual(['a.1']);
    expect(remaining.map((r) => r.tool_id)).toEqual(['b.1', 'b.2']);
    const md = todoMarkdown(remaining, limits, '2026-10-27');
    expect(md.indexOf('`b.2`')).toBeLessThan(md.indexOf('| paidco |'));
    expect(md).toContain('pricing_url');
    expect(COST_SOURCE_FREE).toBe('provider-limits:free');
  });
});
