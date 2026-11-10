/**
 * T-0655: upstream payer adapter kind (MARKET-SIGNALS-1102 S21). APIbase pays a provider's own
 * 402 from a dedicated payer wallet. Covers: shipped config + locked price; every challenge
 * refusal happens before any signing; x402 buyer never settled on upstream failure; MPP buyer
 * gets a refund row with reason upstream_failed:<code>; daily cap and balance gates; the receipt
 * carries upstream_tx; no key in any log line; sandbox end to end against a local x402 402 mock
 * with a real EIP-3009 signature.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { keccak256, toBytes, verifyTypedData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const logged: unknown[] = [];
const everLogged: unknown[] = [];
const capture = (...a: unknown[]) => void (logged.push(a), everLogged.push(a));
jest.mock('../../src/config/logger', () => ({
  logger: { info: capture, warn: capture, error: capture, debug: capture },
}));
jest.mock('../../src/config/index', () => ({
  config: {
    X402_NETWORK: 'base',
    X402_PAYMENT_ADDRESS: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
    X402_FACILITATOR_URL: 'https://facilitator.example',
    X402_FACILITATOR_MODE: 'local',
    X402_OPERATOR_PRIVATE_KEY: '0x00',
    X402_BASE_RPC_URL: 'https://base.example',
    X402_BASE_SEPOLIA_RPC_URL: 'https://sepolia.example',
    X402_OPERATOR_MIN_ETH_BALANCE: 0.01,
  },
}));
jest.mock('../../src/services/prisma.service', () => ({ getPrisma: () => ({}) }));
jest.mock('../../src/services/redis.service', () => ({}));
jest.mock('../../src/services/cache.service', () => ({ releaseLock: async () => undefined }));
jest.mock('../../src/services/x402-server.service', () => ({
  getSharedResourceServer: () => ({}),
}));
jest.mock('../../src/services/alternatives.service', () => ({
  getAlternativesForTool: async () => [],
  getCapabilityForTool: () => undefined,
}));
const mockResolve = jest.fn();
jest.mock('../../src/adapters/registry', () => ({ resolveAdapter: (t: string) => mockResolve(t) }));
const mockSettle = jest.fn();
jest.mock('../../src/pipeline/stages/x402-settle', () => ({
  settleX402: (...a: unknown[]) => mockSettle(...a),
}));
const mockRefund = jest.fn(async () => null);
jest.mock('../../src/services/refund-ledger.service', () => ({
  recordRefundOwed: (...a: unknown[]) => (mockRefund as jest.Mock)(...a),
}));

import {
  Upstream402Adapter,
  parseUpstreamConfig,
  setUpstreamConfig,
  upstreamToolPriceUsd,
  upstreamToolLimits,
  upstreamGateForTool,
  parseMppChallenges,
  type UpstreamPayConfig,
} from '../../src/adapters/_upstream-402';
import {
  setBalanceReader,
  setSpendStore,
  upstreamGate,
  reserveDailySpend,
  spendKey,
  payerState,
  realPayerPort,
  type PayerPort,
  type SpendStore,
} from '../../src/payments/upstream-payer';
import { getUpstreamEnv } from '../../src/config/env';
import { providerCallStage } from '../../src/pipeline/stages/provider-call.stage';
import { runPipeline, PIPELINE_STAGES } from '../../src/pipeline/pipeline';
import { createPipelineContext, ok, type PipelineContext } from '../../src/pipeline/types';
import { buildReceiptBody, RECEIPT_ALLOWED_KEYS } from '../../src/services/public-receipt.service';

const E = process['env'];
// Runtime-derived throwaway key (no literal key material in this file).
const TEST_KEY = keccak256(toBytes('t0655-upstream-payer-test-only'));
const PAYER = privateKeyToAccount(TEST_KEY).address;
let RECORD_DIR = '';
function writeRecord(names: string[]): void {
  writeFileSync(
    E.REFUND_WALLET_RECORD as string,
    JSON.stringify(
      names.map((name) => ({ name, rail: 'base', address: PAYER, created_at: 'test' })),
    ),
  );
}
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDCE = '0x20C000000000000000000000b9537d11c60E8b50';
const PAY_TO = '0xA45140E99E9482a50BC3fA5F6000c02FAAB6F65E';
const TX = '0x' + 'ab'.repeat(32);
const TOOL = 'upmock.read';

function cfgFor(rail: 'x402' | 'mpp', url: string): UpstreamPayConfig {
  return {
    rail,
    network: rail === 'x402' ? 'eip155:8453' : 'eip155:4217',
    asset: rail === 'x402' ? USDC : USDCE,
    listed_price_usd: '0.002',
    max_price_usd: '0.002',
    pay_to_allowlist: [PAY_TO],
    tools: { [TOOL]: { method: 'GET', url } },
  };
}

function memStore(): SpendStore & { m: Map<string, number> } {
  const m = new Map<string, number>();
  return {
    m,
    async reserve(k, micro, cap) {
      const v = (m.get(k) ?? 0) + micro;
      if (v > cap) return -1;
      m.set(k, v);
      return v;
    },
    async get(k) {
      return m.get(k) ?? 0;
    },
  };
}

type Accept = { scheme: string; network: string; asset: string; amount: string; payTo: string };
const accept = (o: Partial<Accept> = {}) => ({
  scheme: 'exact',
  network: 'eip155:8453',
  asset: USDC,
  amount: '2000',
  payTo: PAY_TO,
  maxTimeoutSeconds: 300,
  extra: { name: 'USD Coin', version: '2' },
  ...o,
});
const x402Header = (accepts: unknown[]) =>
  Buffer.from(
    JSON.stringify({ x402Version: 2, resource: { url: 'https://up.example/read' }, accepts }),
  ).toString('base64');
const mppHeader = (o: Record<string, unknown> = {}, id = 'ch1') => {
  const req = Buffer.from(
    JSON.stringify({
      amount: '2000',
      currency: USDCE,
      methodDetails: { chainId: 4217 },
      recipient: PAY_TO,
      ...o,
    }),
  ).toString('base64url');
  return `Payment id="${id}", realm="up.example", method="tempo", intent="charge", request="${req}", description="Read, \\"quoted\\""`;
};

/** fetch stub: first call answers 402 with `challenge`, second answers `paid`. */
function fetchStub(
  challenge: Record<string, string>,
  paid: { status: number; headers?: Record<string, string>; body?: string } = {
    status: 200,
    headers: {
      'payment-response': Buffer.from(JSON.stringify({ success: true, transaction: TX })).toString(
        'base64',
      ),
    },
    body: '{"content_markdown":"# hi"}',
  },
) {
  const calls: Array<Record<string, string>> = [];
  const f = jest.fn(async (_u: unknown, init?: RequestInit) => {
    calls.push({ ...(init?.headers as Record<string, string>) });
    if (calls.length === 1) return new Response('{}', { status: 402, headers: challenge });
    return new Response(paid.body ?? '{}', { status: paid.status, headers: paid.headers });
  });
  return { f: f as unknown as typeof fetch, calls };
}

