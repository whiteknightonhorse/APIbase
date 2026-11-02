/** T-0649: seed-demo-merchant --reaccept signs in-process and posts the full current legal set. */
import { reaccept, type FetchFn } from '../../scripts/shop/seed-demo-merchant';
import { privateKeyToAccount } from 'viem/accounts';

const KEY = '0x' + 'ab'.repeat(32);
const ENV_NAME = 'X402_OPERATOR_PRIVATE_KEY';
const WALLET = privateKeyToAccount(KEY as `0x${string}`).address;
const H1 = 'a'.repeat(64);
const H2 = 'b'.repeat(64);
const MESSAGE = `I accept APIbase documents: merchant-agreement v1.5 sha256:${H1}; aup v1.5 sha256:${H2}. Wallet: ${WALLET}. Nonce: 0abc. Time: 2026-11-26T00:00:00Z`;

type Call = { path: string; body?: any };

const json = (status: number, body: unknown) =>
  ({ status, text: async () => JSON.stringify(body) }) as unknown as Response;

function server(acceptStatus: number, acceptBody: unknown, calls: Call[]): FetchFn {
  return (async (url: string, init: { method: string; body?: string }) => {
    const path = new URL(url).pathname;
    calls.push({ path, body: init.body ? JSON.parse(init.body) : undefined });
    if (path.endsWith('/nonce')) return json(200, { message: MESSAGE, expires_in: 300 });
    return json(acceptStatus, acceptBody);
  }) as unknown as FetchFn;
}

const argv = ['--reaccept', '--wallet', WALLET, '--base-url', 'http://x.test'];
const env = { [ENV_NAME]: KEY };

function io() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) } };
}

describe('seed-demo-merchant --reaccept', () => {
  it('posts the full document set with a valid signature', async () => {
    const calls: Call[] = [];
    const c = io();
    const code = await reaccept(
      argv,
      env,
      server(200, { status: 'active', hint: 'ok' }, calls),
      c.io,
    );
    expect(code).toBe(0);
    const post = calls.find((x) => x.path.endsWith('/acceptances'))!;
    expect(post.body.doc_hashes).toEqual([
      { doc_id: 'merchant-agreement', version: '1.5', sha256: H1 },
      { doc_id: 'aup', version: '1.5', sha256: H2 },
    ]);
    expect(post.body.message).toBe(MESSAGE);
    expect(post.body.wallet).toBe(WALLET);
    expect(post.body.signature).toMatch(/^0x[0-9a-f]{130}$/);
    expect(c.out.join('\n')).toContain('status: active');
  });

  it('exits 2 on 428 and prints docs_to_accept', async () => {
    const c = io();
    const code = await reaccept(
      argv,
      env,
      server(428, { docs_to_accept: [{ doc_id: 'dpa', version: '1.4' }] }, []),
      c.io,
    );
    expect(code).toBe(2);
    expect(c.out.join('\n')).toContain('docs_to_accept dpa v1.4');
  });

  it('exits 1 before any request when the key variable is empty', async () => {
    const calls: Call[] = [];
    const c = io();
    const code = await reaccept(argv, { [ENV_NAME]: '' }, server(200, {}, calls), c.io);
    expect(code).toBe(1);
    expect(calls).toHaveLength(0);
    expect(c.err.join('\n')).toContain(`${ENV_NAME} is empty`);
  });

  it('refuses a key on the command line', async () => {
    const calls: Call[] = [];
    const c = io();
    expect(await reaccept([...argv, '--key', KEY], env, server(200, {}, calls), c.io)).toBe(1);
    expect(await reaccept([...argv, KEY], env, server(200, {}, calls), c.io)).toBe(1);
    expect(calls).toHaveLength(0);
  });

  it('never prints the key or the signature', async () => {
    const calls: Call[] = [];
    const cases: Array<[number, unknown]> = [
      [200, { status: 'active' }],
      [428, { docs_to_accept: [] }],
      [500, { error: 'x' }],
    ];
    for (const [st, body] of cases) {
      const c = io();
      await reaccept(argv, env, server(st, body, calls), c.io);
      const all = [...c.out, ...c.err].join('\n');
      expect(all).not.toContain(KEY);
      expect(all).not.toContain(KEY.slice(2));
      const sig = calls.filter((x) => x.body?.signature).pop()!.body.signature as string;
      expect(all).not.toContain(sig);
    }
  });
});
