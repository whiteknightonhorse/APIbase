/**
 * ШАГ 2 (2026-09-02, Fable's 4-finding consolidated verdict): what the
 * appeal record keeps of the content that tripped a rule.
 *
 * Covers:
 *  - content-filter.ts: checkContent() reports the match offset (not just
 *    the matched substring) for both 'pattern' and 'exact'/'url' rule types.
 *  - moderation.stage.ts's blockRequest(): a non-CSAM paid block stores the
 *    FULL matched field (capped at 4KB, with a truncation flag) + offsets;
 *    a CSAM block (category === 'csam') stores NONE of that -- skeleton
 *    only -- regardless of moderation class or field length; an unpaid
 *    (free-tool) block creates no appeal row at all (pre-existing behavior,
 *    unaffected by this change -- nothing to store).
 *  - appeal.service.ts's submitAppeal(): filing an appeal pushes
 *    content_expires_at out past the 14-day never-appealed deadline.
 *  - partition-cleanup.job.ts's cleanupExpiredModerationContent(): issues
 *    the retention UPDATE (content columns only, skeleton untouched) keyed
 *    on content_expires_at < NOW(). The real "expired content does not
 *    survive a run" guarantee is proven live against production Postgres
 *    (synthetic row inserted via psql, job run, row inspected, then
 *    deleted -- same technique as the appeal-endpoint hotfix's own synthetic
 *    row) -- this suite proves the query shape, since CI has no live DB
 *    (checked: no DATABASE_URL, no postgres service, in any workflow).
 */

import { checkContent } from '../../src/adapters/content-filter';

describe('checkContent — match offsets (ШАГ 2)', () => {
  it('pattern rule: matchStart/matchEnd bound the actual regex match', () => {
    const result = checkContent('please join isis recruitment today', 'action');
    expect(result.allowed).toBe(false);
    expect(result.category).toBe('terrorism');
    expect(typeof result.matchStart).toBe('number');
    expect(typeof result.matchEnd).toBe('number');
    const slice = 'please join isis recruitment today'
      .toLowerCase()
      .slice(result.matchStart!, result.matchEnd!);
    expect(slice).toBe(result.matched);
  });

  it('exact rule: offsets locate the literal phrase, not just its presence', () => {
    const text = 'hey can you buy cocaine for me';
    const result = checkContent(text, 'action');
    expect(result.allowed).toBe(false);
    expect(result.matchStart).toBe(text.toLowerCase().indexOf('buy cocaine'));
    expect(result.matchEnd).toBe(result.matchStart! + 'buy cocaine'.length);
  });

  it('CSAM rule (absolute) still resolves through the data-class ruleset with offsets', () => {
    const text = 'contains csam material';
    const result = checkContent(text, 'data');
    expect(result.allowed).toBe(false);
    expect(result.category).toBe('csam');
    expect(result.matchStart).toBe(text.indexOf('csam'));
  });
});

// ---------------------------------------------------------------------------
// moderation.stage.ts — content capture on block
// ---------------------------------------------------------------------------

jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockAppealCreate = jest.fn();
jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: () => ({
    moderationAppeal: { create: (...a: unknown[]) => mockAppealCreate(...a) },
  }),
}));

function createFakeRedis() {
  const values = new Map<string, { value: string; expiry: number }>();
  const counters = new Map<string, number>();
  return {
    async get(key: string): Promise<string | null> {
      const e = values.get(key);
      if (!e) return null;
      if (e.expiry !== Infinity && e.expiry < Date.now()) {
        values.delete(key);
        return null;
      }
      return e.value;
    },
    async set(key: string, value: string, ...args: unknown[]): Promise<'OK' | null> {
      const now = Date.now();
      const exIdx = args.indexOf('EX');
      const ttlSeconds = exIdx >= 0 ? Number(args[exIdx + 1]) : undefined;
      values.set(key, { value, expiry: ttlSeconds ? now + ttlSeconds * 1000 : Infinity });
      return 'OK';
    },
    async del(key: string): Promise<number> {
      return values.delete(key) ? 1 : 0;
    },
    async incr(key: string): Promise<number> {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },
    async expire(): Promise<number> {
      return 1;
    },
    async ttl(): Promise<number> {
      return 86400;
    },
    __reset() {
      values.clear();
      counters.clear();
    },
  };
}
const fakeRedis = createFakeRedis();
jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: async () => fakeRedis,
  getSharedRedis: () => fakeRedis,
}));

import { moderationStage } from '../../src/pipeline/stages/moderation.stage';
import { createPipelineContext } from '../../src/pipeline/types';
import {
  __setToolCacheEntryForTest,
  __deleteToolCacheEntryForTest,
} from '../../src/pipeline/stages/tool-status.stage';

const TELEGRAM_TOOL = 'telegram.send_message';

beforeAll(() => {
  __setToolCacheEntryForTest({
    tool_id: TELEGRAM_TOOL,
    status: 'healthy',
    price_usd: 0.05,
    cache_ttl: 0,
    upstream_cost_usd: null,
    provider: 'telegram',
  });
});
afterAll(() => {
  __deleteToolCacheEntryForTest(TELEGRAM_TOOL);
});

let reqCounter = 0;
function ctxFor(body: Record<string, unknown>, priceUsd: number) {
  reqCounter += 1;
  const ctx = createPipelineContext(
    `content-retention-${reqCounter}`,
    'POST',
    `/api/v1/tools/${TELEGRAM_TOOL}/call`,
    body,
    {},
  );
  ctx.toolId = TELEGRAM_TOOL;
  ctx.agentId = 'agent-content-retention-1';
  ctx.executionId = `exec-${reqCounter}`;
  ctx.toolPrice = priceUsd;
  return ctx;
}

