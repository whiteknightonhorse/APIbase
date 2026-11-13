/**
 * T-0838: apibase.call is the same request as the direct call. Real express stack in the order of
 * src/api/app.ts (express.json -> apibaseCallRewriteMiddleware -> x402Middleware -> mppMiddleware ->
 * createMcpRouter) over a local http server; runPipeline mocked to record the pipeline context.
 */
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { attachPaymentToMeta } from '@x402/mcp';

jest.mock('../../src/config/index', () => ({
  config: { ENCRYPTION_KEY: 'k'.repeat(40), X402_NETWORK: 'base' },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/config/x402.config', () => ({
  toMicroUsdc: (p: number) => String(Math.round(p * 1_000_000)),
  getX402Config: () => ({
    network: 'eip155:8453',
    usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    paymentAddress: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
    maxTimeoutSeconds: 120,
  }),
}));
jest.mock('../../src/config/mpp.config', () => ({
  getMppConfig: () => ({
    enabled: true,
    chainId: 4217,
    walletAddress: '0x9E29FF84B0f3EDa9756262d2F950C435495BA8cC',
  }),
}));
jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: () => ({ $executeRawUnsafe: jest.fn(async () => 1) }),
}));
jest.mock('../../src/pipeline/stages/tool-status.stage', () => ({
  getActiveToolIds: () => new Set<string>(),
  getToolPriceUsd: () => 0.005,
}));
const mockRun = jest.fn();
jest.mock('../../src/pipeline/pipeline', () => ({ runPipeline: (c: unknown) => mockRun(c) }));

import { apibaseCallRewriteMiddleware, planApibaseCall } from '../../src/mcp/apibase-call';
import { x402Middleware } from '../../src/middleware/x402.middleware';
import { mppMiddleware } from '../../src/middleware/mpp.middleware';
import { createMcpRouter } from '../../src/mcp/server';
import { LEAN_TOOL_NAMES } from '../../src/mcp/list-view';
import { TOOL_DEFINITIONS } from '../../src/mcp/tool-definitions';
import { toolSchemas } from '../../src/schemas/index';
import { register } from '../../src/services/metrics.service';
import { AppError } from '../../src/types/errors';

const FREE = TOOL_DEFINITIONS.find((d) => d.toolId === 'apibase.discover')!;
// A provider tool whose schema accepts {} (the price itself comes from the mocked pipeline).
const PAID = TOOL_DEFINITIONS.find(
  (d) =>
    d.mcpName &&
    d.mcpName !== d.toolId &&
    !/^(apibase|platform|shop)\./.test(d.toolId) &&
    toolSchemas[d.toolId]?.safeParse({}).success,
)!;
const PRICE = 0.005;

const PAYLOAD = {
  x402Version: 2,
  resource: { url: `https://h/api/v1/tools/${PAID.toolId}/call`, mimeType: 'application/json' },
  accepted: {
    scheme: 'exact',
    network: 'eip155:8453',
    amount: '5000',
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    payTo: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
    maxTimeoutSeconds: 120,
    extra: { name: 'USD Coin', version: '2' },
  },
  payload: { signature: '0xabc', authorization: { from: '0x1', to: '0x2', value: '5000' } },
};

type Ctx = Record<string, unknown> & { toolId: string; params: unknown; x402Paid?: boolean };
const seen: Ctx[] = [];

beforeEach(() => {
  seen.length = 0;
  mockRun.mockReset();
  // The pipeline as the money path sees it: the paid tool answers 402 until a payment is present.
  mockRun.mockImplementation(async (c: Ctx) => {
    seen.push(c);
    if (c.toolId === PAID.toolId && !c.x402Paid) {
      return {
        ok: false,
        error: {
          code: 402,
          error: 'payment_required',
          message: 'pay',
          extra: { price_usd: PRICE, price_version: 1 },
        },
      };
    }
    return {
      ok: true,
      value: {
        ...c,
        ...(c.x402Paid ? { x402Payer: '0xPAYER', x402SettleSucceeded: true } : {}),
        x402SettleTxHash: c.x402Paid ? '0xtx' : undefined,
        responseBody: { tool: c.toolId, params: c.params },
      },
    };
  });
});

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.requestId = 'rid';
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(apibaseCallRewriteMiddleware);
  app.use(x402Middleware);
  app.use(mppMiddleware);
  app.use(createMcpRouter());
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const e = err as AppError;
    res.status(e instanceof AppError ? e.httpStatus : 500).json({ message: e.message });
  });
  await new Promise<void>((r) => {
    server = app.listen(0, '127.0.0.1', () => r());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

const H = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
  'x-request-id': 'req-t0838',
};

function parse(text: string): unknown {
  const data = text
    .split('\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => JSON.parse(l.slice(6)));
  if (data.length) return data.length === 1 ? data[0] : data;
  return text ? JSON.parse(text) : null;
}

async function rpc(body: unknown, sid?: string, extra: Record<string, string> = {}) {
  const r = await fetch(`${base}/mcp${sid ? '' : '?tools=lean'}`, {
    method: 'POST',
    headers: { ...H, ...extra, ...(sid ? { 'mcp-session-id': sid } : {}) },
    body: JSON.stringify(body),
  });
  return { status: r.status, sid: r.headers.get('mcp-session-id'), json: parse(await r.text()) };
}

/** A lean session (initialize at /mcp?tools=lean + initialized). */
async function lean(): Promise<string> {
  const init = await rpc({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 't', version: '1' },
    },
  });
  const sid = init.sid as string;
  await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, sid);
  return sid;
}

