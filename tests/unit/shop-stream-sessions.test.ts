/**
 * T-INT-40 ST1-ST11 (UC-7 / F-9): stream sessions on `GET|POST /api/v1/shop/m/:slug/stream/:sku`,
 * the `shop-stream-settle` job body, the stream fee, migration 0027. Real Postgres
 * (TEST_DATABASE_URL, DISPOSABLE). Mocked: `mppx/server` (the session handler, with a fake chain:
 * payee check, deposit, vouchers, close), `mppx/tempo` (channel store + on-chain read), viem's
 * client factory. Zero real RPC / transaction.
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { encryptSecret } from '../../src/services/secret-crypto.service';
import { createStreamRouter } from '../../src/shop/routes/stream.router';
import {
  CONTENT_CHARS_PER_S,
  STREAM_LRU_MAX,
  clearStreamMethodCache,
  contentPortion,
  fromMicro,
  getStreamMethod,
  streamMethodCacheSize,
  toMicro,
} from '../../src/shop/stream-session';
import { createClient } from 'viem';
import { getMppConfig } from '../../src/config/mpp.config';
import { mppxChain, runStreamSettle, streamFeeMicro } from '../../src/shop/stream.service';
import { CatalogItemSchema, upsertCatalog } from '../../src/shop/catalog.service';
import { getProduct, searchCatalog } from '../../src/shop/catalog.read.service';
import { shopToolDefinitions } from '../../src/shop/tool-definitions';
import { client, dbDescribe, migrate, mkMerchant } from './helpers/shop-db';

// ---------------------------------------------------------------------------
// The fake world behind the mppx / viem mocks
// ---------------------------------------------------------------------------
interface MockChan {
  payee: string;
  payer: string;
  deposit: bigint;
  closeRequestedAt: bigint;
}
const mockWorld = {
  chain: new Map<string, MockChan>(),
  channels: new Map<string, any>(),
  settle: jest.fn(async (..._a: unknown[]) => '0xsettletx'),
  closeOnChain: jest.fn((..._a: unknown[]) => undefined),
  sessionCalls: [] as any[],
};

const microOf = (amount: string): bigint => BigInt(Math.round(Number(amount) * 1e6));

function mockSessionHandler(params: any, opts: { amount: string }) {
  const refuse = () => ({
    status: 402,
    challenge: new Response(JSON.stringify({ error: 'payment_required' }), {
      status: 402,
      headers: {
        'www-authenticate': `Payment method="tempo", intent="session", amount="${opts.amount}", recipient="${params.recipient}"`,
        'content-type': 'application/json',
      },
    }),
  });
  return async (req: Request) => {
    const auth = req.headers.get('authorization');
    if (!auth) return refuse();
    const wire = JSON.parse(Buffer.from(auth.replace(/^Payment\s+/, ''), 'base64url').toString());
    if (wire.challenge.amount !== opts.amount) return refuse(); // pinned challenge field
    const p = wire.payload;
    const id = String(p.channelId).toLowerCase();
    let st = mockWorld.channels.get(id);
    if (p.action === 'open') {
      const oc = mockWorld.chain.get(id);
      if (!oc || oc.deposit === 0n) return refuse();
      // mppx validateOnChainChannel: the on-chain payee must be the server's recipient
      if (oc.payee.toLowerCase() !== String(params.recipient).toLowerCase()) return refuse();
      if (!st) {
        st = {
          channelId: id,
          payer: oc.payer,
          payee: oc.payee,
          deposit: oc.deposit,
          spent: 0n,
          units: 0,
          highestVoucherAmount: BigInt(p.cumulativeAmount),
          highestVoucher: {
            channelId: id,
            cumulativeAmount: BigInt(p.cumulativeAmount),
            signature: '0xsig',
          },
          settledOnChain: 0n,
          finalized: false,
          closeRequestedAt: 0n,
          escrowContract: '0xescrowescrowescrowescrowescrowescrowes',
          chainId: 42431,
        };
        mockWorld.channels.set(id, st);
      }
    } else {
      if (!st || st.finalized) return refuse();
      if (p.action === 'topUp') st.deposit += BigInt(p.additionalDeposit);
      if (p.action === 'voucher' || p.action === 'close') {
        const cum = BigInt(p.cumulativeAmount);
        if (cum > st.deposit || cum < st.highestVoucherAmount) return refuse();
        st.highestVoucherAmount = cum;
        st.highestVoucher = { channelId: id, cumulativeAmount: cum, signature: '0xsig' };
      }
      if (p.action === 'close') {
        mockWorld.closeOnChain(params.account, id, st.highestVoucherAmount);
        st.finalized = true;
      }
    }
    const management = p.action === 'close' || p.action === 'topUp';
    if (!management && req.method === 'GET') {
      const amt = microOf(opts.amount);
      if (st.spent + amt > st.highestVoucherAmount) return refuse();
      st.spent += amt;
      st.units += 1;
    }
    const receipt = Buffer.from(
      JSON.stringify({
        method: 'tempo',
        intent: 'session',
        status: 'success',
        reference: id,
        channelId: id,
        acceptedCumulative: st.highestVoucherAmount.toString(),
        spent: st.spent.toString(),
        units: st.units,
        ...(p.action === 'close' ? { txHash: '0xclosetx' } : {}),
      }),
    ).toString('base64url');
    return {
      status: 200,
      withReceipt: () =>
        new Response(null, {
          status: management ? 204 : 200,
          headers: { 'payment-receipt': receipt },
        }),
    };
  };
}

jest.mock('mppx/server', () => ({
  Store: { redis: () => ({ update: async () => undefined }) },
  tempo: Object.assign(jest.fn(), {
    session: (params: unknown) => {
      mockWorld.sessionCalls.push(params);
      return { params };
    },
    settle: (...a: unknown[]) => mockWorld.settle(...a),
  }),
  Mppx: {
    create: ({ methods }: { methods: Array<{ params: unknown }> }) => ({
      session: (opts: { amount: string }) => mockSessionHandler(methods[0].params, opts),
    }),
  },
}));
jest.mock('mppx/tempo', () => ({
  Session: {
    ChannelStore: {
      fromStore: () => ({
        getChannel: async (id: string) => mockWorld.channels.get(id.toLowerCase()) ?? null,
        updateChannel: async (id: string, fn: (c: unknown) => unknown) => {
          const next = fn(mockWorld.channels.get(id.toLowerCase()) ?? null);
          if (next) mockWorld.channels.set(id.toLowerCase(), next);
          else mockWorld.channels.delete(id.toLowerCase());
          return next;
        },
      }),
    },
    Chain: {
      getOnChainChannel: async (_c: unknown, _e: unknown, id: string) => ({
        closeRequestedAt: mockWorld.chain.get(id.toLowerCase())?.closeRequestedAt ?? 0n,
      }),
    },
  },
}));
jest.mock('viem', () => ({
  ...jest.requireActual('viem'),
  createClient: jest.fn(() => ({ chain: { id: 42431 } })),
  http: jest.fn(() => ({})),
}));
jest.mock('../../src/services/redis.service', () => ({ getSharedRedis: () => ({}) }));
jest.mock('../../src/config/index', () => ({ config: { ENCRYPTION_KEY: 'k'.repeat(40) } }));
jest.mock('../../src/config/mpp.config', () => ({
  getMppConfig: () => ({
    enabled: true,
    secretKey: 's',
    walletAddress: '0x2',
    privateKey: '0x00',
    realm: 'apibase.pro',
    chainId: 42431,
    usdcAddress: '0x20c0000000000000000000000000000000000000',
    rpcUrl: 'http://rpc.invalid',
    testnet: true,
  }),
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const KEY = 'k'.repeat(40);
const PILOT_KEY = generatePrivateKey();
const pilot = privateKeyToAccount(PILOT_KEY);
const OTHER_KEY = generatePrivateKey();
const PAYER = privateKeyToAccount(generatePrivateKey()).address;
const RATE = '0.0001';
const SECONDS = 60;
const UNIT = '0.006'; // 60 s x 0.0001
const UNIT_MICRO = 6000n;

/** 12 000 characters; every second's block has its own letter, so a portion identifies its seconds. */
const PAYLOAD = Array.from({ length: 12_000 }, (_, i) =>
  String.fromCharCode(97 + (Math.floor(i / CONTENT_CHARS_PER_S) % 26)),
).join('');

