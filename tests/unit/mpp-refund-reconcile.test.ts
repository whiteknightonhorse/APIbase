/**
 * T-0652: the settlement-side MPP refund reconcile job against a real Postgres (TEST_DATABASE_URL,
 * disposable). The chain is a fake log reader; nothing is ever signed or sent.
 */
import { randomUUID } from 'crypto';
import { client, dbDescribe, migrate } from './helpers/shop-db';

const mockPrisma = { current: undefined as unknown };
jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: () => mockPrisma.current,
}));
jest.mock('../../src/config/index', () => ({
  config: { ENCRYPTION_KEY: 'k'.repeat(40), X402_NETWORK: 'base' },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/config/mpp.config', () => ({
  getMppConfig: () => ({
    walletAddress: '0x9E29FF84B0f3EDa9756262d2F950C435495BA8cC',
    usdcAddress: '0x20C000000000000000000000b9537d11c60E8b50',
  }),
}));
jest.mock('../../src/services/redis.service', () => ({ ensureRedisConnected: jest.fn() }));

import {
  run,
  type CursorStore,
  type LogReader,
  type TransferLog,
} from '../../src/jobs/mpp-refund-reconcile.job';
import { recordRefundOwed } from '../../src/services/refund-ledger.service';
import { register } from '../../src/services/metrics.service';

type Row = Record<string, any>;
const PAYER = '0x00000000000000000000000000000000000a11ce';
let seq = Date.now() * 1000;
const uniq = () => (++seq).toString(16);
const tx = () => `0x${uniq().padStart(64, '0')}`;
const HEAD = 50_000_000;
const LAG = 1200; // 10 min at the 0.5 s conservative block time

async function counter(name: string): Promise<number> {
  const m = (await register.getMetricsAsJSON()).find((x) => x.name === name);
  return (m?.values[0]?.value as number | undefined) ?? 0;
}

function cursorStore(initial: string | null = null): CursorStore & { value: string | null } {
  const s = {
    value: initial,
    get: async () => s.value,
    set: async (v: string) => void (s.value = v),
    status: async () => undefined,
  };
  return s;
}

/** A fake chain: serves `logs` that fall in the requested range, records every range asked. */
function fakeChain(logs: TransferLog[], over: Partial<LogReader> = {}) {
  const ranges: Array<[number, number]> = [];
  const chain: LogReader = {
    head: async () => HEAD,
    transfersTo: async (_w, _t, from, to) => {
      ranges.push([from, to]);
      return logs.filter((l) => l.block >= from && l.block <= to);
    },
    ...over,
  };
  return { chain, ranges };
}
const log = (hash: string, back = LAG + 100): TransferLog => ({
  tx_hash: hash,
  from: PAYER,
  amount_atomic: '2000',
  block: HEAD - back,
  timestamp: Math.floor(Date.now() / 1000) - 1800,
});

