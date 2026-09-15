/**
 * ZZ-03-05 (03-SPECIFICATION.md P-1/M-1, zz-03 Q1 ruling-1 + ruling-2): `discover()` is the ONE
 * ranking implementation behind `apibase.discover` (MCP tool), `GET /api/v1/discover` (REST),
 * and the `discover_tools` prompt (now a thin wrapper). This file pins the six acceptance
 * criteria the ruling lists verbatim, plus ruling-2 §5's hot-path contract:
 *   (a) `no_data` quality never serializes a fabricated number
 *   (b) `unavailable` excluded by default, included (and marked) with include_unavailable=true
 *   (c) `category` matches TOOL_DEFINITIONS[toolId].category (same source as MCP/REST) and is a
 *       member of static/llms.txt's published category list, for 5 sampled tools
 *   (d) result order is stable between two identical calls
 *   (e) `apibase.discover` is wired into the normal $0 pipeline path (one ledger row, price 0)
 *   (f) no `redis.keys(` in the discovery code path
 *   (g, ruling-2 §5): candidates come from the in-memory tool cache
 *       (tool-status.stage.ts), never a fresh `db.tool.findMany` in the hot path
 */

// Codebase convention (see tests/unit/escrow-payment-replay.test.ts): mock config/index
// directly rather than depending on real env vars being present in the test environment.
jest.mock('../../src/config/index', () => ({
  config: {
    X402_NETWORK: 'base',
  },
}));

const toolFindManyMock = jest.fn();
const providerStatusFindManyMock = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    tool: { findMany: toolFindManyMock },
    providerStatus: { findMany: providerStatusFindManyMock },
  })),
}));

const redisMgetMock = jest.fn();
const redisKeysMock = jest.fn();

jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: jest.fn(async () => ({
    mget: redisMgetMock,
    keys: redisKeysMock,
  })),
}));

// Deterministic, controllable per test — real getMppConfig() reads live env/wallet config,
// which this file has no business depending on.
const mppConfigMock = jest.fn(() => ({
  enabled: false,
  secretKey: '',
  walletAddress: '',
  privateKey: '',
  realm: 'apibase.pro',
  chainId: 4217,
  usdcAddress: '0x0',
  rpcUrl: '',
  testnet: false,
}));
jest.mock('../../src/config/mpp.config', () => ({
  getMppConfig: () => mppConfigMock(),
}));

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { discover, __resetProviderStateCacheForTest } from '../../src/services/discovery.service';
import {
  __setToolCacheEntryForTest,
  __clearToolCacheForTest,
} from '../../src/pipeline/stages/tool-status.stage';
import { TOOL_DEFINITIONS } from '../../src/mcp/tool-definitions';
import { toolSchemas } from '../../src/schemas/index';

// src/adapters/registry.ts pulls in every adapter, including polymarket's @polymarket/clob-client
// (ESM-only — Jest can't parse it). Same landmine documented in tests/unit/fuzz-all-routes.test.ts;
// this file never imports registry.ts at runtime, and checks the 'apibase' wiring from its source
// text instead (same "shape-proof from real source" convention as incidents-router.test.ts).

/** Seeds one tool-status.stage.ts cache entry from a real TOOL_DEFINITIONS row — the same shape
 *  tool-status.stage.ts's own loadToolCache() would produce from a DB row, minus the DB round
 *  trip (ZZ-03-05 ruling-2 §5). */
function seedEntry(
  def: (typeof TOOL_DEFINITIONS)[number],
  overrides: Partial<{ status: string; price_usd: number }> = {},
) {
  __setToolCacheEntryForTest({
    tool_id: def.toolId,
    status: overrides.status ?? 'healthy',
    price_usd: overrides.price_usd ?? 0.01,
    cache_ttl: 0,
    upstream_cost_usd: null,
    price_floor_usd: null,
    provider: def.toolId.split('.')[0],
  });
}

// Same deterministic-stride sampling as tests/unit/tools-category-source-of-truth.test.ts —
// reproducible, not a real Math.random() pick that could flake.
function sampleDefinitions(n: number) {
  const stride = Math.max(1, Math.floor(TOOL_DEFINITIONS.length / n));
  const picked: (typeof TOOL_DEFINITIONS)[number][] = [];
  for (let i = 0; i < TOOL_DEFINITIONS.length && picked.length < n; i += stride) {
    picked.push(TOOL_DEFINITIONS[i]);
  }
  return picked;
}

