/**
 * T-INT-49 TK6: the `packages/merchant-renewer` CLI against a mocked APIbase (HTTP) and a mocked
 * viem/tempo: a queue of 1 -> 2 `transferWithMemo` calls (merchant leg + fee leg) by the account
 * made from the env key with `access: payer`, 1 `POST renewed`; the key is in no log line and in
 * no request. `init` writes the key to a 0600 file and returns only the address.
 */
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  initKey,
  legsOf,
  loadKey,
  parseArgs,
  redactingLog,
  runPass,
  viemChainOps,
  type QueueItem,
} from '../../packages/merchant-renewer/src/renewer';

const calls = {
  account: jest.fn((..._a: unknown[]) => ({ address: '0xaccount' })),
  transfer: jest.fn(async (..._a: unknown[]) => ({ receipt: { transactionHash: '0x00' } })),
};
jest.mock('viem/tempo', () => ({
  Account: { fromSecp256k1: (...a: unknown[]) => calls.account(...a) },
  Actions: { token: { transferSync: (...a: unknown[]) => calls.transfer(...a) } },
}));
jest.mock('viem', () => ({
  ...jest.requireActual('viem'),
  createClient: jest.fn(() => ({ chain: { id: 4217 } })),
  http: jest.fn(() => ({})),
}));

const KEY = generatePrivateKey();
const MK = 'mk_live_' + 'a'.repeat(32);
const PAYER = '0x00000000000000000000000000000000000a11ce';
const PAYOUT = '0x00000000000000000000000000000000000c0c0c';
const FEE_WALLET = '0x00000000000000000000000000000000000fee00';
const TOKEN = '0x20C000000000000000000000b9537d11c60E8b50';
const item = (splits?: QueueItem['splits']): QueueItem => ({
  subscription_id: '11111111-2222-3333-4444-555555555555',
  period_no: 2,
  payer: PAYER,
  amount: '5000000',
  memo: `0x${'ab'.repeat(32)}`,
  recipient: PAYOUT,
  token: TOKEN,
  ...(splits ? { splits } : {}),
});

