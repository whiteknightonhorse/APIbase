/**
 * T-0790 (DB side): a charged request that stops before the pipeline books exactly one real
 * refund_ledger row carrying original_tx, and the chain-side judge of mpp-refund-reconcile
 * matches that tx (no unmatched outbox row). mppx is mocked; the ledger, middleware and judge are real.
 */
import { EventEmitter } from 'node:events';
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
    enabled: true,
    privateKey: '0x00',
    usdcAddress: '0x20C000000000000000000000b9537d11c60E8b50',
    walletAddress: '0x9E29FF84B0f3EDa9756262d2F950C435495BA8cC',
    secretKey: 's',
    realm: 'r',
    rpcUrl: 'http://rpc',
  }),
}));
jest.mock('../../src/pipeline/stages/tool-status.stage', () => ({
  getToolPriceUsd: (id: string) => (id === 'known.tool' ? 0.25 : undefined),
  checkToolAvailability: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../src/pipeline/precheck', () => ({
  precheckToolCall: jest.fn().mockResolvedValue(null),
}));
jest.mock('mppx/server', () => ({
  Store: { redis: () => ({ update: jest.fn() }) },
  Mppx: {
    create: jest.fn(() => ({
      charge: () => async () => ({ status: 200, withReceipt: (r: unknown) => r }),
    })),
  },
  tempo: { charge: jest.fn(() => ({})) },
}));
jest.mock('viem/accounts', () => ({ privateKeyToAccount: jest.fn(() => ({})) }));
jest.mock('../../src/services/redis.service', () => ({
  getSharedRedis: () => ({}),
  ensureRedisConnected: jest.fn(),
}));
const PAYER = '0x00000000000000000000000000000000000a11ce';
const HASH = '0x' + 'AB'.repeat(32);
jest.mock('mppx', () => ({
  Receipt: { fromResponse: () => ({ reference: '0x' + 'AB'.repeat(32) }) },
}));
jest.mock('viem', () => ({
  createPublicClient: () => ({
    getTransaction: async () => ({ from: '0x00000000000000000000000000000000000a11ce', to: null }),
  }),
  http: () => ({}),
}));

import type { Request, Response } from 'express';
import { mppMiddleware } from '../../src/middleware/mpp.middleware';
import {
  run as reconcile,
  type CursorStore,
  type LogReader,
} from '../../src/jobs/mpp-refund-reconcile.job';

const HEAD = 50_000_000;
const LAG = 1200;

dbDescribe('mpp charge guard with a real ledger (T-0790)', () => {
  const prisma = client();
  mockPrisma.current = prisma;
  const q = (sql: string, ...v: unknown[]) =>
    prisma.$queryRawUnsafe<Array<Record<string, any>>>(sql, ...v);

  beforeAll(() => migrate());
  afterAll(() => prisma.$disconnect());

  it('charge then a forced pre-pipeline 500: one refund_ledger row with original_tx; the judge finds no unmatched tx', async () => {
    const requestId = `req-${Date.now()}`;
    const req = {
      headers: { authorization: 'Payment x', accept: 'application/json' },
      originalUrl: '/api/v1/tools/known.tool/call',
      method: 'POST',
      body: {},
      get: () => 'test.local',
      requestId,
    } as unknown as Request;
    const res = new EventEmitter() as EventEmitter & Record<string, unknown>;
    res.statusCode = 200;
    res.setHeader = jest.fn();
    res.status = (s: number) => ((res.statusCode = s), res);
    res.json = jest.fn(() => res);
    const out = await new Promise((resolve) =>
      mppMiddleware(req, res as unknown as Response, (e?: unknown) => resolve(e ?? 'next')),
    );
    expect(out).toBe('next');

    res.statusCode = 500;
    res.emit('finish');
    const deadline = Date.now() + 5000;
    let rows: Array<Record<string, any>> = [];
    while (Date.now() < deadline && rows.length === 0) {
      await new Promise((r) => setTimeout(r, 50));
      rows = await q(
        `SELECT rail, payer, reason, source_kind, original_tx FROM refund_ledger WHERE source_id = $1`,
        requestId,
      );
    }
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      rail: 'tempo',
      payer: PAYER,
      reason: 'stopped_before_pipeline:500',
      source_kind: 'request',
      original_tx: HASH.toLowerCase(),
    });

    // a second finish (or a repeat) books nothing more
    res.emit('finish');
    await new Promise((r) => setTimeout(r, 100));
    expect(await q(`SELECT 1 FROM refund_ledger WHERE source_id = $1`, requestId)).toHaveLength(1);

    // the chain-side judge matches that tx
    const chain: LogReader = {
      head: async () => HEAD,
      transfersTo: async (_w, _t, from, to) => {
        const block = HEAD - LAG - 100;
        return block >= from && block <= to
          ? [
              {
                tx_hash: HASH.toLowerCase(),
                from: PAYER,
                amount_atomic: '250000',
                block,
                timestamp: Math.floor(Date.now() / 1000) - 1800,
              },
            ]
          : [];
      },
    };
    const store = { v: String(HEAD - LAG - 1000) };
    const cursor: CursorStore = {
      get: async () => store.v,
      set: async (v: string) => void (store.v = v),
      status: async () => undefined,
    };
    const result = await reconcile({ chain, cursor });
    expect(result.unmatched).toBe(0);
    expect(
      await q(
        `SELECT 1 FROM outbox WHERE event_type = 'mpp_settle_unmatched' AND payload->>'tx_hash' = $1`,
        HASH.toLowerCase(),
      ),
    ).toHaveLength(0);
  });
});