type CallResult = {
  isError?: boolean;
  content: Array<{ text: string }>;
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
};
const resultOf = (json: unknown) => (json as { result: CallResult }).result;

const direct = (name: string, args: unknown, meta?: Record<string, unknown>) => ({
  jsonrpc: '2.0',
  id: 7,
  method: 'tools/call',
  params: { name, arguments: args, ...(meta ? { _meta: meta } : {}) },
});
const viaCall = (
  toolId: string,
  args: unknown,
  meta?: Record<string, unknown>,
  name = 'apibase.tools.call',
) => direct(name, { tool_id: toolId, arguments: args }, meta);

async function outcomes(): Promise<number> {
  const m = register.getSingleMetric('mcp_tool_call_outcomes_total') as unknown as {
    get: () => Promise<{ values: { value: number }[] }>;
  };
  return (await m.get()).values.reduce((a, v) => a + v.value, 0);
}

describe('apibase.call (T-0838)', () => {
  it('is listed in a lean session, with the annotations of platform.call_batch', async () => {
    const def = TOOL_DEFINITIONS.find((d) => d.toolId === 'apibase.call')!;
    expect(def.mcpName).toBe('apibase.tools.call');
    expect(def.annotations).toEqual(
      TOOL_DEFINITIONS.find((d) => d.toolId === 'platform.call_batch')!.annotations,
    );
    expect(LEAN_TOOL_NAMES.has('apibase.tools.call')).toBe(true);
    const sid = await lean();
    const list = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, sid);
    const names = (list.json as { result: { tools: { name: string }[] } }).result.tools.map(
      (t) => t.name,
    );
    expect(names).toContain('apibase.tools.call');
    expect(names).not.toContain(PAID.mcpName);
  });

  it('free tool: the same handler, pipeline tool id, params and result as the direct call', async () => {
    const sid = await lean();
    const a = await rpc(direct(FREE.mcpName!, { intent: 'weather' }), sid);
    const b = await rpc(viaCall(FREE.toolId, { intent: 'weather' }), sid);
    expect(seen).toHaveLength(2);
    expect(seen[1].toolId).toBe(FREE.toolId);
    expect(seen[1].toolId).toBe(seen[0].toolId);
    expect(seen[1].params).toEqual(seen[0].params);
    expect(resultOf(b.json)).toEqual(resultOf(a.json));
    expect(resultOf(b.json).isError).toBeUndefined();
  });

  it('paid tool without payment: the same 402 body (amount, asset, payTo, resource)', async () => {
    const sid = await lean();
    const a = resultOf((await rpc(direct(PAID.mcpName!, {}), sid)).json);
    const b = resultOf((await rpc(viaCall(PAID.mcpName!, {}), sid)).json);
    const c = resultOf((await rpc(viaCall(PAID.toolId, {}, undefined, 'apibase.call'), sid)).json);
    expect(seen.map((s) => s.toolId)).toEqual([PAID.toolId, PAID.toolId, PAID.toolId]);
    for (const r of [b, c]) {
      expect(r.isError).toBe(true);
      expect(r.structuredContent).toEqual(a.structuredContent);
      expect(r._meta).toEqual(a._meta);
    }
    const req = a._meta!['x402/payment-required'] as {
      accepts: Array<Record<string, string>>;
      resource: { url: string };
    };
    expect(req.accepts[0]).toMatchObject({
      amount: '5000',
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      payTo: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
    });
    expect(req.resource.url).toContain(`/api/v1/tools/${PAID.toolId}/call`);
    expect(JSON.stringify(b)).not.toContain('apibase.call');
  });

  it('paid retry with the _meta payment succeeds through apibase.call on the x402 rail', async () => {
    const sid = await lean();
    const meta = attachPaymentToMeta({ name: 'x', arguments: {} }, PAYLOAD as never)
      ._meta as Record<string, unknown>;
    const a = resultOf((await rpc(direct(PAID.mcpName!, {}, meta), sid)).json);
    const b = resultOf((await rpc(viaCall(PAID.toolId, {}, meta), sid)).json);
    expect(seen).toHaveLength(2);
    for (const s of seen) {
      expect(s.toolId).toBe(PAID.toolId); // ledger-write.stage.ts writes tool_id: ctx.toolId
      expect(s.x402Paid).toBe(true);
      expect(s.x402PaymentHeader).toBe(seen[0].x402PaymentHeader);
    }
    expect(b.isError).toBeUndefined();
    expect(b).toEqual(a);
    expect(b._meta!['x402/payment-response']).toMatchObject({ success: true, transaction: '0xtx' });
  });

  it('MPP on MCP is not bound to the tool price today: the credential is refused the same way', async () => {
    const sid = await lean();
    const cred = { 'payment-authorization': 'Payment abc' };
    const a = await rpc(direct(PAID.mcpName!, {}), sid, cred);
    const b = await rpc(viaCall(PAID.toolId, {}), sid, cred);
    expect(a.status).toBe(400);
    expect(b.status).toBe(a.status);
    expect(b.json).toEqual(a.json);
    expect(String((a.json as { message: string }).message)).toContain(
      'MPP credentials are accepted only on the route that issued the challenge',
    );
    expect(seen).toHaveLength(0);
  });

  it('counts the outcome once, as a direct call does', async () => {
    const sid = await lean();
    const t0 = await outcomes();
    await rpc(direct(PAID.mcpName!, {}), sid);
    const t1 = await outcomes();
    await rpc(viaCall(PAID.toolId, {}), sid);
    const t2 = await outcomes();
    expect(t1 - t0).toBe(1);
    expect(t2 - t1).toBe(1);
  });

  it('a JSON-RPC batch with two apibase.call entries rewrites both', () => {
    const body = [
      viaCall(FREE.toolId, {}),
      viaCall(PAID.mcpName!, { q: 1 }, { k: 'v' }, 'apibase.call'),
    ];
    apibaseCallRewriteMiddleware(
      { method: 'POST', path: '/mcp', body, requestId: 'r' } as unknown as Request,
      {} as Response,
      () => undefined,
    );
    expect(body[0].params).toEqual({ name: FREE.mcpName, arguments: {} });
    expect(body[1].params).toEqual({ name: PAID.mcpName, arguments: { q: 1 }, _meta: { k: 'v' } });
  });

  it('POST /messages is rewritten too; a storefront path is not', () => {
    const m = viaCall(FREE.toolId, {});
    const s = viaCall(FREE.toolId, {});
    const run = (path: string, body: unknown) =>
      apibaseCallRewriteMiddleware(
        { method: 'POST', path, body, requestId: 'r' } as unknown as Request,
        {} as Response,
        () => undefined,
      );
    run('/messages', m);
    run('/mcp/m/shop-a', s);
    expect(m.params.name).toBe(FREE.mcpName);
    expect(s.params.name).toBe('apibase.tools.call');
  });

  describe('refusals: tool error with error_code and a next step, nothing charged', () => {
    const cases: Array<[string, unknown, string, string]> = [
      [
        'unknown tool_id',
        { tool_id: 'no.such.tool', arguments: {} },
        'UNKNOWN_TOOL_ID',
        'apibase.discover',
      ],
      [
        'target apibase.call',
        { tool_id: 'apibase.call', arguments: {} },
        'TARGET_NOT_ALLOWED',
        'by name',
      ],
      [
        'target apibase.tools.call',
        { tool_id: 'apibase.tools.call', arguments: {} },
        'TARGET_NOT_ALLOWED',
        'by name',
      ],
      [
        'target platform.call_batch',
        { tool_id: 'platform.call_batch', arguments: {} },
        'TARGET_NOT_ALLOWED',
        'platform.batch.call by name',
      ],
      [
        'target shop.*',
        { tool_id: 'shop.catalog.search', arguments: {} },
        'SHOP_TOOL_BY_NAME',
        'by name',
      ],
      [
        'arguments not an object',
        { tool_id: FREE.toolId, arguments: [1] },
        'ARGUMENTS_NOT_OBJECT',
        'apibase.describe',
      ],
      ['arguments absent', { tool_id: FREE.toolId }, 'ARGUMENTS_NOT_OBJECT', 'apibase.describe'],
    ];

    it.each(cases)('%s', async (_label, args, code, next) => {
      const plan = planApibaseCall(args);
      expect(plan.ok).toBe(false);
      const sid = await lean();
      const r = resultOf((await rpc(direct('apibase.tools.call', args), sid)).json);
      expect(r.isError).toBe(true);
      const body = JSON.parse(r.content[0].text);
      expect(body).toMatchObject({
        error: 'apibase_call_refused',
        error_code: code,
        charged: false,
      });
      expect(body.next_step).toContain(next);
      expect(seen).toHaveLength(0);
    });

    it('a refused entry is not rewritten', () => {
      const body = viaCall('no.such.tool', {});
      const before = JSON.stringify(body);
      apibaseCallRewriteMiddleware(
        { method: 'POST', path: '/mcp', body, requestId: 'r' } as unknown as Request,
        {} as Response,
        () => undefined,
      );
      expect(JSON.stringify(body)).toBe(before);
    });
  });
});

describe('apibase.call over REST or inside a batch (T-0838)', () => {
  it('the adapter refuses with 422 input rejected and names the direct route', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ApibaseAdapter } =
      require('../../src/adapters/apibase') as typeof import('../../src/adapters/apibase');
    await expect(
      new ApibaseAdapter().call({
        toolId: 'apibase.call',
        params: { tool_id: 'apibase.discover', arguments: {} },
        requestId: 'r',
      }),
    ).rejects.toMatchObject({
      code: 'provider_input_rejected',
      httpStatus: 422,
      message: expect.stringContaining('/api/v1/tools/<tool_id>/call'),
    });
  });
});