dbDescribe('mpp-refund-reconcile (T-0652)', () => {
  const prisma = client();
  mockPrisma.current = prisma;
  const q = (sql: string, ...v: unknown[]) => prisma.$queryRawUnsafe<Row[]>(sql, ...v);
  const x = (sql: string, ...v: unknown[]) => prisma.$executeRawUnsafe(sql, ...v);
  let agentId: string;
  const tag = `t0652${Date.now().toString(36)}`;

  beforeAll(async () => {
    migrate();
    await x(
      `INSERT INTO tools (tool_id, name, provider, category, namespace) VALUES ($1, 'probe', $2, 'test', $2)`,
      `${tag}.probe`,
      tag,
    );
    const a = await q(
      `INSERT INTO agents (api_key_hash) VALUES (md5(random()::text) || md5(random()::text)) RETURNING agent_id`,
    );
    agentId = a[0].agent_id;
  });
  afterAll(() => prisma.$disconnect());

  const parked = async (over: Record<string, unknown> = {}) => {
    const request_id = `req-${uniq()}`;
    const payload = {
      request_id,
      payer: PAYER,
      amount_usd: '0.002',
      reason: 'pipeline_stopped:PROVIDER_CALL:502:bad_gateway',
      original_tx: tx(),
      tool_id: 't.x',
      ...over,
    };
    await x(
      `INSERT INTO outbox (event_type, payload) VALUES ('mpp_refund_write_failed', $1::jsonb)`,
      JSON.stringify(payload),
    );
    return payload;
  };
  const outboxRow = (rid: string) =>
    q(`SELECT processed FROM outbox WHERE payload->>'request_id' = $1`, rid);
  const refunds = (rid: string) =>
    q(`SELECT reason, rail, source_kind FROM refund_ledger WHERE source_id = $1`, rid);
  const unmatched = (hash: string) =>
    q(
      `SELECT payload FROM outbox WHERE event_type = 'mpp_settle_unmatched' AND payload->>'tx_hash' = $1`,
      hash,
    );
  const noChain = () => fakeChain([]).chain;

  it('A1: a parked failed write with no refund row is booked as reconcile_missing; counter +1', async () => {
    const p = await parked();
    const before = await counter('mpp_refund_ledger_gap_total');
    const out = await run({ chain: noChain(), cursor: cursorStore(String(HEAD)) });
    expect(out.rebooked).toBeGreaterThanOrEqual(1);
    const rows = await refunds(p.request_id);
    expect(rows).toEqual([
      {
        reason: 'reconcile_missing:pipeline_stopped:PROVIDER_CALL:502:bad_gateway',
        rail: 'tempo',
        source_kind: 'request',
      },
    ]);
    expect((await outboxRow(p.request_id))[0].processed).toBe(true);
    expect((await counter('mpp_refund_ledger_gap_total')) - before).toBe(1);
  });

  it('A2: a parked write whose request already has a refund row books nothing; counter unchanged', async () => {
    const p = await parked();
    await recordRefundOwed({
      rail: 'tempo',
      payer: PAYER,
      amount_usd: '0.002',
      reason: 'pipeline_stopped:PROVIDER_CALL:502:bad_gateway',
      source_kind: 'request',
      source_id: p.request_id,
    });
    const before = await counter('mpp_refund_ledger_gap_total');
    await run({ chain: noChain(), cursor: cursorStore(String(HEAD)) });
    expect(await refunds(p.request_id)).toHaveLength(1);
    expect((await outboxRow(p.request_id))[0].processed).toBe(true);
    expect((await counter('mpp_refund_ledger_gap_total')) - before).toBe(0);
  });

  it('A3: an mpp_settle_unknown row is not booked by the job', async () => {
    const rid = `req-${uniq()}`;
    await x(
      `INSERT INTO outbox (event_type, payload) VALUES ('mpp_settle_unknown', $1::jsonb)`,
      JSON.stringify({ request_id: rid, payer: PAYER, amount_usd: 0.002, tx_hash: tx() }),
    );
    await run({ chain: noChain(), cursor: cursorStore(String(HEAD)) });
    expect(await refunds(rid)).toHaveLength(0);
    expect((await outboxRow(rid))[0].processed).toBe(false);
  });

  it('A4: when the re-book fails the row stays unprocessed and is not parked again', async () => {
    const p = await parked({ payer: '' });
    await run({ chain: noChain(), cursor: cursorStore(String(HEAD)) });
    await run({ chain: noChain(), cursor: cursorStore(String(HEAD)) });
    const rows = await outboxRow(p.request_id);
    expect(rows).toHaveLength(1);
    expect(rows[0].processed).toBe(false);
  });

  it('A5: the service parks a failed Tempo request-debt write in the outbox', async () => {
    const rid = `req-${uniq()}`;
    const r = await recordRefundOwed({
      rail: 'tempo',
      payer: '',
      amount_usd: '0.002',
      reason: 'pipeline_stopped:X:500:e',
      source_kind: 'request',
      source_id: rid,
      original_tx: tx(),
    });
    expect(r).toBeNull();
    const rows = await q(
      `SELECT payload FROM outbox WHERE event_type = 'mpp_refund_write_failed' AND payload->>'request_id' = $1`,
      rid,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.reason).toBe('pipeline_stopped:X:500:e');
  });

  it('B1: a transfer matched by execution_ledger.settle_tx_hash, refund_ledger.original_tx, a receipt or an outbox hash is not unmatched', async () => {
    const hExec = tx();
    const hRefund = tx();
    const hReceipt = tx();
    const hUnknown = tx();
    await x(
      `INSERT INTO execution_ledger (execution_id, agent_id, tool_id, status, billing_status, cost_usd, payer, settle_tx_hash)
       VALUES ($1::uuid, $2::uuid, $3, 'success', 'PAID', 0.002, $4, $5)`,
      randomUUID(),
      agentId,
      `${tag}.probe`,
      PAYER,
      hExec,
    );
    await recordRefundOwed({
      rail: 'tempo',
      payer: PAYER,
      amount_usd: '0.002',
      reason: 'pipeline_stopped:PROVIDER_CALL:502:bad_gateway',
      source_kind: 'request',
      source_id: `req-${uniq()}`,
      original_tx: hRefund.toUpperCase().replace('0X', '0x'),
    });
    await x(
      `INSERT INTO public_receipts (receipt_id, body) VALUES ($1, $2)`,
      randomUUID().replace(/-/g, ''),
      JSON.stringify({ payment_tx: hReceipt }),
    );
    await x(
      `INSERT INTO outbox (event_type, payload) VALUES ('mpp_settle_unknown', $1::jsonb)`,
      JSON.stringify({ request_id: `req-${uniq()}`, tx_hash: hUnknown }),
    );
    const { chain } = fakeChain([log(hExec), log(hRefund), log(hReceipt), log(hUnknown)]);
    const before = await counter('mpp_settle_unmatched_total');
    const out = await run({ chain, cursor: cursorStore(String(HEAD - LAG - 1000)) });
    expect(out.unmatched).toBe(0);
    for (const h of [hExec, hRefund, hReceipt, hUnknown])
      expect(await unmatched(h)).toHaveLength(0);
    expect((await counter('mpp_settle_unmatched_total')) - before).toBe(0);
  });

  it('B2: an unmatched transfer writes one outbox row; a second run over the same blocks keeps it at one', async () => {
    const h = tx();
    const { chain } = fakeChain([log(h)]);
    const before = await counter('mpp_settle_unmatched_total');
    const c1 = cursorStore(String(HEAD - LAG - 1000));
    const out = await run({ chain, cursor: c1 });
    expect(out.unmatched).toBe(1);
    const rows = await unmatched(h);
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({ tx_hash: h, from: PAYER, amount_usd: 0.002 });
    expect(c1.value).toBe(String(HEAD - LAG));
    const out2 = await run({ chain, cursor: cursorStore(String(HEAD - LAG - 1000)) });
    expect(out2.unmatched).toBe(0);
    expect(await unmatched(h)).toHaveLength(1);
    expect((await counter('mpp_settle_unmatched_total')) - before).toBe(1);
    // no refund row is ever written for an unmatched transfer
    expect(await q(`SELECT 1 FROM refund_ledger WHERE original_tx = $1`, h)).toHaveLength(0);
  });

  it('B3: a transfer younger than 10 minutes is outside this run window and is ignored', async () => {
    const h = tx();
    const { chain, ranges } = fakeChain([log(h, 500)]); // ~4 min old
    const c = cursorStore(String(HEAD - LAG - 1000));
    const out = await run({ chain, cursor: c });
    expect(out.unmatched).toBe(0);
    expect(await unmatched(h)).toHaveLength(0);
    expect(Math.max(...ranges.map((r) => r[1]))).toBe(HEAD - LAG);
    expect(c.value).toBe(String(HEAD - LAG)); // the cursor does not pass the young block
  });

  it('B4: first run (no cursor) starts one day back and walks in chunks', async () => {
    const { chain, ranges } = fakeChain([]);
    const c = cursorStore(null);
    await run({ chain, cursor: c });
    expect(ranges.length).toBeGreaterThan(1);
    expect(ranges[0][0]).toBe(HEAD - LAG - 172_800);
    for (const [a, b] of ranges) expect(b - a + 1).toBeLessThanOrEqual(50_000);
  });

  it('B5: an RPC failure skips the chain side, counts once, and the ledger side still ran', async () => {
    const p = await parked();
    const before = await counter('mpp_reconcile_rpc_errors_total');
    const { chain } = fakeChain([], {
      head: async () => {
        throw new Error('rpc down');
      },
    });
    const out = await run({ chain, cursor: cursorStore(String(HEAD)) });
    expect(out.chain).toBe('skipped_rpc');
    expect((await counter('mpp_reconcile_rpc_errors_total')) - before).toBe(1);
    expect(await refunds(p.request_id)).toHaveLength(1);
  });

  it('B6: Redis unavailable skips the chain side; the ledger side still ran', async () => {
    const p = await parked();
    const { chain, ranges } = fakeChain([]);
    const out = await run({ chain, cursor: null });
    expect(out.chain).toBe('skipped_redis');
    expect(ranges).toHaveLength(0);
    expect(await refunds(p.request_id)).toHaveLength(1);
  });

  it('S1: the job sends and signs nothing and reads no key', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../../src/jobs/mpp-refund-reconcile.job.ts'),
      'utf8',
    ) as string;
    expect(src).not.toMatch(/refund_payouts|sendTransaction|privateKey|PRIVATE_KEY|signMessage/);
  });
});
