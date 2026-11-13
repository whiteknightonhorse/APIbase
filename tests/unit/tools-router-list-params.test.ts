/**
 * T-0836: GET /api/tools and GET /api/v1/tools honour limit, cursor, category and view=compact.
 * Runs the real tool-registry.service over a fake Prisma that serves every TOOL_DEFINITIONS row,
 * so the byte sizes are those of the full fixture. A request without any of the four parameters
 * must answer exactly what it answered before (golden test).
 */
const mockRows: Array<{
  tool_id: string;
  name: string;
  provider: string;
  status: string;
  price_usd: number;
  category: string;
  namespace: string;
}> = [];

jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: () => ({
    tool: {
      findMany: jest.fn(
        async (args: { where: { tool_id?: { gt: string }; category?: string }; take?: number }) => {
          const w = args.where ?? {};
          const rows = mockRows.filter(
            (r) =>
              (!w.tool_id || r.tool_id > w.tool_id.gt) &&
              (!w.category || r.category === w.category),
          );
          return typeof args.take === 'number' ? rows.slice(0, args.take) : rows;
        },
      ),
      count: jest.fn(
        async (args: { where: { category?: string } }) =>
          mockRows.filter((r) => !args.where.category || r.category === args.where.category).length,
      ),
    },
    providerStatus: { findMany: jest.fn(async () => []) },
    incident: { groupBy: jest.fn(async () => []) },
  }),
}));
jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: jest.fn(async () => {
    throw new Error('no redis in unit test');
  }),
}));
jest.mock('../../src/services/alternatives.service', () => ({
  getAlternativesForTool: jest.fn(async () => []),
}));
jest.mock('../../src/mcp/tool-fingerprint', () => ({
  ...jest.requireActual('../../src/mcp/tool-fingerprint'),
  getManifestSha256: () => 'a'.repeat(64),
  getManifest: jest.fn(),
}));
jest.mock('../../src/services/discovery.service', () => ({
  discover: jest.fn(),
  categorySummary: jest.fn(),
}));

import { toolsRouter } from '../../src/routes/tools.router';
import { TOOL_DEFINITIONS } from '../../src/mcp/tool-definitions';
import { AppError } from '../../src/types/errors';
import {
  getPublicCatalog,
  getToolsPaginated,
  DEFAULT_TOOLS_LIMIT,
} from '../../src/services/tool-registry.service';
import { summarize, toCompact, COMPACT_SUMMARY_MAX } from '../../src/services/tool-compact';
import type { Request, Response, NextFunction } from 'express';

