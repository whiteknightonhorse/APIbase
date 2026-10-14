/**
 * T-SHOP-B: every MPP challenge carries an explicit chainId (mppx defaults to Tempo mainnet 4217
 * when none is passed), a testnet config can never issue a non-testnet challenge, and the
 * Payment-Receipt header reaches the client. Challenges are built by the REAL mppx/server in a
 * tsx child (ESM-only); the guard and the receipt tests mock config, logger, Redis and mppx.
 */
import { execFileSync } from 'child_process';
import path from 'path';

const TESTNET_USD = '0x20c0000000000000000000000000000000000000';
const MAINNET_USD = '0x20C000000000000000000000b9537d11c60E8b50';

const mockCfg = jest.fn();
jest.mock('../../src/config/mpp.config', () => ({ getMppConfig: () => mockCfg() }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/pipeline/stages/tool-status.stage', () => ({ getToolPriceUsd: () => 0.25 }));
jest.mock('../../src/services/redis.service', () => ({
  getSharedRedis: () => ({ get: jest.fn(), set: jest.fn(), del: jest.fn(), eval: jest.fn() }),
}));

type Mw = typeof import('../../src/middleware/mpp.middleware');

const TEST_KEY = `0x${'11'.repeat(32)}`;
const WALLET = '0x00000000000000000000000000000000000a11ce';

function cfg(testnet: boolean, chainId: number = testnet ? 42431 : 4217) {
  return {
    enabled: true,
    testnet,
    chainId,
    usdcAddress: testnet ? TESTNET_USD : MAINNET_USD,
    privateKey: TEST_KEY,
    walletAddress: WALLET,
    secretKey: 's'.repeat(32),
    realm: 'test.local',
    rpcUrl: 'http://rpc.invalid',
  };
}

function load(): Mw {
  let mod!: Mw;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('../../src/middleware/mpp.middleware');
  });
  return mod;
}

const URL_ = 'https://sandbox.test/api/v1/shop/quotes/x/pay';
const root = path.resolve(__dirname, '../..');

/** The REAL mppx/server runs in a tsx child (ESM-only); returns the decoded challenge request. */
function challengeFor(testnet: boolean): { request: any; header: string } {
  const out = execFileSync(
    path.join(root, 'node_modules/.bin/tsx'),
    [path.join(__dirname, 'helpers/mpp-chain-id.child.ts'), String(testnet)],
    { cwd: root, encoding: 'utf8', timeout: 90000, stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const r = JSON.parse(out.split('RESULT')[1]);
  expect(r.crashed).toBeUndefined();
  return r;
}

describe('MPP challenge chainId (T-SHOP-B)', () => {
  it('testnet: challenge decodes to chainId 42431 and pathUSD', () => {
    const { request } = challengeFor(true);
    expect(request.methodDetails.chainId).toBe(42431);
    expect(request.currency.toLowerCase()).toBe(TESTNET_USD);
  }, 100000);

  it('mainnet: challenge decodes to chainId 4217 and the mainnet USDC', () => {
    const { request } = challengeFor(false);
    expect(request.methodDetails.chainId).toBe(4217);
    expect(request.currency.toLowerCase()).toBe(MAINNET_USD.toLowerCase());
  }, 100000);

  it('fail closed: testnet with a non-testnet chainId throws 503 before any challenge', async () => {
    mockCfg.mockReturnValue(cfg(true, 4217));
    const mw = load();
    expect(() => mw.assertChallengeChainId(cfg(true, 4217))).toThrow(
      expect.objectContaining({ message: 'MPP chain configuration invalid' }),
    );
    await expect(mw.buildMppChallengeHeader('t', 1, URL_)).rejects.toMatchObject({
      message: 'MPP chain configuration invalid',
    });
    expect(mw.assertChallengeChainId(cfg(true))).toBe(42431);
    expect(mw.assertChallengeChainId(cfg(false))).toBe(4217);
  });
});

describe('Payment-Receipt header (T-SHOP-B)', () => {
  it('is set on the response exactly as mppx produced it', async () => {
    mockCfg.mockReturnValue(cfg(true));
    const RECEIPT = 'eyJzdGF0dXMiOiJzdWNjZXNzIn0';
    let mw!: Mw;
    jest.isolateModules(() => {
      jest.doMock('mppx/server', () => ({
        Store: { redis: () => ({ update: () => undefined }) },
        Mppx: {
          create: () => ({
            charge: () => async () => ({
              status: 200,
              withReceipt: (r: globalThis.Response) => {
                const out = new globalThis.Response(r.body, { status: 200 });
                out.headers.set('Payment-Receipt', RECEIPT);
                return out;
              },
            }),
          }),
        },
        tempo: { charge: () => ({}), sessionLegacy: () => ({}) },
      }));
      jest.doMock('mppx', () => ({ Receipt: { fromResponse: () => ({ reference: 'none' }) } }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mw = require('../../src/middleware/mpp.middleware');
    });
    const headers: Record<string, string> = {};
    const req = {
      headers: { authorization: 'Payment cred' },
      originalUrl: '/api/v1/tools/known.tool/call',
      method: 'POST',
      body: {},
      get: () => 'test.local',
      requestId: 'r1',
    };
    const res = { setHeader: (k: string, v: string) => void (headers[k] = v) };
    const err = await new Promise((resolve) =>
      mw.mppMiddleware(req as never, res as never, (e?: unknown) => resolve(e)),
    );
    expect(err).toBeUndefined();
    expect(headers['Payment-Receipt']).toBe(RECEIPT);
  });
});