// ---------------------------------------------------------------------------
// no database
// ---------------------------------------------------------------------------
describe('stream helpers and catalog item rules (no DB)', () => {
  it('micro-dollar conversion is exact and refuses sub-micro amounts', () => {
    expect(toMicro('0.0001')).toBe(100n);
    expect(toMicro('1')).toBe(1_000_000n);
    expect(fromMicro(6000n)).toBe('0.006');
    expect(fromMicro(1_000_000n)).toBe('1');
    expect(() => toMicro('0.0000001')).toThrow();
  });

  it('a portion is the slice the paid seconds unlock; past the end it is empty', () => {
    expect(contentPortion('abcdefghij'.repeat(20), 0, 1)).toHaveLength(CONTENT_CHARS_PER_S);
    expect(contentPortion('x', 5, 6)).toBe('');
  });

  it('the stream fee is 1.5% of the settled increment, rounded up; off -> 0', () => {
    const on = { fee_enabled: true, fee_bps: 150 } as never;
    expect(streamFeeMicro(510_000n, on)).toBe(7650n); // 0.00765
    expect(streamFeeMicro(510_000n, { fee_enabled: false, fee_bps: 150 } as never)).toBe(0n);
  });

  const item = (over: Record<string, unknown> = {}) => ({
    sku: 'demo-stream',
    title: 'Stream',
    category: 'digital-goods',
    fulfillment_mode: 'stream',
    stream: { rate_per_s_usd: '0.0001', min_deposit_usd: '1', unit: 'second', content_ref: 'c' },
    fulfillment: { instant: { payload: 'text' } },
    ...over,
  });

  it('CAT: a stream item: price_usd defaults to the rate; below-minimum rate/deposit, test SKU, wrong unit are refused', () => {
    const ok = CatalogItemSchema.safeParse(item());
    expect(ok.success && ok.data.price_usd).toBe('0.0001');
    const bad = (o: Record<string, unknown>) => CatalogItemSchema.safeParse(item(o)).success;
    expect(
      bad({ stream: { ...item().stream, rate_per_s_usd: '0.00009' }, price_usd: undefined }),
    ).toBe(false);
    expect(bad({ stream: { ...item().stream, min_deposit_usd: '0.5' } })).toBe(false);
    expect(bad({ stream: { ...item().stream, unit: 'minute' } })).toBe(false);
    expect(bad({ sku: '__apibase_test', is_test: true })).toBe(false); // the test SKU is never a stream
    expect(bad({ price_usd: '0.0002' })).toBe(false); // price must equal the rate
    expect(bad({ fulfillment: undefined })).toBe(false); // the content is required
    expect(bad({ fulfillment_mode: 'instant', price_usd: '1.5' })).toBe(false); // stream on a non-stream item
    expect(
      CatalogItemSchema.safeParse({
        sku: 'a',
        title: 't',
        category: 'books',
        price_usd: '1.005',
      }).success,
    ).toBe(false); // ordinary prices keep their 2-digit rule
  });
});