function fakePort(): PayerPort & { x: jest.Mock; m: jest.Mock } {
  const x = jest.fn(async () => 'signed-x402');
  const m = jest.fn(async () => 'Payment signed-mpp');
  return { x, m, signX402: x, signMpp: m };
}

let store: ReturnType<typeof memStore>;
beforeEach(() => {
  logged.length = 0;
  mockSettle.mockReset();
  mockRefund.mockClear();
  mockResolve.mockReset();
  store = memStore();
  setSpendStore(store);
  setBalanceReader(async () => 10);
  E.UPSTREAM_PAYER_KEY_BASE = TEST_KEY;
  E.UPSTREAM_PAYER_KEY_TEMPO = TEST_KEY;
  // T-0698: the container never writes the record; the test writes it (addresses only).
  RECORD_DIR = mkdtempSync(join(tmpdir(), 't0698-rec-'));
  E.REFUND_WALLET_RECORD = join(RECORD_DIR, 'server-wallets.json');
  writeRecord(['UPSTREAM_PAYER_KEY_BASE', 'UPSTREAM_PAYER_KEY_TEMPO']);
  delete E.UPSTREAM_DAILY_CAP_USD_PER_PROVIDER;
});
afterAll(() => {
  setUpstreamConfig(null);
  setSpendStore(null);
  setBalanceReader(null);
  delete E.UPSTREAM_PAYER_KEY_BASE;
  delete E.UPSTREAM_PAYER_KEY_TEMPO;
});

