/**
 * T-0554: the paid result is retrievable for 24 h by the payer (EIP-191 signed, free).
 */
import express from 'express';
import type { AddressInfo } from 'node:net';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/config/x402.config', () => ({
  getX402Config: () => ({
    network: 'eip155:8453',
    paymentAddress: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
  }),
}));
jest.mock('../../src/config/mpp.config', () => ({
  getMppConfig: () => ({
    chainId: 4217,
    walletAddress: '0x9E29FF84B0f3EDa9756262d2F950C435495BA8cC',
  }),
}));
const mockEscrow = {
  reserve: jest.fn(),
  finalize: jest.fn(),
  refund: jest.fn(),
};
jest.mock('../../src/services/escrow.service', () => mockEscrow);
jest.mock('../../src/config/internal-wallets', () => ({
  isInternalWallet: (a: string) => a.toLowerCase() === '0x1111111111111111111111111111111111111111',
}));

import {
  RESULT_MAX_BYTES,
  RESULT_TTL_SECONDS,
  planReceipt,
  type ResultStore,
} from '../../src/services/public-receipt.service';
import { createX402Router, retrieveMessage } from '../../src/routes/x402.router';
import { createPipelineContext, type PipelineContext } from '../../src/pipeline/types';

const NOW = new Date('2026-10-20T12:00:30.000Z');
const TX = '0x' + 'ab'.repeat(32);
const account = privateKeyToAccount(generatePrivateKey());
const other = privateKeyToAccount(generatePrivateKey());

function billed(payer: string): PipelineContext {
  const ctx = createPipelineContext('req-1', 'POST', '/api/v1/tools/x/call', {}, {});
  ctx.toolId = 'weather.current';
  ctx.billingStatus = 'PAID';
  ctx.finalCost = 0.001;
  ctx.x402Paid = true;
  ctx.x402Payer = payer;
  ctx.x402SettleSucceeded = true;
  ctx.x402SettleTxHash = TX;
  return ctx;
}

function fakeStore(): ResultStore & { calls: unknown[][]; data: Map<string, string> } {
  const data = new Map<string, string>();
  const calls: unknown[][] = [];
  return {
    calls,
    data,
    async put(id, body, ttl) {
      calls.push([id, body, ttl]);
      data.set(id, body);
      return true;
    },
  };
}

describe('planReceipt stores the paid body', () => {
  it('eligible call stores body with 86400 TTL; receipt carries both keys', async () => {
    const store = fakeStore();
    const plan = (await planReceipt(billed(account.address), '{"data":1}', NOW, store))!;
    expect(store.calls).toEqual([[plan.receiptId, '{"data":1}', 86400]]);
    expect(RESULT_TTL_SECONDS).toBe(86400);
    const body = JSON.parse(plan.body);
    expect(body.retrieve_url).toBe(`https://apibase.pro/x402/retrieve/${plan.receiptId}`);
    expect(body.result_retained_until).toBe('2026-10-21T12:00:30.000Z');
    expect(plan.retrieveUrl).toBe(body.retrieve_url);
    expect(plan.body).not.toMatch(/idempot|retry/i);
  });

  it('oversize body is not stored; null', async () => {
    const store = fakeStore();
    const plan = (await planReceipt(
      billed(account.address),
      'x'.repeat(RESULT_MAX_BYTES + 1),
      NOW,
      store,
    ))!;
    expect(store.calls).toHaveLength(0);
    expect(JSON.parse(plan.body).result_retained_until).toBeNull();
  });

  it('exactly at the cap is stored', async () => {
    const store = fakeStore();
    await planReceipt(billed(account.address), 'x'.repeat(RESULT_MAX_BYTES), NOW, store);
    expect(store.calls).toHaveLength(1);
  });

  it('internal wallet is not stored; null', async () => {
    const store = fakeStore();
    const plan = (await planReceipt(
      billed('0x1111111111111111111111111111111111111111'),
      'x',
      NOW,
      store,
    ))!;
    expect(store.calls).toHaveLength(0);
    expect(JSON.parse(plan.body).result_retained_until).toBeNull();
  });

  it('store failure (Redis down) -> receipt says null', async () => {
    const down: ResultStore = { put: async () => false };
    const plan = (await planReceipt(billed(account.address), 'x', NOW, down))!;
    expect(JSON.parse(plan.body).result_retained_until).toBeNull();
  });
});