// ---------------------------------------------------------------------------
// real Postgres
// ---------------------------------------------------------------------------
dbDescribe('stream sessions (INT-40)', () => {
  const prisma = client();
  const deps = {
    db: prisma as never,
    transaction: (fn: (tx: never) => Promise<unknown>) =>
      prisma.$transaction((tx) => fn(tx as never)) as never,
  };
  let server: Server;
  let base = '';
  let n = 0;
  const tag = () => `${Date.now().toString(36)}s${n++}`;
  const rows = <T = Record<string, any>>(sql: string, ...v: unknown[]) =>
    prisma.$queryRawUnsafe<T[]>(sql, ...v);

  beforeAll(async () => {
    migrate();
    const app = express();
    app.use(express.json());
    app.use(createStreamRouter({ deps: deps as never, limit: 100000 }));
    server = await new Promise<Server>((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise((r) => server.close(r));
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    // the job scans every open channel: leave only this test's own
    await prisma.$executeRawUnsafe(
      `UPDATE shop_stream_sessions SET status = 'closed' WHERE status = 'open'`,
    );
    process.env.INTEGRATOR_STREAM_PILOT_TEMPO_KEY = PILOT_KEY;
    process.env.INTEGRATOR_FEE_ENABLED = 'true';
    process.env.INTEGRATOR_FEE_BPS = '150';
    process.env.INTEGRATOR_FEE_MIN_USD = '0.05';
    mockWorld.settle.mockClear();
    mockWorld.closeOnChain.mockClear();
    clearStreamMethodCache();
  });

  async function mkShop(
    opts: { settler?: string | null; wallet?: string; status?: string } = {},
  ): Promise<{ id: string; slug: string }> {
    const t = tag();
    const id = await mkMerchant(prisma, t);
    await prisma.$executeRawUnsafe(
      `UPDATE shop_merchants SET status = $2, stream_settler = $3, payout_wallet_tempo = $4
        WHERE merchant_id = $1::uuid`,
      id,
      opts.status ?? 'active',
      opts.settler === undefined ? 'apibase_pilot' : opts.settler,
      opts.wallet ?? pilot.address,
    );
    return { id, slug: `m-${t}` };
  }
  async function mkStream(merchant_id: string, sku = 'demo-stream', min = '1') {
    await prisma.$executeRawUnsafe(
      `INSERT INTO shop_products (merchant_id, sku, title, price_usd, fulfillment_mode, stream,
                                  fulfillment_payload_encrypted, category)
       VALUES ($1::uuid, $2, 'Stream', $3::numeric, 'stream', $4::jsonb, $5, 'digital-goods')`,
      merchant_id,
      sku,
      RATE,
      JSON.stringify({
        rate_per_s_usd: RATE,
        min_deposit_usd: min,
        unit: 'second',
        content_ref: 'c',
      }),
      encryptSecret(PAYLOAD, KEY),
    );
    return sku;
  }
  const url = (slug: string, sku: string, q = `?seconds=${SECONDS}`) =>
    `${base}/api/v1/shop/m/${slug}/stream/${sku}${q}`;
  const cred = (
    action: string,
    channelId: string,
    extra: Record<string, unknown> = {},
    amount = UNIT,
  ) =>
    `Payment ${Buffer.from(
      JSON.stringify({ challenge: { id: 'c1', amount }, payload: { action, channelId, ...extra } }),
    ).toString('base64url')}`;
  const get = (path: string, headers: Record<string, string> = {}) => fetch(path, { headers });
  const newChannel = (payee: string, deposit: bigint): string => {
    const id = `0x${randomBytes(32).toString('hex')}`;
    mockWorld.chain.set(id, { payee, payer: PAYER, deposit, closeRequestedAt: 0n });
    return id;
  };
  const open = (slug: string, sku: string, id: string) =>
    get(url(slug, sku), {
      authorization: cred('open', id, { cumulativeAmount: UNIT_MICRO.toString() }),
    });
  const voucher = (slug: string, sku: string, id: string, cumulative: bigint) =>
    get(url(slug, sku), {
      authorization: cred('voucher', id, { cumulativeAmount: cumulative.toString() }),
    });
  const session = async (id: string) =>
    (
      await rows(
        `SELECT status, deposit_usd::text, consumed_usd::text, consumed_s, settled_usd::text,
                settler_mode, escrow_contract, chain_id, buyer_agent_id, min_fee_applied,
                session_id::text
           FROM shop_stream_sessions WHERE channel_id = $1`,
        id,
      )
    )[0];
  const feeRows = (session_id: string) =>
    rows(
      `SELECT fee_usd::text, mode, status, source FROM shop_fee_ledger WHERE source_ref = $1 ORDER BY created_at`,
      session_id,
    );
  async function mkSession(
    merchant_id: string,
    sku: string,
    o: { highest: bigint; settled?: bigint; lastSettleMinAgo?: number; channel?: string },
  ) {
    const channel = o.channel ?? `0x${randomBytes(32).toString('hex')}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO shop_stream_sessions
         (merchant_id, sku, buyer_agent_id, channel_id, deposit_usd, rate_per_s, settled_usd,
          settler_mode, escrow_contract, chain_id, highest_voucher, last_settle_at, opened_at)
       VALUES ($1::uuid, $2, $3, $4, 1, $5::numeric, $6::numeric, 'apibase_pilot', '0xescrow', 42431,
               $7::jsonb, CASE WHEN $8::int IS NULL THEN NULL ELSE now() - ($8::int * interval '1 minute') END,
               now() - interval '3 hours')`,
      merchant_id,
      sku,
      PAYER,
      channel,
      RATE,
      fromMicro(o.settled ?? 0n),
      JSON.stringify({
        channelId: channel,
        cumulativeAmount: o.highest.toString(),
        signature: '0xsig',
      }),
      o.lastSettleMinAgo ?? null,
    );
    return channel;
  }
  const settleCalls = (channel: string) =>
    mockWorld.settle.mock.calls.filter((c) => c[2] === channel);

  it('ST1: stream_settler null / merchant / no key -> 409 stream_unavailable, no challenge', async () => {
    for (const settler of [null, 'merchant'] as const) {
      const s = await mkShop({ settler });
      await mkStream(s.id);
      const calls = mockWorld.sessionCalls.length;
      const r = await get(url(s.slug, 'demo-stream'));
      expect(r.status).toBe(409);
      expect((await r.json()).error_code).toBe('stream_unavailable');
      expect(r.headers.get('www-authenticate')).toBeNull();
      expect(mockWorld.sessionCalls.length).toBe(calls);
    }
    const s = await mkShop();
    await mkStream(s.id);
    delete process.env.INTEGRATOR_STREAM_PILOT_TEMPO_KEY;
    const r = await get(url(s.slug, 'demo-stream'));
    expect(r.status).toBe(409);
  });

  it('ST1: the pilot key is not the payout wallet -> 500 stream_settler_misconfigured, no challenge, signal row', async () => {
    const s = await mkShop({ wallet: privateKeyToAccount(OTHER_KEY).address });
    await mkStream(s.id);
    const calls = mockWorld.sessionCalls.length;
    const r = await get(url(s.slug, 'demo-stream'));
    expect(r.status).toBe(500);
    expect((await r.json()).error_code).toBe('stream_settler_misconfigured');
    expect(r.headers.get('www-authenticate')).toBeNull();
    expect(mockWorld.sessionCalls.length).toBe(calls); // tempo.session never built: nothing could be signed
    const ev = await rows(
      `SELECT count(*)::int AS c FROM shop_connect_events
        WHERE error_code = 'stream_settler_misconfigured' AND path LIKE $1`,
      `/api/v1/shop/m/${s.slug}/stream/%`,
    );
    expect(ev[0].c).toBe(1);
    await get(url(s.slug, 'demo-stream')); // the signal is once per merchant and hour
    expect(
      (
        await rows(
          `SELECT count(*)::int AS c FROM shop_connect_events WHERE error_code = 'stream_settler_misconfigured' AND path LIKE $1`,
          `/api/v1/shop/m/${s.slug}/stream/%`,
        )
      )[0].c,
    ).toBe(1);
  });

  it('a valid shop answers 402 with a session challenge for the requested seconds; the method is built with account and payee = payout wallet', async () => {
    const s = await mkShop();
    await mkStream(s.id);
    const r = await get(url(s.slug, 'demo-stream', '?seconds=60'));
    expect(r.status).toBe(402);
    expect(r.headers.get('www-authenticate')).toContain(`amount="${UNIT}"`);
    const p = mockWorld.sessionCalls[mockWorld.sessionCalls.length - 1];
    expect(p.account.address).toBe(pilot.address);
    expect(p.recipient).toBe(pilot.address);
    expect(p.unitType).toBe('second');
    expect(p.amount).toBe(RATE);
    expect(p.suggestedDeposit).toBe('1');
    expect(p.splits).toBeUndefined(); // no splits in a session
    expect((await get(url(s.slug, 'demo-stream', '?seconds=61'))).status).toBe(400);
    expect((await get(url(s.slug, 'demo-stream', '?seconds=0'))).status).toBe(400);
  });

  it('ST2: deposit 0.5 -> 402 deposit_below_minimum, no row, channel not used; deposit 1 -> open', async () => {
    const s = await mkShop();
    await mkStream(s.id);
    const small = newChannel(pilot.address, 500_000n);
    const r = await open(s.slug, 'demo-stream', small);
    expect(r.status).toBe(402);
    expect((await r.json()).error_code).toBe('deposit_below_minimum');
    expect(await session(small)).toBeUndefined();
    expect(mockWorld.channels.has(small)).toBe(false);

    const good = newChannel(pilot.address, 1_000_000n);
    const ok = await open(s.slug, 'demo-stream', good);
    expect(ok.status).toBe(200);
    expect(await session(good)).toMatchObject({
      status: 'open',
      deposit_usd: '1.000000',
      settler_mode: 'apibase_pilot',
      chain_id: 42431,
      buyer_agent_id: PAYER,
    });
    expect((await session(good)).escrow_contract).toMatch(/^0x/);
  });

  it('ST3: 10 vouchers of 60 s at 0.0001 -> consumed_usd 0.06, content in 10 portions, no settle (threshold)', async () => {
    const s = await mkShop();
    await mkStream(s.id);
    const id = newChannel(pilot.address, 1_000_000n);
    const portions: string[] = [];
    let r = await open(s.slug, 'demo-stream', id); // the open request is the first paid minute
    expect(r.status).toBe(200);
    portions.push((await r.json()).content);
    for (let i = 2; i <= 10; i++) {
      r = await voucher(s.slug, 'demo-stream', id, UNIT_MICRO * BigInt(i));
      expect(r.status).toBe(200);
      const j = await r.json();
      portions.push(j.content);
      if (i === 10) expect(j.consumed_usd).toBe('0.06');
    }
    expect(portions).toHaveLength(10);
    portions.forEach((p) => expect(p).toHaveLength(SECONDS * CONTENT_CHARS_PER_S));
    expect(portions.join('')).toBe(PAYLOAD.slice(0, 600 * CONTENT_CHARS_PER_S));
    expect(await session(id)).toMatchObject({ consumed_usd: '0.060000', consumed_s: 600 });
    const report = await runStreamSettle(deps as never, Date.now());
    expect(report.failed).toBe(0);
    expect(settleCalls(id)).toHaveLength(0); // 0.06 < 0.50 and no hour passed
  });

  it('ST4: highest - settled = 0.51 -> one settle, one settlement row, fee receivable 0.00765; fee off -> no fee row', async () => {
    const s = await mkShop();
    await mkStream(s.id);
    const ch = await mkSession(s.id, 'demo-stream', { highest: 510_000n, lastSettleMinAgo: 1 });
    const rep = await runStreamSettle(deps as never, Date.now());
    expect(rep.settled).toBeGreaterThanOrEqual(1);
    expect(settleCalls(ch)).toHaveLength(1);
    const ses = await session(ch);
    expect(ses.settled_usd).toBe('0.510000');
    expect(
      (
        await rows(
          `SELECT count(*)::int AS c FROM shop_stream_settlements WHERE channel_id = $1`,
          ch,
        )
      )[0].c,
    ).toBe(1);
    expect(
      (await rows(`SELECT submitted_by FROM shop_stream_settlements WHERE channel_id = $1`, ch))[0]
        .submitted_by,
    ).toBe('apibase');
    expect(await feeRows(ses.session_id)).toEqual([
      { fee_usd: '0.007650', mode: 'receivable', status: 'owed', source: 'stream' },
    ]);
    await runStreamSettle(deps as never, Date.now()); // nothing new: no second settle
    expect(settleCalls(ch)).toHaveLength(1);

    process.env.INTEGRATOR_FEE_ENABLED = 'false';
    const ch2 = await mkSession(s.id, 'demo-stream', { highest: 510_000n, lastSettleMinAgo: 1 });
    await runStreamSettle(deps as never, Date.now());
    expect(settleCalls(ch2)).toHaveLength(1);
    expect(await feeRows((await session(ch2)).session_id)).toEqual([]);
  });

  it('ST4b: 0.49 unsettled and settled 5 minutes ago -> no settle (below the threshold)', async () => {
    const s = await mkShop();
    await mkStream(s.id);
    const ch = await mkSession(s.id, 'demo-stream', { highest: 490_000n, lastSettleMinAgo: 5 });
    await runStreamSettle(deps as never, Date.now());
    expect(settleCalls(ch)).toHaveLength(0);
  });

  it('ST5: last settle 61 min ago with highest > settled -> settle; 30 min ago -> none; highest == settled -> none', async () => {
    const s = await mkShop();
    await mkStream(s.id);
    const late = await mkSession(s.id, 'demo-stream', { highest: 1000n, lastSettleMinAgo: 61 });
    const recent = await mkSession(s.id, 'demo-stream', { highest: 1000n, lastSettleMinAgo: 30 });
    const idle = await mkSession(s.id, 'demo-stream', {
      highest: 1000n,
      settled: 1000n,
      lastSettleMinAgo: 90,
    });
    await runStreamSettle(deps as never, Date.now());
    expect(settleCalls(late)).toHaveLength(1);
    expect(settleCalls(recent)).toHaveLength(0);
    expect(settleCalls(idle)).toHaveLength(0);
  });

  it('a failing settle stamps settle_error_since once (the engine opens STREAM_SETTLE_OVERDUE an hour later)', async () => {
    const s = await mkShop();
    await mkStream(s.id);
    const ch = await mkSession(s.id, 'demo-stream', { highest: 600_000n, lastSettleMinAgo: 1 });
    mockWorld.settle.mockRejectedValueOnce(new Error('rpc down'));
    const rep = await runStreamSettle(deps as never, Date.now());
    expect(rep.failed).toBeGreaterThanOrEqual(1);
    const a = (
      await rows(`SELECT settle_error_since FROM shop_stream_sessions WHERE channel_id = $1`, ch)
    )[0];
    expect(a.settle_error_since).not.toBeNull();
    expect((await session(ch)).settled_usd).toBe('0.000000');
    await runStreamSettle(deps as never, Date.now()); // retried next minute, succeeds, error cleared
    expect(
      (
        await rows(`SELECT settle_error_since FROM shop_stream_sessions WHERE channel_id = $1`, ch)
      )[0].settle_error_since,
    ).toBeNull();
  });

  it('a payer close request on-chain -> immediate settle + stream.close_requested event', async () => {
    const s = await mkShop();
    await mkStream(s.id);
    const ch = await mkSession(s.id, 'demo-stream', { highest: 1000n, lastSettleMinAgo: 1 });
    mockWorld.chain.set(ch, {
      payee: pilot.address,
      payer: PAYER,
      deposit: 1_000_000n,
      closeRequestedAt: 5n,
    });
    const rep = await runStreamSettle(deps as never, Date.now());
    expect(rep.close_requested).toBeGreaterThanOrEqual(1);
    expect(settleCalls(ch)).toHaveLength(1);
    expect(
      (
        await rows(
          `SELECT count(*)::int AS c FROM outbox WHERE event_type = 'stream.close_requested' AND payload->>'channel_id' = $1`,
          ch,
        )
      )[0].c,
    ).toBe(1);
    expect(
      (
        await rows(`SELECT close_requested_at FROM shop_stream_sessions WHERE channel_id = $1`, ch)
      )[0].close_requested_at,
    ).not.toBeNull();
  });

  it('ST6: close -> closeOnChain once by the demo account, status closed, minimum fee 0.05 topped up once', async () => {
    const s = await mkShop();
    await mkStream(s.id);
    const id = newChannel(pilot.address, 1_000_000n);
    expect((await open(s.slug, 'demo-stream', id)).status).toBe(200);
    const close = await get(url(s.slug, 'demo-stream'), {
      authorization: cred('close', id, { cumulativeAmount: UNIT_MICRO.toString() }),
    });
    expect(close.status).toBe(204);
    expect(mockWorld.closeOnChain).toHaveBeenCalledTimes(1);
    expect((mockWorld.closeOnChain.mock.calls[0][0] as { address: string }).address).toBe(
      pilot.address,
    );
    const ses = await session(id);
    expect(ses).toMatchObject({ status: 'closed', settled_usd: '0.006000', min_fee_applied: true });
    const sett = await rows(
      `SELECT submitted_by, tx_hash, cumulative_amount::text AS c FROM shop_stream_settlements WHERE channel_id = $1`,
      id,
    );
    expect(sett).toEqual([{ submitted_by: 'apibase', tx_hash: '0xclosetx', c: '0.006000' }]);
    const fees = await feeRows(ses.session_id);
    expect(fees.map((f) => f.fee_usd)).toEqual(['0.000090', '0.049910']);
    expect(
      fees.every((f) => f.mode === 'receivable' && f.status === 'owed' && f.source === 'stream'),
    ).toBe(true);
    // a second close is refused and adds nothing
    const again = await get(url(s.slug, 'demo-stream'), {
      authorization: cred('close', id, { cumulativeAmount: UNIT_MICRO.toString() }),
    });
    expect(again.status).toBe(409);
    expect(mockWorld.closeOnChain).toHaveBeenCalledTimes(1);
    expect((await feeRows(ses.session_id)).length).toBe(2);
  });

  it('close with the fee switched off -> no fee rows', async () => {
    process.env.INTEGRATOR_FEE_ENABLED = 'false';
    const s = await mkShop();
    await mkStream(s.id);
    const id = newChannel(pilot.address, 1_000_000n);
    await open(s.slug, 'demo-stream', id);
    await get(url(s.slug, 'demo-stream'), {
      authorization: cred('close', id, { cumulativeAmount: UNIT_MICRO.toString() }),
    });
    expect(await feeRows((await session(id)).session_id)).toEqual([]);
  });

  it('topUp raises deposit_usd', async () => {
    const s = await mkShop();
    await mkStream(s.id);
    const id = newChannel(pilot.address, 1_000_000n);
    await open(s.slug, 'demo-stream', id);
    const r = await get(url(s.slug, 'demo-stream'), {
      authorization: cred('topUp', id, { additionalDeposit: '500000', transaction: '0xtx' }),
    });
    expect(r.status).toBe(204);
    expect((await session(id)).deposit_usd).toBe('1.500000');
  });

  it('ST7: cross-tenant: /m/A/stream/<sku of B> -> 404, even with a credential for a channel of B', async () => {
    const a = await mkShop();
    const b = await mkShop();
    await mkStream(a.id, 'a-stream');
    await mkStream(b.id, 'b-stream');
    expect((await get(url(a.slug, 'b-stream'))).status).toBe(404);
    const chB = newChannel(pilot.address, 1_000_000n);
    expect((await open(b.slug, 'b-stream', chB)).status).toBe(200);
    expect((await open(a.slug, 'b-stream', chB)).status).toBe(404);
    // B's channel, presented at A's own stream: not A's channel
    const v = await voucher(a.slug, 'a-stream', chB, UNIT_MICRO * 2n);
    expect(v.status).toBe(404);
    expect((await v.json()).error_code).toBe('unknown_channel');
    // unknown shop / non-stream sku / pending shop
    expect((await get(url('nope-shop', 'a-stream'))).status).toBe(404);
    await prisma.$executeRawUnsafe(
      `INSERT INTO shop_products (merchant_id, sku, title, price_usd, category) VALUES ($1::uuid, 'plain', 'P', 5, 'x')`,
      a.id,
    );
    expect((await get(url(a.slug, 'plain'))).status).toBe(404);
  });

  it('ST8: X-Payment on the route -> 400 with pay.mpp.url (and MPP-only wording)', async () => {
    const s = await mkShop();
    await mkStream(s.id);
    const r = await get(url(s.slug, 'demo-stream'), { 'x-payment': 'eyJ4Ijoic29tZSJ9' });
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.pay.mpp.url).toBe(`https://apibase.pro/api/v1/shop/m/${s.slug}/stream/demo-stream`);
    expect(j.error_code).toBe('x402_not_supported');
    expect(r.headers.get('www-authenticate')).toBeNull();
  });

  it('ST9: on-chain payee != recipient -> mppx refuses (402), no row, nothing recorded', async () => {
    const s = await mkShop();
    await mkStream(s.id);
    const stranger = privateKeyToAccount(generatePrivateKey()).address;
    const id = newChannel(stranger, 1_000_000n);
    const r = await open(s.slug, 'demo-stream', id);
    expect(r.status).toBe(402);
    expect(await session(id)).toBeUndefined();
    expect(mockWorld.channels.has(id)).toBe(false);
  });

  it('LRU: the per-merchant method cache holds at most 1 000 entries', async () => {
    clearStreamMethodCache();
    for (let i = 0; i < STREAM_LRU_MAX + 5; i++) {
      await getStreamMethod(
        {
          merchant_id: `m-${i}`,
          slug: `slug-${i}`,
          payout_wallet_tempo: pilot.address,
          stream_settler: 'apibase_pilot',
        },
        { rate_per_s_usd: RATE, min_deposit_usd: '1' },
      );
    }
    expect(streamMethodCacheSize()).toBe(STREAM_LRU_MAX);
  });

  it('ST12: the payee client carries the USDC fee token: session getClient and mppxChain.settle', async () => {
    clearStreamMethodCache();
    const cfg = getMppConfig();
    const createClientMock = createClient as unknown as jest.Mock;
    const merchant = {
      merchant_id: 'm-st12',
      slug: 'slug-st12',
      payout_wallet_tempo: pilot.address,
      stream_settler: 'apibase_pilot',
    };
    const method = await getStreamMethod(merchant, { rate_per_s_usd: RATE, min_deposit_usd: '1' });
    const params = mockWorld.sessionCalls[mockWorld.sessionCalls.length - 1];
    expect(typeof params.getClient).toBe('function');
    createClientMock.mockClear();
    await params.getClient();
    expect(createClientMock).toHaveBeenCalledTimes(1);
    const a = createClientMock.mock.calls[0][0];
    expect(a.chain.feeToken).toBe(cfg.usdcAddress);
    expect(a.chain.id).toBe(cfg.chainId);
    expect(a.transport).toBeDefined();

    createClientMock.mockClear();
    mockWorld.settle.mockClear();
    const row = { channel_id: `0x${'ab'.repeat(32)}`, escrow_contract: '0xescrow' };
    await mppxChain.settle(method, row as never);
    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(createClientMock.mock.calls[0][0].chain.feeToken).toBe(cfg.usdcAddress);
    expect(mockWorld.settle).toHaveBeenCalledTimes(1);
    const sc = mockWorld.settle.mock.calls[0];
    expect(sc[1]).toBeDefined();
    expect((sc[3] as { account: { address: string } }).account.address).toBe(pilot.address);
  });

  describe('catalog (INT-06 upsert) and the read surface', () => {
    async function activate(merchant_id: string) {
      for (const doc_id of ['merchant-agreement', 'aup', 'dpa', 'refund-framework']) {
        const have = await rows(`SELECT 1 FROM shop_legal_docs WHERE doc_id = $1`, doc_id);
        if (have.length === 0) {
          await prisma.$executeRawUnsafe(
            `INSERT INTO shop_legal_docs (doc_id, version, sha256, url, effective_from, body_md)
             VALUES ($1, 'int40', $2, $3, now() - interval '1 day', 'b')`,
            doc_id,
            doc_id.padEnd(64, '0'),
            `/legal/${doc_id}`,
          );
        }
      }
      await prisma.$executeRawUnsafe(
        `INSERT INTO shop_acceptances (merchant_id, doc_id, version, sha256, method, signer, signature, message)
         SELECT DISTINCT ON (doc_id) $1::uuid, doc_id, version, sha256, 'wallet_signature', 's', 'sig', 'm'
           FROM shop_legal_docs WHERE doc_id IN ('merchant-agreement','aup','dpa','refund-framework')
          ORDER BY doc_id, effective_from DESC`,
        merchant_id,
      );
      await prisma.$executeRawUnsafe(
        `UPDATE shop_merchants SET status = 'active',
           encryption_key = '{"kid":"k1","alg":"x25519","pub":"AAAA","sig_by_wallet":"0xsig"}'::jsonb
         WHERE merchant_id = $1::uuid`,
        merchant_id,
      );
    }

    it('upserts a stream item, catalog.get serves stream.url and the real rate, search and the storefront do not list it', async () => {
      const s = await mkShop();
      await activate(s.id);
      const item = {
        sku: 'demo-stream',
        title: 'Stream',
        description: 'by the second',
        fulfillment_mode: 'stream',
        stream: {
          rate_per_s_usd: '0.0001',
          min_deposit_usd: '1',
          unit: 'second',
          content_ref: 'c',
        },
        fulfillment: { instant: { payload: 'hello'.repeat(100) } },
        category: 'digital-goods',
      };
      const report = await upsertCatalog(deps as never, s.id, [item], { encryptionKey: KEY });
      expect(report.errors).toEqual([]);
      expect(report.upserted).toBe(1);
      const row = (
        await rows(
          `SELECT price_usd::text, fulfillment_mode, stream FROM shop_products WHERE merchant_id = $1::uuid`,
          s.id,
        )
      )[0];
      expect(row.price_usd).toBe('0.000100');
      expect(row.fulfillment_mode).toBe('stream');
      expect(row.stream).toEqual(item.stream);

      const card = await getProduct(prisma as never, { merchant: s.slug, sku: 'demo-stream' });
      expect(card.fulfillment_mode).toBe('stream');
      expect(card.price_usd).toBe('0.0001');
      expect(card.stream).toEqual({
        rate_per_s_usd: '0.0001',
        min_deposit_usd: '1',
        unit: 'second',
        url: `https://apibase.pro/api/v1/shop/m/${s.slug}/stream/demo-stream`,
      });
      const found = await searchCatalog(prisma as never, { merchant: s.slug });
      expect(found.products).toEqual([]);

      const bad = await upsertCatalog(
        deps as never,
        s.id,
        [{ ...item, sku: '__apibase_test', is_test: true, price_usd: 0.01 }],
        { encryptionKey: KEY },
      );
      expect(bad.errors).toHaveLength(1); // the test SKU can never be a stream
    });
  });

  it('ST10: incidents_kind_check accepts the two wave-3 kinds and still refuses junk', async () => {
    const ins = (kind: string) =>
      prisma.$executeRawUnsafe(
        `INSERT INTO incidents (dedup_key, provider, kind, severity, state, detected_by, evidence)
         VALUES ($1, 'merchant:x', $2, 'SEV3', 'OPEN', 'passive', '{}'::jsonb)`,
        `${kind}:${Math.random()}`,
        kind,
      );
    await expect(ins('STREAM_SETTLE_OVERDUE')).resolves.toBe(1);
    await expect(ins('SUBSCRIPTION_PULL_FAILED')).resolves.toBe(1);
    await expect(ins('NOT_A_KIND')).rejects.toThrow(/incidents_kind_check/);
    await expect(ins('STOREFRONT_DOWN')).resolves.toBe(1);
  });

  it('ST10: migration 0027 applies and rolls back on the test database (one transaction, then discarded)', async () => {
    const { Client } = jest.requireActual('pg') as typeof import('pg');
    const c = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await c.connect();
    const up = readFileSync(
      join(__dirname, '../../prisma/migrations/0027_wave3/migration.sql'),
      'utf8',
    );
    const down = readFileSync(join(__dirname, '../../scripts/shop/rollback-0027-wave3.sql'), 'utf8')
      .replace(/^BEGIN;$/m, '')
      .replace(/^COMMIT;$/m, '');
    const exists = async (t: string) =>
      (await c.query(`SELECT to_regclass('public.${t}') IS NOT NULL AS e`)).rows[0].e as boolean;
    const wave3 = [
      'shop_stream_sessions',
      'shop_stream_settlements',
      'shop_subscriptions',
      'shop_subscription_periods',
      'shop_subscription_authorizations',
      'shop_payment_identifiers',
    ];
    try {
      await c.query('BEGIN');
      await c.query(down);
      for (const t of wave3) expect(await exists(t)).toBe(false);
      await c.query('SAVEPOINT k');
      await expect(
        c.query(
          `INSERT INTO incidents (dedup_key, provider, kind, severity, state, detected_by, evidence)
           VALUES ('x', 'merchant:x', 'STREAM_SETTLE_OVERDUE', 'SEV3', 'OPEN', 'passive', '{}')`,
        ),
      ).rejects.toThrow(/incidents_kind_check/);
      await c.query('ROLLBACK TO SAVEPOINT k');
      await c.query(up);
      for (const t of wave3) expect(await exists(t)).toBe(true);
    } finally {
      await c.query('ROLLBACK');
      await c.end();
    }
    for (const t of wave3) {
      expect((await rows(`SELECT to_regclass('public.${t}') IS NOT NULL AS e`))[0].e).toBe(true);
    }
  });

  it('ST11: tools/list (/mcp shop tools and storefronts) is unchanged: no stream tool', async () => {
    const names = (await shopToolDefinitions()).map((t) => String(t.name));
    expect(names.filter((x) => /stream|subscri/i.test(x))).toEqual([]);
    expect([...names].sort()).toMatchInlineSnapshot(`
      [
        "shop.catalog.get",
        "shop.catalog.search",
        "shop.merchant.accept_terms",
        "shop.merchant.catalog_delete",
        "shop.merchant.catalog_upsert",
        "shop.merchant.check",
        "shop.merchant.deactivate",
        "shop.merchant.order_confirm",
        "shop.merchant.order_document",
        "shop.merchant.order_ship",
        "shop.merchant.orders_list",
        "shop.merchant.refund",
        "shop.merchant.register",
        "shop.merchant.rotate_key",
        "shop.merchant.stats",
        "shop.merchant.webhook_set",
        "shop.order.cancel",
        "shop.order.dispute",
        "shop.order.get",
        "shop.order.pay",
        "shop.order.quote",
      ]
    `);
  });
});
