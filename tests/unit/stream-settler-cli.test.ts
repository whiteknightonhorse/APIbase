/**
 * T-INT-46 MS5: the `packages/stream-settler` CLI against a mocked APIbase (HTTP) and a mocked
 * mppx chain: a queue of 2 items -> 2 on-chain calls by the account from the merchant's env, 2
 * `POST .../settled`; the key is in no log line and in no request.
 */
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  loadKey,
  mppxChainOps,
  parseArgs,
  redactingLog,
  runPass,
  type QueueItem,
} from '../../packages/stream-settler/src/settler';

const calls = {
  settle: jest.fn(async (..._a: unknown[]) => `0x${'11'.repeat(32)}`),
  close: jest.fn(async (..._a: unknown[]) => `0x${'22'.repeat(32)}`),
};
jest.mock('mppx/tempo', () => ({
  Session: {
    Chain: {
      settleOnChain: (...a: unknown[]) => calls.settle(...a),
      closeOnChain: (...a: unknown[]) => calls.close(...a),
    },
  },
}));
jest.mock('viem', () => ({
  ...jest.requireActual('viem'),
  createClient: jest.fn(() => ({ chain: { id: 42431 } })),
  http: jest.fn(() => ({})),
}));

const KEY = generatePrivateKey();
const MK = 'mk_live_' + 'a'.repeat(32);
const item = (n: number, action: 'settle' | 'close'): QueueItem => ({
  channel_id: `0x${String(n).repeat(64)}`,
  escrow_contract: '0xescrow',
  chain_id: 42431,
  cumulative_amount: '600000',
  signature: '0xsig',
  action,
});

describe('MS5: apibase-stream-settler', () => {
  it('2 queue items -> 2 on-chain calls by the env account, 2 POST settled; the key is never logged or sent', async () => {
    const env = { MERCHANT_TEMPO_KEY: KEY } as NodeJS.ProcessEnv;
    const args = parseArgs(
      [
        '--key-env',
        'MERCHANT_TEMPO_KEY',
        '--api',
        'https://apibase.test/',
        '--mk',
        MK,
        '--interval',
        '60',
      ],
      env,
    );
    const account = privateKeyToAccount(loadKey(args, env));
    const lines: string[] = [];
    const log = redactingLog([KEY, MK], (l) => lines.push(l));
    log(`settler account ${account.address} (key length ${KEY.length})`);

    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const queue = [item(1, 'settle'), item(2, 'close')];
    const fetchMock = async (url: string, init?: RequestInit) => {
      requests.push({ url, init });
      if (url.endsWith('/settle-queue')) return new Response(JSON.stringify({ queue }));
      return new Response(JSON.stringify({ verified: true }));
    };
    const r = await runPass({
      api: args.api,
      mk: args.mk,
      account,
      chain: mppxChainOps(),
      fetch: fetchMock,
      log,
    });

    expect(r).toEqual({ done: 2, failed: 0 });
    expect(calls.settle).toHaveBeenCalledTimes(1);
    expect(calls.close).toHaveBeenCalledTimes(1);
    for (const c of [calls.settle.mock.calls[0], calls.close.mock.calls[0]]) {
      expect((c[3] as { account: { address: string } }).account.address).toBe(account.address);
    }
    const posts = requests.filter((q) => q.init?.method === 'POST');
    expect(posts.map((p) => p.url)).toEqual([
      `https://apibase.test/api/v1/shop/merchants/me/streams/${queue[0].channel_id}/settled`,
      `https://apibase.test/api/v1/shop/merchants/me/streams/${queue[1].channel_id}/settled`,
    ]);
    expect(JSON.parse(String(posts[0].init?.body))).toEqual({ tx_hash: `0x${'11'.repeat(32)}` });
    expect(JSON.parse(String(posts[1].init?.body))).toEqual({ tx_hash: `0x${'22'.repeat(32)}` });
    // the key appears in no request and in no log line; the address and the key length do
    const wire = JSON.stringify(requests);
    expect(wire).not.toContain(KEY);
    expect(wire).not.toContain(KEY.slice(2));
    expect(lines.join('\n')).not.toContain(KEY);
    expect(lines.join('\n')).toContain(account.address);
    expect(lines.join('\n')).toContain(String(KEY.length));
  });

  it('a failing chain call is logged without the key, nothing is reported, the next item still runs', async () => {
    const account = privateKeyToAccount(KEY);
    const lines: string[] = [];
    const log = redactingLog([KEY, MK], (l) => lines.push(l));
    calls.settle.mockRejectedValueOnce(new Error(`boom with ${KEY}`));
    const requests: string[] = [];
    const r = await runPass({
      api: 'https://apibase.test',
      mk: MK,
      account,
      chain: mppxChainOps(),
      fetch: async (url, init) => {
        if (init?.method === 'POST') requests.push(url);
        return new Response(JSON.stringify({ queue: [item(3, 'settle'), item(4, 'settle')] }));
      },
      log,
    });
    expect(r).toEqual({ done: 1, failed: 1 });
    expect(requests).toHaveLength(1);
    expect(lines.join('\n')).not.toContain(KEY);
    expect(lines.join('\n')).toContain('[redacted]');
  });

  it('the key comes only from the merchant env var or file, and must be a 32-byte hex key', () => {
    expect(() => loadKey({ keyEnv: 'NOPE' }, {} as NodeJS.ProcessEnv)).toThrow(/settler key/);
    expect(() => loadKey({ keyEnv: 'K' }, { K: '0x12' } as NodeJS.ProcessEnv)).toThrow();
    expect(loadKey({ keyFile: '/x' }, {} as NodeJS.ProcessEnv, () => `${KEY}\n`)).toBe(KEY);
  });
});