function paidCtx(rail: 'x402' | 'mpp'): PipelineContext {
  const ctx = createPipelineContext(
    'req-t0655',
    'POST',
    `/api/v1/tools/${TOOL}/call`,
    { url: 'https://example.com/' },
    {},
  );
  ctx.toolId = TOOL;
  ctx.toolPrice = 0.003;
  ctx.agentId = 'agent-1';
  if (rail === 'x402') {
    ctx.x402Paid = true;
    ctx.x402Payer = '0x' + '11'.repeat(20);
  } else {
    ctx.mppPaid = true;
    ctx.mppPayer = '0x' + '22'.repeat(20);
    ctx.mppAmount = '0.003';
    ctx.mppTxHash = '0x' + 'cd'.repeat(32);
  }
  return ctx;
}

function useAdapter(
  rail: 'x402' | 'mpp',
  f: typeof fetch,
  port: PayerPort,
  url = 'https://up.example/read',
) {
  setUpstreamConfig(new Map([['upmock', cfgFor(rail, url)]]));
  const a = new Upstream402Adapter('upmock', port, f);
  mockResolve.mockReturnValue(a);
  return a;
}

describe('config and locked price', () => {
  const doc = parse(
    readFileSync(join(__dirname, '../../config/tool_provider_config.yaml'), 'utf8'),
  );

  it('shipped upstream_pay parses; the pilot price equals upstreamToolPriceUsd(listed, default bps)', () => {
    const m = parseUpstreamConfig(doc);
    const pilot = m.get('inferrail');
    expect(pilot?.rail).toBe('x402');
    for (const [provider, cfg] of m) {
      for (const toolId of Object.keys(cfg.tools)) {
        const t = doc.tools.find((x: { tool_id: string }) => x.tool_id === toolId);
        expect(t.provider).toBe(provider);
        const { listedUsd } = upstreamToolLimits(cfg, toolId);
        expect(t.price_usd).toBe(upstreamToolPriceUsd(Number(listedUsd), 3000));
        // T-0758: the upstream-paid price always clears the margin gate (listed x 1.3).
        expect(Number(t.price_usd)).toBeGreaterThanOrEqual(
          Math.round(Number(listedUsd) * 1.3 * 1e8) / 1e8,
        );
        expect(t.upstream_cost_model).toBe('upstream_402');
      }
    }
    expect(upstreamToolPriceUsd(0.002, 3000)).toBe('0.003');
    expect(upstreamToolPriceUsd(0.005, 3000)).toBe('0.007');
    expect(upstreamToolPriceUsd(0.3, 3000)).toBe('0.390');
    expect(upstreamToolPriceUsd(2.5, 3000)).toBe('3.250');
    expect(getUpstreamEnv({}).UPSTREAM_MARKUP_BPS).toBe(3000);
  });

  it('rejects a block outside the closed set or priced above our price', () => {
    const tools = [{ tool_id: 'p.x', provider: 'p', price_usd: '0.003' }];
    const block = {
      ...cfgFor('x402', 'https://p.example/x'),
      tools: { 'p.x': { method: 'GET', url: 'https://p.example/x' } },
    };
    expect(() => parseUpstreamConfig({ tools, upstream_pay: { p: block } })).not.toThrow();
    expect(() =>
      parseUpstreamConfig({ tools, upstream_pay: { p: { ...block, rail: 'stripe' } } }),
    ).toThrow();
    expect(() =>
      parseUpstreamConfig({ tools, upstream_pay: { p: { ...block, network: 'eip155:4217' } } }),
    ).toThrow();
    expect(() =>
      parseUpstreamConfig({ tools, upstream_pay: { p: { ...block, extra_key: 1 } } }),
    ).toThrow();
    expect(() =>
      parseUpstreamConfig({ tools, upstream_pay: { p: { ...block, max_price_usd: '0.004' } } }),
    ).toThrow(/price_usd below/);
    expect(() =>
      parseUpstreamConfig({
        tools,
        upstream_pay: {
          p: { ...block, tools: { 'q.x': { method: 'GET', url: 'https://q.example' } } },
        },
      }),
    ).toThrow();
  });

  it("buyer price is locked: the provider's challenge price never changes ctx.toolPrice", async () => {
    for (const amount of ['1000', '2000']) {
      const s = fetchStub({ 'payment-required': x402Header([accept({ amount })]) });
      useAdapter('x402', s.f, fakePort());
      const ctx = paidCtx('x402');
      const r = await providerCallStage.execute(ctx);
      expect(r.ok).toBe(true);
      expect(ctx.toolPrice).toBe(0.003);
      expect(ctx.upstreamCostUsd).toBe(Number(amount) / 1e6);
      expect(ctx.upstreamTx).toBe(TX);
    }
  });
});

