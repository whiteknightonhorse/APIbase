/**
 * T-0268: CAS update adapter for Store.redis, against the REAL mppx Store.
 * mppx is ESM-only and this jest setup is CJS (no transform for node_modules),
 * so the scenarios run in a tsx child process and report results as JSON.
 */
import { execFileSync } from 'child_process';
import path from 'path';

const root = path.resolve(__dirname, '../..');

const SCRIPT = `
import { Store } from 'mppx/server';
import { atomicRedisAdapter } from './src/services/mppx-redis-store';

function fakeClient(evalOverride?: () => number) {
  const m = new Map<string, string>();
  let evals = 0;
  const client: any = {
    get: async (k: string) => (m.has(k) ? m.get(k)! : null),
    set: async (k: string, v: string) => (m.set(k, v), 'OK'),
    del: async (k: string) => (m.delete(k) ? 1 : 0),
    eval: async (_s: string, _n: number, key: string, absent: string, observed: string, op: string, v: string) => {
      evals++;
      if (evalOverride) return evalOverride();
      const cur = m.has(key) ? m.get(key)! : null;
      if (absent === '1' ? cur !== null : cur !== observed) return 0;
      if (op === 'set') m.set(key, v); else m.delete(key);
      return 1;
    },
  };
  return { m, client, evals: () => evals };
}
const markUsed = (cur: unknown): any =>
  cur !== null ? { op: 'noop', result: false } : { op: 'set', value: Date.now(), result: true };

(async () => {
  const out: Record<string, unknown> = {};
  let f = fakeClient();
  let store: any = Store.redis(atomicRedisAdapter(f.client));
  out.hasUpdate = typeof store.update;
  out.first = await store.update('h', markUsed);
  out.second = await store.update('h', markUsed);
  out.keys = f.m.size;

  f = fakeClient();
  store = Store.redis(atomicRedisAdapter(f.client));
  await store.put('k', { a: 1 });
  const had = f.m.has('k');
  await store.update('k', () => ({ op: 'delete', result: 'x' }));
  out.deleted = had && !f.m.has('k');

  let n = 0;
  f = fakeClient(() => (n++ === 0 ? 0 : 1));
  store = Store.redis(atomicRedisAdapter(f.client));
  out.retryResult = await store.update('h', markUsed);
  out.retryEvals = f.evals();

  f = fakeClient(() => 0);
  store = Store.redis(atomicRedisAdapter(f.client));
  try { await store.update('h', markUsed); out.exhausted = 'no throw'; }
  catch (e: any) { out.exhausted = e.message; }
  out.exhaustedEvals = f.evals();
  console.log('RESULT' + JSON.stringify(out));
})();
`;

describe('atomicRedisAdapter with real mppx Store (T-0268)', () => {
  let r: Record<string, unknown>;
  beforeAll(() => {
    const stdout = execFileSync(path.join(root, 'node_modules/.bin/tsx'), ['-e', SCRIPT], {
      cwd: root,
      encoding: 'utf8',
      timeout: 60000,
    });
    r = JSON.parse(stdout.split('RESULT')[1]);
  }, 70000);

  it('Store.redis exposes update', () => expect(r.hasUpdate).toBe('function'));
  it('markHashUsed semantics: first true, second false, single key', () => {
    expect(r.first).toBe(true);
    expect(r.second).toBe(false);
    expect(r.keys).toBe(1);
  });
  it('op delete removes the key', () => expect(r.deleted).toBe(true));
  it('retries once when eval returns 0', () => {
    expect(r.retryResult).toBe(true);
    expect(r.retryEvals).toBe(2);
  });
  it('throws when CAS never succeeds', () => {
    expect(r.exhausted).toBe('mppx store update: CAS retries exhausted');
    expect(r.exhaustedEvals).toBe(8);
  });
});

describe('Mppx.create with the Redis store (T-0426)', () => {
  it('emits no "in-memory store" warning and the adapter satisfies the store interface', () => {
    const script = `
import { Mppx, Store, tempo } from 'mppx/server';
import { privateKeyToAccount } from 'viem/accounts';
import { atomicRedisAdapter } from './src/services/mppx-redis-store';
const captured: string[] = [];
for (const k of ['log', 'warn', 'error', 'info'] as const) {
  (console as any)[k] = (...a: unknown[]) => captured.push(a.map(String).join(' '));
}
const client: any = { get: async () => null, set: async () => 'OK', del: async () => 1, eval: async () => 1 };
const store: any = Store.redis(atomicRedisAdapter(client));
const mppx = Mppx.create({
  methods: [tempo.charge({
    account: privateKeyToAccount('0x' + '11'.repeat(32)),
    currencies: ['0x20c0000000000000000000000000000000000000'],
    recipient: '0x00000000000000000000000000000000000a11ce',
    store,
  })],
  secretKey: 's'.repeat(32),
  realm: 'r',
});
const res = await mppx.charge({ amount: '1' })(new Request('https://x/y', { method: 'POST' }));
process.stdout.write('RESULT' + JSON.stringify({ captured, update: typeof store.update, status: res.status }));
`;
    const stdout = execFileSync(
      path.join(root, 'node_modules/.bin/tsx'),
      ['--input-type=module', '-e', script],
      { cwd: root, encoding: 'utf8', timeout: 60000 },
    );
    const r = JSON.parse(stdout.split('RESULT')[1]);
    expect(r.update).toBe('function');
    expect(r.status).toBe(402);
    expect(r.captured.filter((l: string) => /in-?memory|memory store/i.test(l))).toEqual([]);
  }, 70000);
});