describe('GET /x402/retrieve/:receiptId', () => {
  const ID = 'a'.repeat(32);
  const T0 = Date.parse('2026-10-20T12:00:30.000Z');
  const minute = Math.floor(T0 / 60000);
  let stored: string | null;
  let receipt: Record<string, unknown> | null;
  let server: ReturnType<express.Application['listen']>;
  let base: string;

  beforeAll(async () => {
    const { verifyMessage } = await import('viem');
    const app = express();
    app.use(
      createX402Router(
        {
          insert: async () => undefined,
          get: async () => (receipt ? JSON.stringify(receipt) : null),
        },
        { get: async () => stored },
        (a) => verifyMessage(a),
        () => T0,
      ),
    );
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise((r) => server.close(() => r(undefined))));
  beforeEach(() => {
    stored = '{"data":1}';
    receipt = {
      payer: account.address.toLowerCase(),
      rail: 'x402-base',
      upstream_status: 200,
      response_sha256: 'f'.repeat(64),
      result_retained_until: '2026-10-21T12:00:30.000Z',
    };
    jest.clearAllMocks();
  });

  async function get(signer: typeof account, min: number, id = ID, addr = account.address) {
    const signature = await signer.signMessage({ message: retrieveMessage(id, min) });
    return fetch(`${base}/x402/retrieve/${id}`, {
      headers: { 'X-Payer-Address': addr, 'X-Payer-Signature': signature },
    });
  }

  it('current minute -> 200 with body, charged:false', async () => {
    const r = await get(account, minute);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      receipt_id: ID,
      status: 'delivered',
      charged: false,
      upstream_status: 200,
      response_sha256: 'f'.repeat(64),
      result: { data: 1 },
    });
    expect(mockEscrow.reserve).not.toHaveBeenCalled();
    expect(mockEscrow.finalize).not.toHaveBeenCalled();
    expect(mockEscrow.refund).not.toHaveBeenCalled();
  });

  it('previous minute -> 200', async () => {
    expect((await get(account, minute - 1)).status).toBe(200);
  });

  it('two minutes old -> 401', async () => {
    const r = await get(account, minute - 2);
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe('retrieve_signature_invalid');
  });

  it('wrong signer -> 401', async () => {
    const r = await get(other, minute);
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe('retrieve_signature_invalid');
  });

  it('wrong address header -> 401', async () => {
    expect((await get(account, minute, ID, other.address)).status).toBe(401);
  });

  it('missing signature -> 401', async () => {
    const r = await fetch(`${base}/x402/retrieve/${ID}`);
    expect(r.status).toBe(401);
  });

  it('mpp payer with a non-secp256k1 signature -> retrieve_unsupported_key', async () => {
    receipt!.rail = 'mpp-tempo';
    const r = await fetch(`${base}/x402/retrieve/${ID}`, {
      headers: { 'X-Payer-Address': account.address, 'X-Payer-Signature': '0x' + 'ab'.repeat(100) },
    });
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe('retrieve_unsupported_key');
  });

  it('after expiry -> 410 with the hash', async () => {
    stored = null;
    const r = await get(account, minute);
    expect(r.status).toBe(410);
    const j = await r.json();
    expect(j.response_sha256).toBe('f'.repeat(64));
    expect(j.status).toBe('delivered');
    expect(j.result_retained_until).toBe('2026-10-21T12:00:30.000Z');
    expect(j.result).toBeUndefined();
  });

  it('unknown receipt -> 404', async () => {
    receipt = null;
    expect((await get(account, minute)).status).toBe(404);
  });

  it('malformed id -> 404', async () => {
    const r = await fetch(`${base}/x402/retrieve/not-an-id`);
    expect(r.status).toBe(404);
  });
});