describe('refusals happen before any signing', () => {
  const cases: Array<[string, Partial<Accept>, string]> = [
    ['network', { network: 'eip155:84532' }, 'upstream_network_mismatch'],
    ['asset', { asset: '0x' + '99'.repeat(20) }, 'upstream_asset_mismatch'],
    ['payTo', { payTo: '0x' + '77'.repeat(20) }, 'upstream_payto_not_allowed'],
    ['max_price', { amount: '2001' }, 'upstream_price_exceeded'],
  ];
  it.each(cases)('x402 %s', async (_n, o, code) => {
    const port = fakePort();
    const s = fetchStub({ 'payment-required': x402Header([accept(o)]) });
    useAdapter('x402', s.f, port);
    const ctx = paidCtx('x402');
    const r = await providerCallStage.execute(ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.error).toBe(code);
    expect(port.x).not.toHaveBeenCalled();
    expect(s.calls).toHaveLength(1);
  });

  const mcases: Array<[string, Record<string, unknown>, string]> = [
    ['network', { methodDetails: { chainId: 42431 } }, 'upstream_network_mismatch'],
    ['asset', { currency: '0x' + '99'.repeat(20) }, 'upstream_asset_mismatch'],
    ['recipient', { recipient: '0x' + '77'.repeat(20) }, 'upstream_payto_not_allowed'],
    ['max_price', { amount: '2001' }, 'upstream_price_exceeded'],
  ];
  it.each(mcases)('mpp %s', async (_n, o, code) => {
    const port = fakePort();
    const s = fetchStub({ 'www-authenticate': mppHeader(o) });
    useAdapter('mpp', s.f, port);
    const r = await providerCallStage.execute(paidCtx('mpp'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.error).toBe(code);
    expect(port.m).not.toHaveBeenCalled();
  });

  it('mpp challenge with splits is never paid', async () => {
    const port = fakePort();
    const s = fetchStub({
      'www-authenticate': mppHeader({
        methodDetails: { chainId: 4217, splits: [{ recipient: PAY_TO, amount: '1' }] },
      }),
    });
    useAdapter('mpp', s.f, port);
    expect((await providerCallStage.execute(paidCtx('mpp'))).ok).toBe(false);
    expect(port.m).not.toHaveBeenCalled();
  });

  it('parses merged WWW-Authenticate values and quoted commas', () => {
    const h = `Bearer realm="x", ${mppHeader({}, 'a')}, ${mppHeader({ amount: '5' }, 'b')}`;
    const all = parseMppChallenges(h);
    expect(all.map((c) => [c.id, c.amount, c.chainId])).toEqual([
      ['a', '2000', 4217],
      ['b', '5', 4217],
    ]);
  });

  it('no prior buyer payment -> refused, nothing fetched or signed', async () => {
    const port = fakePort();
    const s = fetchStub({ 'payment-required': x402Header([accept()]) });
    const a = useAdapter('x402', s.f, port);
    const ctx = paidCtx('x402');
    ctx.x402Paid = false;
    const r = await providerCallStage.execute(ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.error).toBe('tool_unavailable');
    await expect(a.call({ toolId: TOOL, params: {}, requestId: 'r' })).rejects.toMatchObject({
      code: 'upstream_buyer_payment_required',
    });
    expect(s.calls).toHaveLength(0);
    expect(port.x).not.toHaveBeenCalled();
  });
});

describe('upstream failure: x402 buyer never settled, MPP buyer refunded', () => {
  function stubAllButProviderCall() {
    for (const st of PIPELINE_STAGES) {
      if (st.name === 'PROVIDER_CALL') continue;
      jest.spyOn(st, 'execute').mockImplementation(async (c) => ok(c));
    }
  }
  afterEach(() => jest.restoreAllMocks());

  it('x402: upstream 500 after paying -> pipeline stops at PROVIDER_CALL, no settle, loss counted', async () => {
    stubAllButProviderCall();
    const finalize = PIPELINE_STAGES.find((s) => s.name === 'ESCROW_FINALIZE')!;
    const s = fetchStub(
      { 'payment-required': x402Header([accept()]) },
      {
        status: 500,
        headers: {
          'payment-response': Buffer.from(
            JSON.stringify({ success: true, transaction: TX }),
          ).toString('base64'),
        },
      },
    );
    useAdapter('x402', s.f, fakePort());
    const r = await runPipeline(paidCtx('x402'));
    expect(r.ok).toBe(false);
    expect(finalize.execute).not.toHaveBeenCalled();
    expect(mockSettle).not.toHaveBeenCalled();
    expect(mockRefund).not.toHaveBeenCalled();
    expect(JSON.stringify(logged)).toContain('upstream_loss');
  });

  it('mpp: upstream 500 -> refund row with reason upstream_failed:<code> and the loss in the note', async () => {
    stubAllButProviderCall();
    const s = fetchStub({ 'www-authenticate': mppHeader() }, { status: 500 });
    useAdapter('mpp', s.f, fakePort());
    const r = await runPipeline(paidCtx('mpp'));
    expect(r.ok).toBe(false);
    expect(mockRefund).toHaveBeenCalledTimes(1);
    const row = (mockRefund.mock.calls[0] as unknown[])[0] as Record<string, any>;
    expect(row.reason).toBe('upstream_failed:provider_unavailable');
    expect(row.rail).toBe('tempo');
    expect(row.note).toMatchObject({
      tool_id: TOOL,
      upstream_result: 'loss',
      upstream_loss: 0.002,
    });
  });

  it('mpp: a refused challenge also books the refund (nothing paid upstream)', async () => {
    stubAllButProviderCall();
    const s = fetchStub({ 'www-authenticate': mppHeader({ amount: '9999' }) });
    useAdapter('mpp', s.f, fakePort());
    await runPipeline(paidCtx('mpp'));
    const row = (mockRefund.mock.calls[0] as unknown[])[0] as Record<string, any>;
    expect(row.reason).toBe('upstream_failed:upstream_price_exceeded');
    expect(row.note.upstream_loss).toBeUndefined();
  });
});

describe('gates: daily cap and balance', () => {
  const g = {
    provider: 'upmock',
    rail: 'x402' as const,
    chainId: 8453,
    asset: USDC,
    maxPriceMicro: 2000,
  };

  it('balance below 2 x max price -> refused; unreadable -> refused', async () => {
    setBalanceReader(async () => 0.0039);
    expect((await upstreamGate(g))?.reason).toBe('upstream_payer_balance_low');
    setBalanceReader(async () => 0.004);
    expect(await upstreamGate(g)).toBeNull();
    setBalanceReader(async () => {
      throw new Error('rpc down');
    });
    expect((await upstreamGate(g))?.reason).toBe('upstream_payer_balance_unknown');
  });

  it('daily cap: reserve is atomic and refuses past the cap; gate answers until midnight', async () => {
    E.UPSTREAM_DAILY_CAP_USD_PER_PROVIDER = '0.005';
    expect(await reserveDailySpend('upmock', 2000)).toBe(true);
    expect(await reserveDailySpend('upmock', 2000)).toBe(true);
    expect(await reserveDailySpend('upmock', 2000)).toBe(false);
    const r = await upstreamGate(g);
    expect(r?.reason).toBe('upstream_daily_cap_reached');
    expect(r!.retryAfter).toBeGreaterThanOrEqual(60);
  });

  it('cap reached mid-call -> no signing', async () => {
    E.UPSTREAM_DAILY_CAP_USD_PER_PROVIDER = '0.003';
    const port = fakePort();
    const s = fetchStub({ 'payment-required': x402Header([accept()]) });
    useAdapter('x402', s.f, port);
    expect((await providerCallStage.execute(paidCtx('x402'))).ok).toBe(true);
    const s2 = fetchStub({ 'payment-required': x402Header([accept()]) });
    useAdapter('x402', s2.f, port);
    const r = await providerCallStage.execute(paidCtx('x402'));
    expect(r.ok).toBe(false);
    expect(port.x).toHaveBeenCalledTimes(1);
  });

  it('key absent or equal to a forbidden wallet -> gate refuses', async () => {
    delete E.UPSTREAM_PAYER_KEY_BASE;
    writeRecord([]); // no key and no record entry = missing (a record entry without the key = mismatch)
    expect((await upstreamGate(g))?.reason).toBe('upstream_payer_key_missing');
    writeRecord(['UPSTREAM_PAYER_KEY_BASE', 'UPSTREAM_PAYER_KEY_TEMPO']);
    E.UPSTREAM_PAYER_KEY_BASE = TEST_KEY;
    E.X402_PAYMENT_ADDRESS = PAYER;
    expect(payerState('x402').reason).toBe('address_equals_operator_revenue_or_refund');
    expect((await upstreamGate(g))?.reason).toBe('upstream_payer_key_mismatch');
    delete E.X402_PAYMENT_ADDRESS;
    E.REFUND_SIGNER_KEY_BASE = TEST_KEY;
    expect(payerState('x402').state).toBe('mismatch');
    delete E.REFUND_SIGNER_KEY_BASE;
    expect(payerState('x402')).toMatchObject({ state: 'ok', address: PAYER.toLowerCase() });
  });

  it('key without a record entry -> mismatch record_missing, and no file is created', () => {
    writeRecord([]);
    const before = readdirSync(RECORD_DIR).sort();
    expect(payerState('x402')).toMatchObject({
      state: 'mismatch',
      reason: 'record_missing',
      address: PAYER.toLowerCase(),
    });
    expect(readdirSync(RECORD_DIR).sort()).toEqual(before);
  });
});

describe('receipt carries upstream_tx', () => {
  it('additive allow-listed key, only when a tx is known', () => {
    expect(RECEIPT_ALLOWED_KEYS).toContain('upstream_tx');
    const ctx = paidCtx('mpp');
    ctx.billingStatus = 'PAID';
    ctx.finalCost = 0.003;
    ctx.mppRecipient = '0x' + '33'.repeat(20);
    const inp = {
      receiptId: 'a'.repeat(32),
      issuedAt: new Date(),
      responseText: 'x',
      x402Payee: '',
      x402ChainId: 8453,
      mppPayee: '',
      mppChainId: 4217,
    };
    expect(buildReceiptBody(ctx, inp)?.upstream_tx).toBeUndefined();
    ctx.upstreamTx = TX.toUpperCase().replace('0X', '0x');
    expect(buildReceiptBody(ctx, inp)?.upstream_tx).toBe(TX);
  });
});

describe('sandbox end to end: local x402 402 mock, real EIP-3009 signature', () => {
  it('pays once with a valid authorization from the payer to payTo, delivers, no key in logs', async () => {
    let paidHeader = '';
    const srv = createServer((req: IncomingMessage, res: ServerResponse) => {
      const sig = req.headers['payment-signature'];
      if (typeof sig !== 'string') {
        res.writeHead(402, {
          'content-type': 'application/json',
          'payment-required': x402Header([accept()]),
        });
        res.end('{}');
        return;
      }
      paidHeader = sig;
      res.writeHead(200, {
        'content-type': 'application/json',
        'payment-response': Buffer.from(
          JSON.stringify({ success: true, transaction: TX }),
        ).toString('base64'),
      });
      res.end(JSON.stringify({ url: 'https://example.com/', content_markdown: '# Example' }));
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
    const port = (srv.address() as AddressInfo).port;
    try {
      useAdapter(
        'x402',
        (...a) => fetch(...a),
        realPayerPort,
        `http://127.0.0.1:${port}/read/v1/page`,
      );
      const ctx = paidCtx('x402');
      const r = await providerCallStage.execute(ctx);
      expect(r.ok).toBe(true);
      expect((ctx.providerResponse?.data as { content_markdown: string }).content_markdown).toBe(
        '# Example',
      );
      expect(ctx.upstreamCostUsd).toBe(0.002);
      expect(ctx.upstreamTx).toBe(TX);

      const p = JSON.parse(Buffer.from(paidHeader, 'base64').toString('utf8'));
      const auth = p.payload.authorization;
      expect(auth.from.toLowerCase()).toBe(PAYER.toLowerCase());
      expect(auth.to.toLowerCase()).toBe(PAY_TO.toLowerCase());
      expect(String(auth.value)).toBe('2000');
      const valid = await verifyTypedData({
        address: PAYER,
        domain: { name: 'USD Coin', version: '2', chainId: 8453, verifyingContract: USDC },
        types: {
          TransferWithAuthorization: [
            { name: 'from', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'validAfter', type: 'uint256' },
            { name: 'validBefore', type: 'uint256' },
            { name: 'nonce', type: 'bytes32' },
          ],
        },
        primaryType: 'TransferWithAuthorization',
        message: {
          from: auth.from,
          to: auth.to,
          value: BigInt(auth.value),
          validAfter: BigInt(auth.validAfter),
          validBefore: BigInt(auth.validBefore),
          nonce: auth.nonce,
        },
        signature: p.payload.signature,
      });
      expect(valid).toBe(true);
    } finally {
      srv.close();
    }
    // Every log line of this whole file (payer state, losses, gates, the signed call).
    const all = JSON.stringify(everLogged).toLowerCase();
    expect(all).not.toContain(TEST_KEY.slice(2).toLowerCase());
    expect(all).toContain(PAYER.toLowerCase());
  });
});

describe('T-0758: per-tool listed/max price and per-provider daily cap', () => {
  const CHEAP = 'upmock.read';
  const DEAR = 'upmock.deep';
  const URL = 'https://up.example/read';
  function twoToolBlock(extra: Partial<UpstreamPayConfig> = {}): UpstreamPayConfig {
    return {
      ...cfgFor('x402', URL),
      listed_price_usd: '0.30',
      max_price_usd: '0.30',
      tools: {
        [CHEAP]: { method: 'GET', url: URL },
        [DEAR]: { method: 'GET', url: URL, listed_price_usd: '2.50', max_price_usd: '2.50' },
      },
      ...extra,
    };
  }
  const yamlTools = [
    { tool_id: CHEAP, provider: 'upmock', price_usd: '0.390' },
    { tool_id: DEAR, provider: 'upmock', price_usd: '3.250' },
  ];
  const ctxFor = (toolId: string): PipelineContext => {
    const ctx = paidCtx('x402');
    ctx.toolId = toolId;
    return ctx;
  };

  it('a 2.50 challenge on the 0.30 tool is refused upstream_price_exceeded, nothing signed', async () => {
    const port = fakePort();
    const s = fetchStub({ 'payment-required': x402Header([accept({ amount: '2500000' })]) });
    setUpstreamConfig(new Map([['upmock', twoToolBlock()]]));
    mockResolve.mockReturnValue(new Upstream402Adapter('upmock', port, s.f));
    const r = await providerCallStage.execute(ctxFor(CHEAP));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.error).toBe('upstream_price_exceeded');
    expect(port.x).not.toHaveBeenCalled();
    // The same challenge on the 2.50 tool is paid.
    const s2 = fetchStub({ 'payment-required': x402Header([accept({ amount: '2500000' })]) });
    mockResolve.mockReturnValue(new Upstream402Adapter('upmock', port, s2.f));
    expect((await providerCallStage.execute(ctxFor(DEAR))).ok).toBe(true);
    expect(port.x).toHaveBeenCalledTimes(1);
  });

  it("the gate's balance and cap checks use the tool's max", async () => {
    setUpstreamConfig(new Map([['upmock', twoToolBlock()]]));
    E.UPSTREAM_DAILY_CAP_USD_PER_PROVIDER = '5';
    setBalanceReader(async () => 1); // 2 x 0.30 fits, 2 x 2.50 does not
    expect(await upstreamGateForTool(CHEAP)).toBeNull();
    expect((await upstreamGateForTool(DEAR))?.reason).toBe('upstream_payer_balance_low');
    setBalanceReader(async () => 100);
    store.m.set(spendKey('upmock'), 4_000_000); // 4.00 spent: 0.30 fits under 5, 2.50 does not
    expect(await upstreamGateForTool(CHEAP)).toBeNull();
    expect((await upstreamGateForTool(DEAR))?.reason).toBe('upstream_daily_cap_reached');
  });

  it('block daily_cap_usd 10 admits a call the env cap 5 refuses; a block cap below env refuses earlier', async () => {
    E.UPSTREAM_DAILY_CAP_USD_PER_PROVIDER = '5';
    setBalanceReader(async () => 100);
    store.m.set(spendKey('upmock'), 4_000_000);
    setUpstreamConfig(new Map([['upmock', twoToolBlock()]]));
    expect((await upstreamGateForTool(DEAR))?.reason).toBe('upstream_daily_cap_reached');
    expect(await reserveDailySpend('upmock', 2_500_000)).toBe(false);
    setUpstreamConfig(new Map([['upmock', twoToolBlock({ daily_cap_usd: '10' })]]));
    expect(await upstreamGateForTool(DEAR)).toBeNull();
    const port = fakePort();
    const s = fetchStub({ 'payment-required': x402Header([accept({ amount: '2500000' })]) });
    mockResolve.mockReturnValue(new Upstream402Adapter('upmock', port, s.f));
    expect((await providerCallStage.execute(ctxFor(DEAR))).ok).toBe(true);
    expect(store.m.get(spendKey('upmock'))).toBe(6_500_000);

    store.m.set(spendKey('upmock'), 0);
    setUpstreamConfig(new Map([['upmock', twoToolBlock({ daily_cap_usd: '0.5' })]]));
    expect(await upstreamGateForTool(CHEAP)).toBeNull();
    expect((await upstreamGateForTool(DEAR))?.reason).toBe('upstream_daily_cap_reached');
    const port2 = fakePort();
    const s2 = fetchStub({ 'payment-required': x402Header([accept({ amount: '300000' })]) });
    mockResolve.mockReturnValue(new Upstream402Adapter('upmock', port2, s2.f));
    expect((await providerCallStage.execute(ctxFor(CHEAP))).ok).toBe(true);
    const s3 = fetchStub({ 'payment-required': x402Header([accept({ amount: '300000' })]) });
    mockResolve.mockReturnValue(new Upstream402Adapter('upmock', port2, s3.f));
    expect((await providerCallStage.execute(ctxFor(CHEAP))).ok).toBe(false); // 0.60 > 0.50 < env 5
    expect(port2.x).toHaveBeenCalledTimes(1);
  });

  it('parse: per-tool pair, daily_cap_usd bounds, price >= tool max and >= max x margin', () => {
    const block = twoToolBlock();
    const parse1 = (b: unknown, tools = yamlTools) =>
      parseUpstreamConfig({ tools, upstream_pay: { upmock: b } });
    expect(() => parse1(block)).not.toThrow();
    expect(() => parse1({ ...block, daily_cap_usd: '25' })).not.toThrow();
    expect(() => parse1({ ...block, daily_cap_usd: '26' })).toThrow();
    expect(() => parse1({ ...block, daily_cap_usd: '0' })).toThrow();
    const withTool = (t: Record<string, unknown>) => ({
      ...block,
      tools: { ...block.tools, [DEAR]: { method: 'GET', url: URL, ...t } },
    });
    expect(() => parse1(withTool({ listed_price_usd: '2.50' }))).toThrow(/both or neither/);
    expect(() => parse1(withTool({ max_price_usd: '2.50' }))).toThrow(/both or neither/);
    expect(() => parse1(withTool({ listed_price_usd: '2.50', max_price_usd: '2.40' }))).toThrow(
      /below listed_price_usd/,
    );
    // price below the tool's own max
    const low = [yamlTools[0], { ...yamlTools[1], price_usd: '2.49' }];
    expect(() => parse1(block, low)).toThrow(/price_usd below max_price_usd/);
    // price >= max but below max x 1.3 (the 20 % markup price 3.000 for listed 2.50)
    const under = [yamlTools[0], { ...yamlTools[1], price_usd: '3.000' }];
    expect(() => parse1(block, under)).toThrow(/below max x margin/);
    const cheapUnder = [{ ...yamlTools[0], price_usd: '0.360' }, yamlTools[1]];
    expect(() => parse1(block, cheapUnder)).toThrow(/upmock.read price_usd below max x margin/);
  });
});
