/**
 * T-0525: payment-identifier 409 contract (retry_after, order_id, reason), self-heal of a stale
 * in_flight row, replayed flag, conflict counter. Fake ShopDeps.db, no Postgres.
 */
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { withPaymentIdentifier } from '../../src/shop/payment-identifier.service';
import { register } from '../../src/services/metrics.service';
import { createOrderRouter } from '../../src/shop/routes/order.router';
import type { PipelineContext } from '../../src/pipeline/types';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';

jest.mock('../../src/config', () => ({ config: { ENCRYPTION_KEY: 'k'.repeat(40) } }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@x402/core/http', () => ({
  decodePaymentSignatureHeader: (h: string) => JSON.parse(h),
  encodePaymentRequiredHeader: () => 'x',
}));
jest.mock('@x402/core/schemas', () => ({
  parsePaymentPayload: (d: unknown) => ({ success: true, data: d }),
}));
jest.mock('../../src/shop/buyer', () => ({
  resolveBuyer: jest.fn(async () => ({ identity: 'ip:test' })),
}));
const mockPayQuote = jest.fn();
jest.mock('../../src/shop/pay.service', () => ({
  payQuote: (...a: unknown[]) => mockPayQuote(...a),
}));

const { logger } = jest.requireMock('../../src/config/logger') as {
  logger: { warn: jest.Mock };
};

const QUOTE = '11111111-1111-4111-8111-111111111111';
const PAYER = '0xAbCd000000000000000000000000000000000001';
const ID = 'pay_0123456789abcdef0123';

interface IdRow {
  payer: string;
  request_fingerprint: string;
  status: string;
  response: unknown;
  ageS: number;
}

function fakeDeps(opts: {
  row?: IdRow;
  order?: { order_id: string; state: string; tx_hash: string | null };
}) {
  const state = { row: opts.row as IdRow | undefined, sql: [] as string[] };
  const db = {
    $queryRawUnsafe: jest.fn(async (sql: string, ...args: unknown[]) => {
      state.sql.push(sql);
      if (sql.includes('INSERT INTO shop_payment_identifiers')) {
        if (state.row) return [];
        state.row = {
          payer: String(args[1]),
          request_fingerprint: String(args[2]),
          status: 'in_flight',
          response: null,
          ageS: 0,
        };
        return [{ identifier: ID }];
      }
      if (sql.includes('FROM shop_payment_identifiers')) {
        const r = state.row;
        return r ? [{ ...r, stale: r.ageS > (args[1] as number) }] : [];
      }
      if (sql.includes('FROM shop_orders')) return opts.order ? [opts.order] : [];
      return [];
    }),
    $executeRawUnsafe: jest.fn(async (sql: string, ...args: unknown[]) => {
      state.sql.push(sql);
      if (sql.startsWith('DELETE') && sql.includes('expires_at')) return 0;
      if (sql.startsWith('DELETE')) state.row = undefined;
      if (sql.startsWith('UPDATE') && state.row) {
        state.row.status = 'done';
        state.row.response = JSON.parse(args[1] as string);
      }
      return 1;
    }),
  };
  return { deps: { db } as unknown as ShopDeps, state };
}

function ctxFor(o: { id?: string; payer?: string; value?: string } = {}): PipelineContext {
  const header = JSON.stringify({
    extensions: { 'payment-identifier': { info: { required: false, id: o.id ?? ID } } },
    payload: { authorization: { from: o.payer ?? PAYER, to: '0xBEEF', value: o.value ?? '1000' } },
  });
  return { x402PaymentHeader: header, body: { quote_id: QUOTE } } as unknown as PipelineContext;
}

// Fingerprint of the default request, produced by running once against an empty table.
async function fingerprint(): Promise<string> {
  const { deps, state } = fakeDeps({});
  await withPaymentIdentifier(deps, ctxFor(), async () => ({
    ok: true,
    value: { order_id: 'o', state: 'PAID' },
  }));
  return state.row ? state.row.request_fingerprint : '';
}

const PAID = { order_id: 'ord-1', state: 'PAID', tx_hash: '0xtx' };
const okRun = () =>
  jest.fn(async () => ({ ok: true as const, value: { order_id: 'ord-new', state: 'PAID' } }));
const counter = async (reason: string) => {
  const m = (await register.getMetricsAsJSON()).find(
    (x) => x.name === 'shop_payment_identifier_conflicts_total',
  );
  return (
    (m?.values as Array<{ labels: { reason?: string }; value: number }> | undefined)?.find(
      (v) => v.labels.reason === reason,
    )?.value ?? 0
  );
};