beforeEach(() => {
  // Every test owns a clean cache — discover() reads the SAME shared toolCache Map that
  // margin-gate.test.ts etc. also seed, and this file is the one suite that needs "only what
  // I just seeded is in there" (e.g. acceptance (d)'s exact-length checks).
  __clearToolCacheForTest();
  __resetProviderStateCacheForTest();
  toolFindManyMock.mockReset();
  providerStatusFindManyMock.mockReset().mockResolvedValue([]);
  redisMgetMock.mockReset().mockImplementation(async (...keys: string[]) => keys.map(() => null));
  redisKeysMock.mockReset();
  mppConfigMock.mockReset().mockReturnValue({
    enabled: false,
    secretKey: '',
    walletAddress: '',
    privateKey: '',
    realm: 'apibase.pro',
    chainId: 4217,
    usdcAddress: '0x0',
    rpcUrl: '',
    testnet: false,
  });
});

describe('ZZ-03-05 ruling-2 §5: candidates come from the in-memory tool cache, never a fresh DB read', () => {
  it('discover() never calls prisma.tool.findMany', async () => {
    seedEntry(TOOL_DEFINITIONS[0]);

    await discover({});

    expect(toolFindManyMock).not.toHaveBeenCalled();
  });

  it('a tool absent from the cache is absent from results, with no query issued to find it', async () => {
    seedEntry(TOOL_DEFINITIONS[0]);

    const resp = await discover({ limit: 50 });

    expect(resp.results.map((r) => r.tool_id)).toEqual([TOOL_DEFINITIONS[0].toolId]);
    expect(toolFindManyMock).not.toHaveBeenCalled();
  });
});

describe('ZZ-03-05 acceptance (a): no_data quality never serializes a fabricated number', () => {
  it('a tool with no Redis key and no provider_status row gets exactly {status, window_h, provider_reliability_score}', async () => {
    const def = TOOL_DEFINITIONS[0];
    seedEntry(def);
    redisMgetMock.mockResolvedValueOnce([null]);

    const resp = await discover({});

    expect(resp.results).toHaveLength(1);
    expect(resp.results[0].quality).toEqual({
      status: 'no_data',
      window_h: 24,
      provider_reliability_score: null,
    });
    // No uptime_pct/p50_ms/p95_ms/error_rate/total_calls/last_updated sneaking in.
    expect(Object.keys(resp.results[0].quality).sort()).toEqual([
      'provider_reliability_score',
      'status',
      'window_h',
    ]);
  });
});

describe('ZZ-03-05 acceptance (b): unavailable excluded by default, included when asked', () => {
  it('default call filters out a cached "unavailable" tool in-memory', async () => {
    const [healthy, unavailable] = TOOL_DEFINITIONS;
    seedEntry(healthy);
    seedEntry(unavailable, { status: 'unavailable' });

    const resp = await discover({ limit: 50 });

    expect(resp.results.map((r) => r.tool_id)).toEqual([healthy.toolId]);
    expect(toolFindManyMock).not.toHaveBeenCalled();
  });

  it('include_unavailable=true keeps the tool and marks it unavailable', async () => {
    const def = TOOL_DEFINITIONS[1];
    seedEntry(def, { status: 'unavailable' });

    const resp = await discover({ include_unavailable: true });

    expect(resp.results).toHaveLength(1);
    expect(resp.results[0].availability.tool_status).toBe('unavailable');
  });
});

describe('ZZ-03-05 acceptance (c): category is the same source everywhere, for 5 sampled tools', () => {
  const llmsTxt = readFileSync(resolve(__dirname, '../../static/llms.txt'), 'utf8');
  const lines = llmsTxt.split('\n');
  const headingIdx = lines.findIndex((l) => l.startsWith('## Categories'));
  // The list wraps across multiple lines (static/llms.txt is hand-wrapped for readability) —
  // collect every line up to the next blank line, not just the one right after the heading.
  const categoryLines: string[] = [];
  for (let i = headingIdx + 1; i < lines.length && lines[i].trim() !== ''; i++) {
    categoryLines.push(lines[i]);
  }
  const publishedCategories = new Set(
    categoryLines
      .join(' ')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean),
  );

  it('static/llms.txt actually has a non-empty Categories list to check against', () => {
    expect(publishedCategories.size).toBeGreaterThan(0);
  });

  it.each(sampleDefinitions(5).map((def) => [def.toolId, def]))(
    'discover() reports %s.category == TOOL_DEFINITIONS[].category, and it is a published category',
    async (_toolId, def) => {
      const d = def as (typeof TOOL_DEFINITIONS)[number];
      seedEntry(d);

      const resp = await discover({});

      expect(resp.results).toHaveLength(1);
      expect(d.category).toBeDefined();
      expect(resp.results[0].category).toBe(d.category);
      expect(publishedCategories.has(d.category as string)).toBe(true);
    },
  );
});

