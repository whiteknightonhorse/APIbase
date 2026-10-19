/**
 * T-0429: x402 MCP transport v2. A 402 tool result carries the PaymentRequired object in `_meta`
 * (equal to the HTTP 402 body); a payment in `params._meta` is accepted when no X-Payment header
 * is present; header + `_meta` with different payloads -> 400; explicit nulls from Python/Go
 * clients parse; a settled call returns the payment-response in the result `_meta`.
 */
import {
  attachPaymentToMeta,
  MCP_PAYMENT_META_KEY,
  MCP_PAYMENT_RESPONSE_META_KEY,
} from '@x402/mcp';
import { decodePaymentSignatureHeader, encodePaymentSignatureHeader } from '@x402/core/http';
import type { Request } from 'express';

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
const mockRun = jest.fn();
jest.mock('../../src/pipeline/pipeline', () => ({ runPipeline: (c: unknown) => mockRun(c) }));

import { x402Middleware, buildPaymentRequiredResponse } from '../../src/middleware/x402.middleware';
import { getDefinitionSha256 } from '../../src/mcp/tool-fingerprint';
import { registerTools, type PaymentContext } from '../../src/mcp/tool-adapter';
import { TOOL_DEFINITIONS } from '../../src/mcp/tool-definitions';
import { AppError } from '../../src/types/errors';

const PAYLOAD = {
  x402Version: 2,
  resource: { url: 'https://h/api/v1/tools/x/call', mimeType: 'application/json' },
  accepted: {
    scheme: 'exact',
    network: 'eip155:8453',
    amount: '1000',
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    payTo: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
    maxTimeoutSeconds: 120,
    extra: { name: 'USD Coin', version: '2' },
  },
  payload: { signature: '0xabc', authorization: { from: '0x1', to: '0x2', value: '1000' } },
};

function mcpReq(params: Record<string, unknown>, headers: Record<string, string> = {}): Request {
  return {
    method: 'POST',
    path: '/mcp',
    headers,
    body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params },
    log: { info: jest.fn(), warn: jest.fn() },
    requestId: 'r1',
  } as unknown as Request;
}

function run(req: Request): Promise<unknown> {
  return new Promise((resolve) => x402Middleware(req, {} as never, (e?: unknown) => resolve(e)));
}

describe('x402 over MCP: payment in params._meta (T-0429)', () => {
  it('uses the @x402/mcp 2.28 key names', () => {
    expect(MCP_PAYMENT_META_KEY).toBe('x402/payment');
    expect(MCP_PAYMENT_RESPONSE_META_KEY).toBe('x402/payment-response');
  });

  it('accepts a payment from _meta when there is no header, re-encoded as X-Payment', async () => {
    const params = attachPaymentToMeta({ name: 't', arguments: {} }, PAYLOAD as never);
    const req = mcpReq(params as never);
    expect(await run(req)).toBeUndefined();
    expect((req as unknown as { x402Payment: { verified: boolean } }).x402Payment.verified).toBe(
      true,
    );
    expect(decodePaymentSignatureHeader(req.headers['x-payment'] as string)).toEqual(PAYLOAD);
  });

  it('parses explicit nulls on optional fields (Python/Go clients)', async () => {
    const withNulls = {
      ...PAYLOAD,
      extensions: null,
      resource: { ...PAYLOAD.resource, description: null },
    };
    const req = mcpReq(
      attachPaymentToMeta({ name: 't', arguments: {} }, withNulls as never) as never,
    );
    expect(await run(req)).toBeUndefined();
    const sent = decodePaymentSignatureHeader(req.headers['x-payment'] as string) as Record<
      string,
      unknown
    >;
    expect('extensions' in sent).toBe(false);
  });

  it('header wins when both carry the same payload', async () => {
    const header = encodePaymentSignatureHeader(PAYLOAD as never);
    const req = mcpReq(
      attachPaymentToMeta({ name: 't', arguments: {} }, PAYLOAD as never) as never,
      {
        'x-payment': header,
      },
    );
    expect(await run(req)).toBeUndefined();
    expect(req.headers['x-payment']).toBe(header);
  });

  it('header + _meta with different payloads -> 400', async () => {
    const other = { ...PAYLOAD, payload: { ...PAYLOAD.payload, signature: '0xdef' } };
    const req = mcpReq(
      attachPaymentToMeta({ name: 't', arguments: {} }, PAYLOAD as never) as never,
      {
        'x-payment': encodePaymentSignatureHeader(other as never),
      },
    );
    const err = await run(req);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).httpStatus).toBe(400);
  });

  it('a non-object _meta payment -> 400; no _meta -> untouched', async () => {
    const bad = await run(mcpReq({ name: 't', _meta: { 'x402/payment': 'nope' } }));
    expect((bad as AppError).httpStatus).toBe(400);
    const plain = mcpReq({ name: 't', arguments: {} });
    expect(await run(plain)).toBeUndefined();
    expect(plain.headers['x-payment']).toBeUndefined();
  });

  it('ignores _meta on routes that are not JSON-RPC', async () => {
    const req = mcpReq(attachPaymentToMeta({ name: 't' }, PAYLOAD as never) as never);
    (req as unknown as { path: string }).path = '/api/v1/tools/x/call';
    expect(await run(req)).toBeUndefined();
    expect(req.headers['x-payment']).toBeUndefined();
  });
});

