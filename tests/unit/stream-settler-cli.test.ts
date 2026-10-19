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
  type PendingMap,
  type QueueItem,
} from '../../packages/stream-settler/src/settler';

const calls = {
  settle: jest.fn(async (..._a: unknown[]) => `0x${'11'.repeat(32)}`),
  close: jest.fn(async (..._a: unknown[]) => `0x${'22'.repeat(32)}`),
  receipt: jest.fn(
    async (..._a: unknown[]): Promise<{ status: string }> => ({ status: 'success' }),
  ),
};
const onChain = { finalized: false };
jest.mock('mppx-legacy/tempo', () => ({
  SessionLegacy: {
    Session: {
      Chain: {
        settleOnChain: (...a: unknown[]) => calls.settle(...a),
        closeOnChain: (...a: unknown[]) => calls.close(...a),
        getOnChainChannel: async () => ({ finalized: onChain.finalized }),
      },
    },
  },
}));
jest.mock('viem/actions', () => ({
  waitForTransactionReceipt: (...a: unknown[]) => calls.receipt(...a),
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

  it('settled answering HTTP 400 -> failed, the error body is logged, the key is not', async () => {
    const lines: string[] = [];
    const log = redactingLog([KEY, MK], (l) => lines.push(l));
    const fetchMock = async (url: string) =>
      url.endsWith('/settle-queue')
        ? new Response(JSON.stringify({ queue: [item(1, 'settle')] }))
        : new Response('{"error_code":"settle_not_proven","reject_reason":"x"}', { status: 400 });
    const r = await runPass({
      api: 'https://apibase.test',
      mk: MK,
      account: privateKeyToAccount(KEY),
      chain: mppxChainOps(),
      fetch: fetchMock,
      log,
    });
    expect(r).toEqual({ done: 0, failed: 1 });
    const line = lines.find((l) => l.includes('HTTP 400')) ?? '';
    expect(line).toContain('settle_not_proven');
    expect(line).toContain('"reject_reason":"x"');
    expect(line).not.toContain(KEY);
  });

  it('a close of a channel already finalized on-chain -> no chain call, failed, logged', async () => {
    onChain.finalized = true;
    calls.close.mockClear();
    try {
      const lines: string[] = [];
      const fetchMock = async (url: string) =>
        url.endsWith('/settle-queue')
          ? new Response(JSON.stringify({ queue: [item(2, 'close')] }))
          : new Response('{}');
      const r = await runPass({
        api: 'https://apibase.test',
        mk: MK,
        account: privateKeyToAccount(KEY),
        chain: mppxChainOps(),
        fetch: fetchMock,
        log: (l) => lines.push(l),
      });
      expect(r).toEqual({ done: 0, failed: 1 });
      expect(calls.close).not.toHaveBeenCalled();
      expect(lines.join('\n')).toContain('already finalized');
    } finally {
      onChain.finalized = false;
    }
  });

  describe('receipt wait, report retries, pending hash', () => {
    const UNCONFIRMED =
      '{"error_code":"settle_not_proven","reject_reason":"tx_not_found_or_unconfirmed"}';
    const setup = (queue: QueueItem[], settled: () => Response) => {
      const posts: Array<{ url: string; body: string }> = [];
      const sleeps: number[] = [];
      const lines: string[] = [];
      const pending: PendingMap = new Map();
      const fetchMock = async (url: string, init?: RequestInit) => {
        if (url.endsWith('/settle-queue')) return new Response(JSON.stringify({ queue }));
        posts.push({ url, body: String(init?.body) });
        return settled();
      };
      const pass = (extra: Partial<Parameters<typeof runPass>[0]> = {}) =>
        runPass({
          api: 'https://apibase.test',
          mk: MK,
          account: privateKeyToAccount(KEY),
          chain: mppxChainOps(),
          fetch: fetchMock,
          log: (l) => lines.push(l),
          pending,
          sleep: async (ms) => {
            sleeps.push(ms);
          },
          ...extra,
        });
      return { posts, sleeps, lines, pending, pass };
    };

    beforeEach(() => {
      calls.close.mockClear();
      calls.settle.mockClear();
      calls.receipt.mockReset();
      calls.receipt.mockResolvedValue({ status: 'success' });
    });

    it('MS5e: unconfirmed twice, then 200 -> reported, backoff 2s, 4s', async () => {
      let n = 0;
      const t = setup([item(2, 'close')], () =>
        ++n <= 2 ? new Response(UNCONFIRMED, { status: 400 }) : new Response('{}'),
      );
      expect(await t.pass()).toEqual({ done: 1, failed: 0 });
      expect(t.posts).toHaveLength(3);
      expect(calls.close).toHaveBeenCalledTimes(1);
      expect(calls.receipt).toHaveBeenCalledTimes(1);
      expect(t.sleeps).toEqual([2000, 4000]);
    });

    it('MS5f: never confirmed -> hash kept; next pass reports it without a new chain call', async () => {
      let ok = false;
      const t = setup([item(2, 'close')], () =>
        ok ? new Response('{}') : new Response(UNCONFIRMED, { status: 400 }),
      );
      expect(await t.pass()).toEqual({ done: 0, failed: 1 });
      expect(t.posts).toHaveLength(6);
      expect(t.pending.get(item(2, 'close').channel_id)).toEqual({
        tx_hash: `0x${'22'.repeat(32)}`,
        action: 'close',
      });
      ok = true;
      onChain.finalized = true;
      try {
        expect(await t.pass()).toEqual({ done: 1, failed: 0 });
      } finally {
        onChain.finalized = false;
      }
      expect(calls.close).toHaveBeenCalledTimes(1);
      expect(t.posts[6].body).toContain(`0x${'22'.repeat(32)}`);
      expect(t.pending.size).toBe(0);
      expect(t.lines.join('\n')).toContain('reporting the earlier tx');
    });

    it('MS5g: a reverted receipt is not reported', async () => {
      calls.receipt.mockResolvedValue({ status: 'reverted' });
      const t = setup([item(1, 'settle')], () => new Response('{}'));
      expect(await t.pass()).toEqual({ done: 0, failed: 1 });
      expect(t.posts).toHaveLength(0);
      expect(t.lines.join('\n')).toContain('reverted');
      expect(t.pending.size).toBe(0);
    });

    it('MS5h: receipt timeout -> not reported, hash kept', async () => {
      calls.receipt.mockRejectedValue(
        Object.assign(new Error('t'), { name: 'WaitForTransactionReceiptTimeoutError' }),
      );
      const t = setup([item(1, 'settle')], () => new Response('{}'));
      expect(await t.pass()).toEqual({ done: 0, failed: 1 });
      expect(t.posts).toHaveLength(0);
      expect(t.pending.get(item(1, 'settle').channel_id)?.tx_hash).toBe(`0x${'11'.repeat(32)}`);
      expect(t.lines.join('\n')).toContain('not seen within');
    });

    it('MS5i: 503 once, then 200 -> reported after one backoff', async () => {
      let n = 0;
      const t = setup([item(1, 'settle')], () =>
        ++n === 1
          ? new Response('{"error_code":"chain_unavailable"}', { status: 503 })
          : new Response('{}'),
      );
      expect(await t.pass()).toEqual({ done: 1, failed: 0 });
      expect(t.sleeps).toEqual([2000]);
    });

    it('MS5j: a final rejection is not retried and drops the pending hash', async () => {
      const t = setup(
        [item(1, 'settle')],
        () =>
          new Response(
            '{"error_code":"settle_not_proven","reject_reason":"tx_not_sent_from_payout_wallet"}',
            { status: 400 },
          ),
      );
      expect(await t.pass()).toEqual({ done: 0, failed: 1 });
      expect(t.posts).toHaveLength(1);
      expect(t.pending.size).toBe(0);
      expect(t.lines.join('\n')).not.toContain(KEY);
    });
  });
});