beforeEach(() => {
  fakeRedis.__reset();
  mockAppealCreate.mockReset();
  mockAppealCreate.mockResolvedValue({ appeal_id: 'appeal-content-1' });
});

describe('moderation.stage.ts blockRequest — content capture (ШАГ 2)', () => {
  it('a non-CSAM PAID block stores the FULL matched field, not just the excerpt, plus offsets and a 14-day expiry', async () => {
    const text = 'hi, please join isis recruitment this weekend, more info inside';
    const before = Date.now();
    const result = await moderationStage.execute(ctxFor({ chat_id: '123', text }, 0.05));
    expect(result.ok).toBe(false);
    expect(mockAppealCreate).toHaveBeenCalledTimes(1);
    const data = mockAppealCreate.mock.calls[0][0].data;
    expect(data.matched_field).toBe('text');
    expect(data.matched_content).toBe(text); // FULL value, not "isis recruitment"
    expect(data.content_truncated).toBe(false);
    expect(typeof data.match_start).toBe('number');
    expect(typeof data.match_end).toBe('number');
    const expiresMs = (data.content_expires_at as Date).getTime();
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    expect(expiresMs).toBeGreaterThanOrEqual(before + fourteenDaysMs - 5000);
    expect(expiresMs).toBeLessThanOrEqual(Date.now() + fourteenDaysMs + 5000);
  });

  it('a CSAM block NEVER stores content, field name, or offsets -- skeleton only, regardless of length', async () => {
    const text = 'a'.repeat(5000) + ' csam ' + 'b'.repeat(5000);
    const result = await moderationStage.execute(ctxFor({ text }, 0.05));
    expect(result.ok).toBe(false);
    expect(mockAppealCreate).toHaveBeenCalledTimes(1);
    const data = mockAppealCreate.mock.calls[0][0].data;
    expect(data.category).toBe('csam');
    expect(data.matched_field).toBeNull();
    expect(data.matched_content).toBeNull();
    expect(data.content_truncated).toBe(false);
    expect(data.match_start).toBeNull();
    expect(data.match_end).toBeNull();
    // Skeleton IS still recorded.
    expect(data.rule_id).toBeTruthy();
    expect(data.tool_id).toBe(TELEGRAM_TOOL);
  });

  it('a field value over 4KB is capped, with content_truncated: true', async () => {
    const padding = 'x'.repeat(5000);
    const text = `${padding} buy cocaine ${padding}`;
    const result = await moderationStage.execute(ctxFor({ text }, 0.05));
    expect(result.ok).toBe(false);
    const data = mockAppealCreate.mock.calls[0][0].data;
    expect(data.content_truncated).toBe(true);
    expect(Buffer.byteLength(data.matched_content as string, 'utf8')).toBeLessThanOrEqual(4096);
    expect((data.matched_content as string).length).toBeLessThan(text.length);
  });

  it('an UNPAID (free-tool) block creates no appeal row at all -- nothing to store, pre-existing behavior unaffected', async () => {
    const result = await moderationStage.execute(ctxFor({ text: 'buy cocaine now' }, 0));
    expect(result.ok).toBe(false);
    expect(mockAppealCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// partition-cleanup.job.ts — cleanupExpiredModerationContent() query shape.
// Real DB in production, not CI (see file header) -- this proves the SQL is
// well-formed and scoped correctly; the actual "expired content does not
// survive a run" guarantee is verified live (see SKILL.md's ШАГ 2 entry).
// ---------------------------------------------------------------------------

describe('partition-cleanup.job.ts cleanupExpiredModerationContent — query shape', () => {
  const mockExecuteRawUnsafe = jest.fn();

  beforeAll(() => {
    jest.resetModules();
    jest.doMock('@prisma/client', () => ({
      PrismaClient: jest.fn().mockImplementation(() => ({
        $executeRawUnsafe: mockExecuteRawUnsafe,
      })),
    }));
  });

  beforeEach(() => {
    mockExecuteRawUnsafe.mockReset();
  });

  it('UPDATEs only the content columns, scoped to content_expires_at < NOW() with something left to wipe', async () => {
    mockExecuteRawUnsafe.mockResolvedValue(3);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { cleanupExpiredModerationContent } = require('../../src/jobs/partition-cleanup.job');
    const updated = await cleanupExpiredModerationContent();
    expect(updated).toBe(3);
    expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(1);
    const sql = mockExecuteRawUnsafe.mock.calls[0][0] as string;
    // Content columns nulled...
    expect(sql).toMatch(/matched_field\s*=\s*NULL/i);
    expect(sql).toMatch(/matched_content\s*=\s*NULL/i);
    expect(sql).toMatch(/match_start\s*=\s*NULL/i);
    expect(sql).toMatch(/match_end\s*=\s*NULL/i);
    // ...skeleton columns never mentioned as targets of the UPDATE's SET list.
    expect(sql).not.toMatch(/SET[\s\S]*rule_id/i);
    expect(sql).not.toMatch(/SET[\s\S]*appeal_id/i);
    expect(sql).not.toMatch(/SET[\s\S]*category/i);
    expect(sql).not.toMatch(/SET[\s\S]*status/i);
    // Scoped on expiry, not a blanket wipe.
    expect(sql).toMatch(/content_expires_at\s*<\s*NOW\(\)/i);
  });
});