describe('ZZ-03-05 acceptance (d): result order is stable between two identical calls', () => {
  it('same input + same underlying data -> same tool_id order twice', async () => {
    const defs = sampleDefinitions(6);
    for (const d of defs) seedEntry(d);
    redisMgetMock.mockImplementation(async (...keys: string[]) => keys.map(() => null));

    const first = await discover({ limit: 10 });
    const second = await discover({ limit: 10 });

    expect(first.results.map((r) => r.tool_id)).toEqual(second.results.map((r) => r.tool_id));
    // Not a degenerate single-element check.
    expect(first.results.length).toBeGreaterThan(1);
  });
});

describe('ZZ-03-05 acceptance (e): apibase.discover is wired into the normal $0 pipeline path', () => {
  const configPath = resolve(__dirname, '../../config/tool_provider_config.yaml');
  const ymlConfig = parse(readFileSync(configPath, 'utf8')) as {
    tools: { tool_id: string; provider: string; price_usd: string }[];
  };

  it('TOOL_DEFINITIONS declares apibase.discover as a free, read-only, developer-category tool', () => {
    const def = TOOL_DEFINITIONS.find((d) => d.toolId === 'apibase.discover');
    expect(def).toBeDefined();
    expect(def!.mcpName).toBe('apibase.discovery.search');
    expect(def!.category).toBe('developer');
    expect(def!.annotations?.readOnlyHint).toBe(true);
  });

  it('config/tool_provider_config.yaml prices apibase.discover at $0 under provider "apibase"', () => {
    const entry = ymlConfig.tools.find((t) => t.tool_id === 'apibase.discover');
    expect(entry).toBeDefined();
    expect(entry!.provider).toBe('apibase');
    expect(entry!.price_usd).toBe('0');
  });

  it('registry.ts routes the "apibase" tool_id prefix to ApibaseAdapter', () => {
    const registrySrc = readFileSync(resolve(__dirname, '../../src/adapters/registry.ts'), 'utf8');
    expect(registrySrc).toMatch(/case 'apibase':[\s\S]{0,120}new ApibaseAdapter\(\)/);
  });
});

describe('ZZ-03-05 acceptance (f): no redis.keys( in the discovery code path', () => {
  it('discovery.service.ts and the apibase adapter source contain no redis.keys( call', () => {
    const files = [
      resolve(__dirname, '../../src/services/discovery.service.ts'),
      resolve(__dirname, '../../src/adapters/apibase/index.ts'),
    ];
    for (const f of files) {
      expect(readFileSync(f, 'utf8')).not.toContain('redis.keys(');
    }
  });

  it('a real discover() call never invokes redis.keys, only mget', async () => {
    seedEntry(TOOL_DEFINITIONS[0]);

    await discover({});

    expect(redisKeysMock).not.toHaveBeenCalled();
  });
});

describe('provider_state comes from a cached provider_status read, not a per-request query', () => {
  it('two calls within the same process issue at most one providerStatus.findMany', async () => {
    seedEntry(TOOL_DEFINITIONS[0]);

    await discover({});
    await discover({});

    expect(providerStatusFindManyMock).toHaveBeenCalledTimes(1);
  });
});

describe('regression: existing tools/list registration is unaffected by adding apibase.discover', () => {
  // tool-adapter.ts's registerTools() (the actual MCP tools/list registration path) transitively
  // imports src/adapters/registry.ts, which pulls in every adapter including polymarket's
  // @polymarket/clob-client (ESM-only — Jest can't parse it, same landmine documented above and
  // in tests/unit/fuzz-all-routes.test.ts). registerTools() skips any TOOL_DEFINITIONS entry with
  // no matching toolSchemas entry (logging a warning) rather than crashing, so this checks the
  // same data registerTools() reads directly, without importing the file itself. Pre-existing
  // gaps (e.g. cma.*/banxico.* at the time of writing) are NOT this task's scope to fix — the one
  // thing that matters here is that apibase.discover isn't one of them.
  it('apibase.discover is not among the (pre-existing) TOOL_DEFINITIONS entries missing a schema', () => {
    const missing = TOOL_DEFINITIONS.filter((d) => !toolSchemas[d.toolId]).map((d) => d.toolId);
    expect(missing).not.toContain('apibase.discover');
  });

  it('toolIds are still unique after adding apibase.discover', () => {
    const ids = TOOL_DEFINITIONS.map((d) => d.toolId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('apibase.discover is registered exactly once, with a resolvable schema', () => {
    const matches = TOOL_DEFINITIONS.filter((d) => d.toolId === 'apibase.discover');
    expect(matches).toHaveLength(1);
    expect(toolSchemas['apibase.discover']).toBeDefined();
  });
});