describe('TK6: apibase-merchant-renewer', () => {
  beforeEach(() => {
    calls.account.mockClear();
    calls.transfer.mockClear();
    let i = 0;
    calls.transfer.mockImplementation(async () => ({
      receipt: { transactionHash: `0x${String(++i).repeat(64)}` },
    }));
  });

  it('a queue of 1 (fee on) -> 2 transfers with the env key, 1 POST renewed; the key is never logged or sent', async () => {
    const env = { MERCHANT_RENEWER_KEY: KEY } as NodeJS.ProcessEnv;
    const args = parseArgs(
      [
        'run',
        '--key-env',
        'MERCHANT_RENEWER_KEY',
        '--api',
        'https://apibase.test/',
        '--mk',
        MK,
        '--interval',
        '60',
      ],
      env,
    );
    const key = loadKey(args, env);
    const lines: string[] = [];
    const log = redactingLog([KEY, MK], (l) => lines.push(l));
    log(`renewer key ${privateKeyToAccount(key).address} (key length ${KEY.length})`);

    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const queue = [item([{ wallet: FEE_WALLET, amount: '80000' }])];
    const fetchMock = async (url: string, init?: RequestInit) => {
      requests.push({ url, init });
      if (url.endsWith('/renew-queue')) return new Response(JSON.stringify({ queue }));
      return new Response(JSON.stringify({ status: 'paid' }));
    };
    const r = await runPass({
      api: args.api,
      mk: args.mk,
      key,
      chain: viemChainOps(),
      fetch: fetchMock,
      log,
    });

    expect(r).toEqual({ done: 1, failed: 0 });
    expect(calls.transfer).toHaveBeenCalledTimes(2);
    const sent = calls.transfer.mock.calls.map((c) => c[1] as Record<string, unknown>);
    expect(sent).toMatchObject([
      { token: TOKEN, to: PAYOUT, amount: 4_920_000n, memo: queue[0].memo },
      { token: TOKEN, to: FEE_WALLET, amount: 80_000n, memo: queue[0].memo },
    ]);
    // the spending account is the payer's, signed by the key from the env
    expect(calls.account).toHaveBeenCalledWith(KEY, { access: PAYER });
    const posts = requests.filter((q) => q.init?.method === 'POST');
    expect(posts.map((p) => p.url)).toEqual([
      `https://apibase.test/api/v1/shop/merchants/me/subscriptions/${queue[0].subscription_id}/renewed`,
    ]);
    expect(JSON.parse(String(posts[0].init?.body))).toEqual({
      period_no: 2,
      tx_hashes: [`0x${'1'.repeat(64)}`, `0x${'2'.repeat(64)}`],
    });
    // the key appears in no request and in no log line; the address and the key length do
    const wire = JSON.stringify(requests);
    expect(wire).not.toContain(KEY);
    expect(wire).not.toContain(KEY.slice(2));
    expect(lines.join('\n')).not.toContain(KEY);
    expect(lines.join('\n')).toContain(privateKeyToAccount(KEY).address);
  });

  it('fee off -> one transfer of the whole price; a failing transfer is logged without the key and not reported', async () => {
    const lines: string[] = [];
    const log = redactingLog([KEY, MK], (l) => lines.push(l));
    calls.transfer.mockRejectedValueOnce(new Error(`SpendingLimitExceeded with ${KEY}`));
    const posts: string[] = [];
    const run = (q: QueueItem[]) =>
      runPass({
        api: 'https://apibase.test',
        mk: MK,
        key: KEY,
        chain: viemChainOps(),
        fetch: async (url, init) => {
          if (init?.method === 'POST') posts.push(url);
          return new Response(JSON.stringify({ queue: q }));
        },
        log,
      });
    expect(await run([item()])).toEqual({ done: 0, failed: 1 });
    expect(posts).toHaveLength(0);
    expect(lines.join('\n')).not.toContain(KEY);
    expect(lines.join('\n')).toContain('[redacted]');
    expect(await run([item()])).toEqual({ done: 1, failed: 0 });
    expect(calls.transfer).toHaveBeenCalledTimes(2); // 1 failed + 1 sent
    expect(posts).toHaveLength(1);
  });

  it('an empty queue signs nothing; a fee that swallows the price is refused before any transfer', async () => {
    const r = await runPass({
      api: 'https://apibase.test',
      mk: MK,
      key: KEY,
      chain: viemChainOps(),
      fetch: async () => new Response(JSON.stringify({ queue: [] })),
      log: () => undefined,
    });
    expect(r).toEqual({ done: 0, failed: 0 });
    expect(calls.transfer).not.toHaveBeenCalled();
    expect(() => legsOf(item([{ wallet: FEE_WALLET, amount: '5000000' }]))).toThrow(/fee/);
  });

  it('init writes the key to a 0600 file that is never overwritten and returns only the address', () => {
    const written: Array<{ path: string; data: string; opts: { mode: number; flag: string } }> = [];
    const key = generatePrivateKey();
    const address = privateKeyToAccount(key).address;
    const r = initKey(
      '/tmp/apibase-renewer.key',
      () => ({ key, address }),
      (path, data, opts) => {
        written.push({ path, data, opts });
      },
    );
    expect(r).toEqual({ address, file: '/tmp/apibase-renewer.key' });
    expect(JSON.stringify(r)).not.toContain(key);
    expect(written).toEqual([
      { path: '/tmp/apibase-renewer.key', data: `${key}\n`, opts: { mode: 0o600, flag: 'wx' } },
    ]);
  });

  it('the key comes only from the merchant env var or file, and must be a 32-byte hex key', () => {
    expect(() => loadKey({ keyEnv: 'NOPE' }, {} as NodeJS.ProcessEnv)).toThrow(/renewer key/);
    expect(() => loadKey({ keyEnv: 'K' }, { K: '0x12' } as NodeJS.ProcessEnv)).toThrow();
    expect(loadKey({ keyFile: '/x' }, {} as NodeJS.ProcessEnv, () => `${KEY}\n`)).toBe(KEY);
    expect(() => parseArgs(['run'], {} as NodeJS.ProcessEnv)).toThrow(/--mk/);
  });
});
