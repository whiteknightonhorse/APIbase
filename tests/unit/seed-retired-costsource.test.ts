import {
  retiredProviders,
  seedTools,
  planSeedRows,
  type DbToolRow,
  type FullSeedTool,
} from '../../scripts/seed-plan';
import { todoMarkdown } from '../../scripts/pricing/derive-upstream-cost';

const limits = {
  live: { limit_type: 'unlimited' },
  dead: { retired: { since: '2026-10-12', task: 'T-1' } },
};
const retired = retiredProviders(limits);
const cats = new Map([
  ['live.a', 'x'],
  ['live.b', 'x'],
  ['dead.a', 'x'],
  ['dead.b', 'x'],
]);
const tools: FullSeedTool[] = [
  {
    tool_id: 'live.a',
    name: 'A',
    provider: 'live',
    price_usd: '0.002',
    cache_ttl: 60,
    upstream_cost_usd: '0',
    upstream_cost_model: 'free_tier',
  },
  {
    tool_id: 'live.b',
    name: 'B',
    provider: 'live',
    price_usd: '0.002',
    cache_ttl: 60,
    upstream_cost_usd: '0.001',
    upstream_cost_model: 'flat',
  },
  {
    tool_id: 'dead.a',
    name: 'D',
    provider: 'dead',
    price_usd: '0.001',
    cache_ttl: 60,
    upstream_cost_usd: '0',
    upstream_cost_model: 'free_tier',
  },
  {
    tool_id: 'dead.b',
    name: 'D2',
    provider: 'dead',
    price_usd: '0.001',
    cache_ttl: 60,
    upstream_cost_usd: '0',
    upstream_cost_model: 'free_tier',
  },
];
const dbRows: DbToolRow[] = [
  {
    tool_id: 'dead.a',
    name: 'dead.a',
    status: 'unavailable',
    price_usd: '0',
    cache_ttl: 3600,
    upstream_cost_usd: null,
    cost_source: null,
  },
];

function stub(rows: DbToolRow[] = dbRows) {
  return {
    tool: { findMany: jest.fn(async () => rows), upsert: jest.fn(async (_a: unknown) => ({})) },
  };
}

describe('retiredProviders', () => {
  it('returns only providers with a retired object', () => {
    expect([...retired.keys()]).toEqual(['dead']);
  });
});

describe('seedTools (T-0660)', () => {
  it('skips retired providers: no upsert for them, no revive, one log line', async () => {
    const db = stub();
    const logs: string[] = [];
    const res = await seedTools(db, tools, cats, retired, false, (l) => logs.push(l));
    const ids = db.tool.upsert.mock.calls.map(
      (c) => (c[0] as { where: { tool_id: string } }).where.tool_id,
    );
    expect(ids).toEqual(['live.a', 'live.b']);
    expect(res.skippedRetired).toBe(2);
    expect(logs).toContain(
      '[seed] skipped retired provider dead (2 tools, provider-limits.json retired.since 2026-10-12)',
    );
  });

  it('mutation guard: without the retired map the unavailable price-0 row IS revived', async () => {
    const db = stub();
    await seedTools(db, tools, cats, new Map(), false);
    const call = db.tool.upsert.mock.calls.find(
      (c) => (c[0] as { where: { tool_id: string } }).where.tool_id === 'dead.a',
    );
    expect((call?.[0] as { update: { status?: string } }).update.status).toBe('healthy');
  });

  it('writes cost_source yaml:<model>', async () => {
    const db = stub();
    await seedTools(db, tools, cats, retired, false);
    const upd = (id: string) =>
      db.tool.upsert.mock.calls.find(
        (c) => (c[0] as { where: { tool_id: string } }).where.tool_id === id,
      )![0] as {
        update: { cost_source?: string };
        create: { cost_source?: string };
      };
    expect(upd('live.a').update.cost_source).toBe('yaml:free_tier');
    expect(upd('live.a').create.cost_source).toBe('yaml:free_tier');
    expect(upd('live.b').update.cost_source).toBe('yaml:flat');
  });

  it('full --dry-run: findMany called, upsert never, summary format', async () => {
    const db = stub([
      ...dbRows,
      {
        tool_id: 'live.a',
        name: 'A',
        status: 'healthy',
        price_usd: '0.001',
        cache_ttl: 60,
        upstream_cost_usd: null,
        cost_source: null,
      },
    ]);
    const logs: string[] = [];
    const res = await seedTools(db, tools, cats, retired, true, (l) => logs.push(l));
    expect(db.tool.findMany).toHaveBeenCalledTimes(1);
    expect(db.tool.upsert).toHaveBeenCalledTimes(0);
    expect(logs).toContain('live.a price_usd 0.001 -> 0.002');
    expect(logs).toContain('live.a cost_source NULL -> yaml:free_tier');
    expect(res.summary).toBe(
      'would change: 2 tools (price 1, cost 1, cost_source 1, name/ttl 0, revive 0); skipped retired: 2',
    );
  });
});

describe('--only refuses retired', () => {
  it('throws with the skip wording', () => {
    expect(() => planSeedRows(tools, cats, ['dead.a'], retired)).toThrow(
      /skipped retired provider dead \(2 tools, provider-limits.json retired.since 2026-10-12\)/,
    );
  });
});

describe('derive todo second table', () => {
  it('lists yaml:free_tier tools of providers with a paid marker', () => {
    const md = todoMarkdown([], { p: { pricing_url: 'x', billing: 1 }, q: {} }, '2026-11-02', [
      { tool_id: 'p.a', provider: 'p', price_usd: 0.01, cost: '0', cost_source: 'yaml:free_tier' },
      { tool_id: 'p.b', provider: 'p', price_usd: 0.01, cost: '0', cost_source: 'yaml:free_tier' },
      { tool_id: 'q.a', provider: 'q', price_usd: 0.01, cost: '0', cost_source: 'yaml:free_tier' },
    ]);
    expect(md).toContain('## Assumed free tier (operator to confirm)');
    expect(md).toContain('| p | 2 | billing, pricing_url |');
    expect(md).not.toContain('| q |');
  });
});