function getHandler(path: string): (req: Request, res: Response, next: NextFunction) => unknown {
  const layer = (
    toolsRouter as unknown as {
      stack: Array<{ route?: { path: string; stack: Array<{ handle: unknown }> } }>;
    }
  ).stack.find((l) => l.route?.path === path);
  if (!layer?.route) throw new Error(`route ${path} not registered`);
  return layer.route.stack[layer.route.stack.length - 1].handle as (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => unknown;
}

async function call(path: string, query: Record<string, unknown> = {}) {
  let body: unknown;
  let status = 0;
  const res = {
    setHeader: jest.fn(),
    status: jest.fn((s: number) => {
      status = s;
      return res;
    }),
    json: jest.fn((b: unknown) => {
      body = b;
      return res;
    }),
  } as unknown as Response;
  const next = jest.fn();
  await getHandler(path)({ query } as unknown as Request, res, next);
  return { body: body as Record<string, any>, status, next }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

beforeAll(() => {
  const seen = new Set<string>();
  for (const def of TOOL_DEFINITIONS) {
    const id = def.toolId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    mockRows.push({
      tool_id: id,
      name: id,
      provider: id.split('.')[0],
      status: 'active',
      price_usd: 0.001,
      category: def.category ?? 'other',
      namespace: id.split('.')[0],
    });
  }
  mockRows.sort((a, b) => (a.tool_id < b.tool_id ? -1 : 1));
});

describe('summarize', () => {
  it('keeps the first sentence', () => {
    expect(summarize('Get weather. Second sentence here.')).toBe('Get weather.');
  });
  it('cuts a long sentence at 160 characters on a word boundary', () => {
    const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ');
    const out = summarize(long);
    expect(out.length).toBeLessThanOrEqual(COMPACT_SUMMARY_MAX);
    expect(long.startsWith(out)).toBe(true);
    expect(long[out.length]).toBe(' ');
  });
  it('does not stop at an abbreviation', () => {
    expect(summarize('List vehicle models for a make and/or year (e.g. Honda). Second.')).toBe(
      'List vehicle models for a make and/or year (e.g. Honda).',
    );
    expect(summarize('Get U.S. consumer prices by series. More text.')).toBe(
      'Get U.S. consumer prices by series.',
    );
    expect(summarize('Lists rates, fees, etc. and totals. More.')).toBe(
      'Lists rates, fees, etc. and totals.',
    );
  });
  it('is empty for a non-string', () => {
    expect(summarize(undefined)).toBe('');
  });
  it('toCompact carries exactly five keys', () => {
    const item = toCompact({
      id: 'a.b',
      name: 'n',
      category: 'c',
      description: 'D. E.',
      pricing: { price_usd: 0.5 },
    });
    expect(Object.keys(item).sort()).toEqual(['category', 'id', 'name', 'price_usd', 'summary']);
  });
});

describe('GET /api/tools with parameters', () => {
  it('honours limit and returns total and truncated with the cursor', async () => {
    const { body, status } = await call('/api/tools', { limit: '5' });
    expect(status).toBe(200);
    expect(body.tools).toHaveLength(5);
    expect(body.total).toBe(mockRows.length);
    expect(body.truncated).toBe(true);
    expect(body.pagination.cursor).toEqual(expect.any(String));
    expect(body).toEqual(
      expect.objectContaining({
        platform: 'APIbase',
        version: '1.0',
        manifest_sha256: expect.any(String),
      }),
    );
    expect(body.tools[0]).toHaveProperty('input_schema');
  });

  it('compact page of 100 on the full fixture is under 50 KB and has five keys per item', async () => {
    const { body } = await call('/api/tools', { view: 'compact', limit: '100' });
    expect(body.tools).toHaveLength(100);
    expect(body.truncated).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThan(50_000);
    for (const t of body.tools) {
      expect(Object.keys(t).sort()).toEqual(['category', 'id', 'name', 'price_usd', 'summary']);
    }
  });

  it('total and truncated are correct on the last page', async () => {
    const limit = 500;
    let cursor: string | undefined;
    let seen = 0;
    let last: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (let i = 0; i < 20; i++) {
      const q: Record<string, unknown> = { view: 'compact', limit: String(limit) };
      if (cursor) q.cursor = cursor;
      last = (await call('/api/tools', q)).body;
      seen += last.tools.length;
      expect(last.total).toBe(mockRows.length);
      if (!last.truncated) break;
      cursor = last.pagination.cursor;
    }
    expect(last.truncated).toBe(false);
    expect(last.pagination.cursor).toBeNull();
    expect(seen).toBe(mockRows.length);
  });

  it('category filters rows and total', async () => {
    const cat = mockRows[0].category;
    const expected = mockRows.filter((r) => r.category === cat).length;
    const { body } = await call('/api/tools', { category: cat, view: 'compact' });
    expect(body.total).toBe(expected);
    expect(body.tools.every((t: { category: string }) => t.category === cat)).toBe(true);
  });

  it.each([
    ['view', 'tiny'],
    ['limit', '0'],
    ['limit', '2001'],
    ['limit', ['1', '2']],
    ['view', ['full', 'compact']],
    ['category', 'not-a-category'],
    ['category', ['x']],
  ])('rejects %s=%j with 400', async (key, value) => {
    const { next, status } = await call('/api/tools', { [key as string]: value });
    expect(status).toBe(0);
    const err = next.mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.httpStatus).toBe(400);
  });
});

describe('GET /api/v1/tools with parameters', () => {
  it('view=compact returns data items of five keys plus total and truncated', async () => {
    const { body } = await call('/api/v1/tools', { view: 'compact', limit: '100' });
    expect(body.data).toHaveLength(100);
    expect(body.total).toBe(mockRows.length);
    expect(body.truncated).toBe(true);
    expect(body.pagination.has_more).toBe(true);
    expect(Object.keys(body.data[0]).sort()).toEqual([
      'category',
      'id',
      'name',
      'price_usd',
      'summary',
    ]);
    expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThan(50_000);
  });

  it('view=full keeps the full item and adds truncated', async () => {
    const { body } = await call('/api/v1/tools', { view: 'full', limit: '2' });
    expect(body.data[0]).toHaveProperty('input_schema');
    expect(body.truncated).toBe(true);
  });

  it('rejects an unknown view with 400', async () => {
    const { next } = await call('/api/v1/tools', { view: 'x' });
    expect((next.mock.calls[0][0] as AppError).httpStatus).toBe(400);
  });
});

describe('golden: a request without the four parameters is unchanged', () => {
  it('/api/v1/tools answers byte for byte what getToolsPaginated returns', async () => {
    const { body, status } = await call('/api/v1/tools', {});
    expect(status).toBe(200);
    const expected = await getToolsPaginated(null, DEFAULT_TOOLS_LIMIT, {
      maxPrice: undefined,
      tier: undefined,
      category: undefined,
    });
    expect(JSON.stringify(body)).toBe(JSON.stringify(expected));
    expect(Object.keys(body)).toEqual(Object.keys(expected));
    expect(body).not.toHaveProperty('truncated');
    expect(body.data[0]).toHaveProperty('input_schema');
  });

  it('/api/v1/tools with max_price only has no truncated', async () => {
    const { body } = await call('/api/v1/tools', { max_price: '1' });
    expect(body).not.toHaveProperty('truncated');
  });

  it('/api/tools answers byte for byte what getPublicCatalog returns', async () => {
    const { body, status } = await call('/api/tools', {});
    expect(status).toBe(200);
    const expected = await getPublicCatalog();
    // updated_at is the time of the call; every other byte must match
    const fixed = (o: object) => JSON.stringify({ ...o, updated_at: 'T' });
    expect(fixed(body)).toBe(fixed(expected));
    expect(Object.keys(body).sort()).toEqual([
      'manifest_sha256',
      'platform',
      'tools',
      'total',
      'updated_at',
      'version',
    ]);
    // full entries, not compact ones
    expect(body.tools[0]).toHaveProperty('input_schema');
  });
});
