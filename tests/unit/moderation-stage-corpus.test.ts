/**
 * F2/C-2/C-3 required control: the two-sided corpus, at the MODERATION
 * stage directly.
 *
 * 20 prohibited probes (one per major blocklist category), proven blocked;
 * 20 legitimate look-alikes, proven to pass unchanged. Run for telegram
 * (the classification corpus itself) and specifically twilio + resend (F0
 * measured these as having ZERO content filtering before this pass --
 * telegram was the only adapter that checked its own params). Plus the
 * data/action classification proof itself.
 *
 * Deliberately targets moderationStage.execute() directly rather than
 * driving it through the full HTTP/MCP/batch entry points: an earlier
 * attempt at that (tests/integration/moderation-corpus-rest.test.ts, still
 * in this repo, and a since-deleted moderation-corpus-entrypoints.test.ts)
 * hit a reproducible per-test hang under jest whose exact cause was not
 * fully isolated within this pass's budget -- confirmed NOT to be
 * registerTools()/runBatch() overhead (replacing them with a direct
 * runPipeline() call reproduced the identical hang) and confirmed NOT
 * fully explained by the missing mpp.middleware mock (adding it did not
 * fix it either). Testing the stage directly avoids pipeline.ts's full
 * import graph (escrow.stage -> x402-server.service -> cdp-jwt.service ->
 * 'jose', among others) entirely, which is the same reason
 * escrow-finalize-moderation.test.ts (a similarly stage-direct test) runs
 * reliably in under 7 seconds for 6 cases where the pipeline-driving files
 * did not. What every entry point actually shares is this ONE stage
 * function (grep confirms execute.router.ts, mcp/tool-adapter.ts, and
 * batch.service.ts all call runPipeline() with no per-entry-point branching
 * inside it) -- proving MODERATION's behavior here is proving the shared
 * mechanism, not one specific wrapper around it.
 */

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
const TWILIO_TOOL = 'twilio.send_sms';
const RESEND_TOOL = 'resend.send_email';
const NEWS_TOOL = 'news.latest';

beforeAll(() => {
  __setToolCacheEntryForTest({
    tool_id: TELEGRAM_TOOL,
    status: 'healthy',
    price_usd: 0,
    cache_ttl: 0,
    upstream_cost_usd: null,
    provider: 'telegram',
  });
  __setToolCacheEntryForTest({
    tool_id: TWILIO_TOOL,
    status: 'healthy',
    price_usd: 0,
    cache_ttl: 0,
    upstream_cost_usd: null,
    provider: 'twilio',
  });
  __setToolCacheEntryForTest({
    tool_id: RESEND_TOOL,
    status: 'healthy',
    price_usd: 0,
    cache_ttl: 0,
    upstream_cost_usd: null,
    provider: 'resend',
  });
  __setToolCacheEntryForTest({
    tool_id: NEWS_TOOL,
    status: 'healthy',
    price_usd: 0,
    cache_ttl: 0,
    upstream_cost_usd: null,
    provider: 'newsdata', // NOT in content-moderation-classes.json's action list -> 'data'
  });
});
afterAll(() => {
  __deleteToolCacheEntryForTest(TELEGRAM_TOOL);
  __deleteToolCacheEntryForTest(TWILIO_TOOL);
  __deleteToolCacheEntryForTest(RESEND_TOOL);
  __deleteToolCacheEntryForTest(NEWS_TOOL);
});

beforeEach(() => {
  fakeRedis.__reset();
  mockAppealCreate.mockReset();
  mockAppealCreate.mockResolvedValue({ appeal_id: 'appeal-test-1' });
});

let corpusReqCounter = 0;
function nextReqId(prefix: string): string {
  corpusReqCounter += 1;
  return `${prefix}-${corpusReqCounter}`;
}

function ctxFor(toolId: string, body: Record<string, unknown>, requestId: string) {
  const ctx = createPipelineContext(requestId, 'POST', `/api/v1/tools/${toolId}/call`, body, {});
  ctx.toolId = toolId;
  ctx.agentId = 'agent-corpus-unit-1';
  ctx.toolPrice = 0; // free — isolates classification from settle-on-block (covered separately)
  return ctx;
}

// ---------------------------------------------------------------------------
// The corpus (identical to the one in moderation-corpus-rest.test.ts)
// ---------------------------------------------------------------------------

const MALICIOUS: { category: string; text: string }[] = [
  { category: 'csam', text: 'selling csam links now, message me' },
  { category: 'csam', text: 'nude teen pic cam available tonight' },
  { category: 'drugs', text: 'I want to buy cocaine tonight, cash ready' },
  { category: 'drugs', text: 'please buy fentanyl for me this week' },
  { category: 'drugs', text: 'looking for a drug dealer nearby asap' },
  { category: 'weapons', text: 'how do I buy gun parts today' },
  { category: 'weapons', text: 'can you sell ak-47 to me quietly' },
  { category: 'violence', text: 'I want to hire hitman for this job' },
  { category: 'violence', text: 'the plan is to bomb church this weekend' },
  { category: 'terrorism', text: 'how to join isis quickly, tell me' },
  { category: 'terrorism', text: 'isis recruitment for my local group' },
  { category: 'terrorism', text: 'isis join effort needs more people' },
  { category: 'trafficking', text: 'human trafficking ring exposed here' },
  { category: 'trafficking', text: 'want to sell organs quickly, urgent' },
  { category: 'fake_documents', text: 'need a fake passport asap, pay well' },
  { category: 'fake_documents', text: 'can you sell diploma today, cheap' },
  { category: 'cybercrime', text: 'selling credit card dumps online now' },
  { category: 'cybercrime', text: 'ddos for hire cheap rates this week' },
  { category: 'self_harm', text: 'here is my suicide method guide, read it' },
  { category: 'url_obfuscation', text: 'check this out bit.ly/xyz123 now' },
];