describe('payment-identifier 409 contract (T-0525)', () => {
  let fp: string;
  beforeAll(async () => {
    fp = await fingerprint();
  });
  beforeEach(() => logger.warn.mockClear());

  it('fresh row (10 s) -> 409 payment_in_flight with retry_after, poll; run() not called', async () => {
    const { deps } = fakeDeps({
      row: {
        payer: PAYER.toLowerCase(),
        request_fingerprint: fp,
        status: 'in_flight',
        response: null,
        ageS: 10,
      },
    });
    const run = okRun();
    const r = await withPaymentIdentifier(deps, ctxFor(), run);
    expect(run).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatchObject({ code: 409, error: 'payment_in_flight', retryAfter: 5 });
    expect(r.error.extra).toEqual({ retry_after: 5, poll: 'shop.order.get' });
  });

  it('stale row (200 s) + PAID order -> ok with order_id, replayed:true; row becomes done', async () => {
    const { deps, state } = fakeDeps({
      row: {
        payer: PAYER.toLowerCase(),
        request_fingerprint: fp,
        status: 'in_flight',
        response: null,
        ageS: 200,
      },
      order: PAID,
    });
    const run = okRun();
    const r = await withPaymentIdentifier(deps, ctxFor(), run);
    expect(run).not.toHaveBeenCalled();
    expect(r).toEqual({
      ok: true,
      value: { order_id: 'ord-1', state: 'PAID', tx_hash: '0xtx', replayed: true },
    });
    expect(state.row?.status).toBe('done');
    expect(state.row?.response).toEqual({
      ok: true,
      value: { order_id: 'ord-1', state: 'PAID', tx_hash: '0xtx' },
    });
  });

  it('stale row + PAYING order -> 409 with order_id and retry_after 30', async () => {
    const { deps } = fakeDeps({
      row: {
        payer: PAYER.toLowerCase(),
        request_fingerprint: fp,
        status: 'in_flight',
        response: null,
        ageS: 200,
      },
      order: { order_id: 'ord-2', state: 'PAYING', tx_hash: null },
    });
    const r = await withPaymentIdentifier(deps, ctxFor(), okRun());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.retryAfter).toBe(30);
    expect(r.error.extra).toEqual({ retry_after: 30, order_id: 'ord-2', poll: 'shop.order.get' });
  });

  it('stale row + PAYMENT_FAILED order -> row deleted, run() called once', async () => {
    const { deps } = fakeDeps({
      row: {
        payer: PAYER.toLowerCase(),
        request_fingerprint: fp,
        status: 'in_flight',
        response: null,
        ageS: 200,
      },
      order: { order_id: 'ord-3', state: 'PAYMENT_FAILED', tx_hash: null },
    });
    const run = okRun();
    const r = await withPaymentIdentifier(deps, ctxFor(), run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(r.ok && r.value.order_id).toBe('ord-new');
  });

  it('stale row + no order -> row deleted, run() called once', async () => {
    const { deps } = fakeDeps({
      row: {
        payer: PAYER.toLowerCase(),
        request_fingerprint: fp,
        status: 'in_flight',
        response: null,
        ageS: 200,
      },
    });
    const run = okRun();
    await withPaymentIdentifier(deps, ctxFor(), run);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('replay of a done row carries replayed:true (success and stored 402)', async () => {
    const okRow = {
      payer: PAYER.toLowerCase(),
      request_fingerprint: fp,
      status: 'done',
      response: { ok: true, value: PAID },
      ageS: 5,
    };
    const a = await withPaymentIdentifier(fakeDeps({ row: okRow }).deps, ctxFor(), okRun());
    expect(a).toEqual({ ok: true, value: { ...PAID, replayed: true } });
    const errRow = {
      ...okRow,
      response: { ok: false, error: { code: 402, error: 'payment_required', message: 'm' } },
    };
    const b = await withPaymentIdentifier(fakeDeps({ row: errRow }).deps, ctxFor(), okRun());
    expect(!b.ok && b.error.extra?.replayed).toBe(true);
  });

  it('conflict: reason payer / request, counter label, no raw id or wallet in the log', async () => {
    const row = {
      payer: PAYER.toLowerCase(),
      request_fingerprint: fp,
      status: 'in_flight',
      response: null,
      ageS: 1,
    };
    const p0 = await counter('payer');
    const q0 = await counter('request');
    const byPayer = await withPaymentIdentifier(
      fakeDeps({ row }).deps,
      ctxFor({ payer: '0x0000000000000000000000000000000000000009' }),
      okRun(),
    );
    const byReq = await withPaymentIdentifier(
      fakeDeps({ row }).deps,
      ctxFor({ value: '2000' }),
      okRun(),
    );
    expect(!byPayer.ok && byPayer.error).toMatchObject({
      error: 'payment_identifier_conflict',
      extra: { reason: 'payer' },
    });
    expect(!byReq.ok && byReq.error.extra).toEqual({ reason: 'request' });
    expect(await counter('payer')).toBe(p0 + 1);
    expect(await counter('request')).toBe(q0 + 1);
    const logged = JSON.stringify(logger.warn.mock.calls);
    expect(logged).toContain('payment_identifier_conflict');
    expect(logged).not.toContain(ID);
    expect(logged.toLowerCase()).not.toContain('0000000000000000000000000000000000000009');
    expect(logged.toLowerCase()).not.toContain(PAYER.toLowerCase());
  });
});

describe('REST pay route Retry-After (T-0525)', () => {
  let server: Server;
  let base: string;
  beforeEach(async () => {
    const app = express();
    app.use(express.json());
    app.use(createOrderRouter({} as never));
    await new Promise<void>((r) => {
      server = app.listen(0, '127.0.0.1', () => r());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(() => new Promise<void>((r) => server.close(() => r())));

  it('409 payment_in_flight sets Retry-After; a 402 does not', async () => {
    mockPayQuote.mockResolvedValueOnce({
      status: 409,
      body: { error: 'payment_in_flight', retry_after: 5 },
    });
    const a = await fetch(`${base}/api/v1/shop/quotes/${QUOTE}/pay`, { method: 'POST' });
    expect(a.status).toBe(409);
    expect(a.headers.get('retry-after')).toBe('5');
    mockPayQuote.mockResolvedValueOnce({
      status: 402,
      body: { error: 'payment_required', retry_after: 5 },
    });
    const b = await fetch(`${base}/api/v1/shop/quotes/${QUOTE}/pay`, { method: 'POST' });
    expect(b.status).toBe(402);
    expect(b.headers.get('retry-after')).toBeNull();
  });
});