describe('x402 over MCP: tool results (T-0429)', () => {
  const def = TOOL_DEFINITIONS[0];
  const ctx = (o: Partial<PaymentContext> = {}): PaymentContext => ({
    x402Paid: false,
    x402Payer: null,
    x402PaymentHeader: null,
    mppPaid: false,
    mppPayer: null,
    mppMethod: null,
    mppPaymentHeader: null,
    mppAmount: null,
    mppTxHash: null,
    host: 'apibase.pro',
    ...o,
  });

  async function call(paymentCtx: PaymentContext) {
    const cbs = new Map<string, (a: Record<string, unknown>) => Promise<unknown>>();
    registerTools(
      { registerTool: (n: string, _c: unknown, cb: never) => cbs.set(n, cb) } as never,
      'apb_key',
      'req-1',
      paymentCtx,
    );
    const cb = cbs.get(def.mcpName || def.toolId);
    if (!cb) throw new Error('tool not registered');
    return (await cb({})) as Record<string, unknown>;
  }

  it('a 402 keeps isError + JSON text and carries the HTTP 402 body in _meta', async () => {
    mockRun.mockResolvedValue({
      ok: false,
      error: {
        code: 402,
        error: 'payment_required',
        message: 'pay',
        extra: { price_usd: 0.001, price_version: 3 },
      },
    });
    const r = await call(ctx());
    const expected = buildPaymentRequiredResponse(def.toolId, 0.001, 3, 'req-1', 'apibase.pro');
    expect(r.isError).toBe(true);
    expect(JSON.parse((r.content as Array<{ text: string }>)[0].text).error).toBe(
      'payment_required',
    );
    expect((r._meta as Record<string, unknown>)['x402/payment-required']).toEqual(expected);
    expect(r.structuredContent).toEqual(expected);
    expect((expected.accepts as Array<{ maxTimeoutSeconds: number }>)[0].maxTimeoutSeconds).toBe(
      120,
    );
  });

  it('non-402 errors get no payment _meta', async () => {
    mockRun.mockResolvedValue({
      ok: false,
      error: { code: 404, error: 'not_found', message: 'x' },
    });
    expect((await call(ctx()))._meta).toBeUndefined();
  });

  it('a settled x402 call returns the payment-response in _meta', async () => {
    mockRun.mockImplementation(async (c: Record<string, unknown>) => {
      c.x402SettleSucceeded = true;
      c.x402SettleTxHash = '0xtx';
      return { ok: true, value: { responseBody: { a: 1 } } };
    });
    const r = await call(ctx({ x402Paid: true, x402Payer: '0xPAYER', x402PaymentHeader: 'h' }));
    expect(r._meta).toEqual({
      'x402/payment-response': {
        success: true,
        transaction: '0xtx',
        network: 'eip155:8453',
        payer: '0xPAYER',
      },
    });
  });

  it('an unpaid or unsettled success has no payment-response', async () => {
    mockRun.mockResolvedValue({ ok: true, value: { responseBody: {} } });
    expect((await call(ctx()))._meta).toBeUndefined();
    expect(
      (await call(ctx({ x402Paid: true, x402Payer: '0x1', x402PaymentHeader: 'h' })))._meta,
    ).toBeUndefined();
  });
});

describe('T-0500: registerTool config carries definition_sha256 in _meta', () => {
  it('every registered tool has _meta["apibase/definition_sha256"] equal to the map value', () => {
    const configs = new Map<string, { _meta?: Record<string, unknown> }>();
    registerTools(
      {
        registerTool: (n: string, c: { _meta?: Record<string, unknown> }) => configs.set(n, c),
      } as never,
      'apb_key',
      'req-1',
    );
    expect(configs.size).toBeGreaterThan(0);
    for (const def of TOOL_DEFINITIONS) {
      const cfg = configs.get(def.mcpName || def.toolId);
      if (!cfg) continue; // skipped at registration (no ZodObject schema)
      expect(cfg._meta?.['apibase/definition_sha256']).toBe(getDefinitionSha256(def.toolId));
      expect(cfg._meta?.['apibase/definition_sha256']).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