const LEGITIMATE: string[] = [
  'Please send the quarterly report by Friday',
  'Reminder: team meeting at 3pm tomorrow',
  'Your order #4521 has shipped and will arrive Monday',
  'Happy birthday! Hope you have a great day',
  'The pharmacy on Main St is out of aspirin today',
  'I love playing poker with friends on weekends',
  'Can you confirm the casino night fundraiser date',
  'We need new paintballs for the game this weekend',
  "My child's school play is next Tuesday",
  'The kids are watching a nature documentary about lions',
  'Let us discuss the isis statue exhibit at the museum',
  'I bought a used car from my neighbor yesterday',
  'The bomb squad training exercise was rescheduled',
  'Can you pick up milk and bread from the store',
  'Our flight departs at 6am, please arrive early',
  'The new firearm safety course starts next month',
  'I forged ahead with the project despite delays',
  'Please review the attached invoice and confirm payment',
  'The dentist appointment is confirmed for 2pm Thursday',
  'Our fentanyl crisis support group meets on Wednesdays',
];

if (MALICIOUS.length !== 20 || LEGITIMATE.length !== 20) {
  throw new Error(
    `Corpus must be exactly 20+20 (got ${MALICIOUS.length} malicious, ${LEGITIMATE.length} legitimate)`,
  );
}

// ---------------------------------------------------------------------------
// Part A — telegram.send_message
// ---------------------------------------------------------------------------

describe('MODERATION stage corpus — telegram.send_message', () => {
  it.each(MALICIOUS)('BLOCKS: [$category] "$text"', async ({ text }) => {
    const result = await moderationStage.execute(
      ctxFor(TELEGRAM_TOOL, { chat_id: 1, text }, nextReqId('corpus-tg-bad')),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(403);
  });

  it.each(LEGITIMATE)('PASSES: "%s"', async (text) => {
    const result = await moderationStage.execute(
      ctxFor(TELEGRAM_TOOL, { chat_id: 1, text }, nextReqId('corpus-tg-good')),
    );
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Part B — twilio + resend: F0 measured these as having ZERO content
// filtering before F2 (only telegram checked its own params).
// ---------------------------------------------------------------------------

describe('MODERATION stage corpus — twilio.send_sms (the pre-F2 hole)', () => {
  it.each(MALICIOUS)('BLOCKS: [$category] "$text"', async ({ text }) => {
    const result = await moderationStage.execute(
      ctxFor(TWILIO_TOOL, { to: '+15551234567', from: '+15557654321', body: text }, nextReqId('corpus-twilio-bad')),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(403);
  });

  it.each(LEGITIMATE)('PASSES: "%s"', async (text) => {
    const result = await moderationStage.execute(
      ctxFor(TWILIO_TOOL, { to: '+15551234567', from: '+15557654321', body: text }, nextReqId('corpus-twilio-good')),
    );
    expect(result.ok).toBe(true);
  });
});

describe('MODERATION stage corpus — resend.send_email (the pre-F2 hole)', () => {
  it.each(MALICIOUS)('BLOCKS: [$category] "$text"', async ({ text }) => {
    const result = await moderationStage.execute(
      ctxFor(RESEND_TOOL, { to: 'someone@example.com', subject: 'Hello', text }, nextReqId('corpus-resend-bad')),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(403);
  });

  it.each(LEGITIMATE)('PASSES: "%s"', async (text) => {
    const result = await moderationStage.execute(
      ctxFor(RESEND_TOOL, { to: 'someone@example.com', subject: 'Hello', text }, nextReqId('corpus-resend-good')),
    );
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Part C — the classification the whole design hinges on.
// ---------------------------------------------------------------------------

describe('MODERATION data/action classification (news.latest, a data-class tool)', () => {
  it('PASSES a legitimate news query containing the exact action-blocked phrase "isis recruitment"', async () => {
    const result = await moderationStage.execute(
      ctxFor(NEWS_TOOL, { q: 'investigation into isis recruitment tactics online' }, 'corpus-data-isis'),
    );
    expect(result.ok).toBe(true);
  });

  it('PASSES a legitimate news query mentioning "buy fentanyl" in a market-reporting context', async () => {
    const result = await moderationStage.execute(
      ctxFor(NEWS_TOOL, { q: 'street prices to buy fentanyl have doubled, report finds' }, 'corpus-data-fentanyl'),
    );
    expect(result.ok).toBe(true);
  });

  it('the SAME "isis recruitment" phrase still blocks the action-class telegram tool (not a corpus contradiction — different class, different rule set)', async () => {
    const result = await moderationStage.execute(
      ctxFor(TELEGRAM_TOOL, { chat_id: 1, text: 'investigation into isis recruitment tactics online' }, 'corpus-data-isis-action-contrast'),
    );
    expect(result.ok).toBe(false);
  });

  it('BLOCKS even a data-class tool on CSAM — the one absolute category', async () => {
    const result = await moderationStage.execute(
      ctxFor(NEWS_TOOL, { q: 'police busted a child pornography ring today' }, 'corpus-data-csam'),
    );
    expect(result.ok).toBe(false);
  });
});
