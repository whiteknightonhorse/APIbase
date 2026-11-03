/** T-0553: scripts/server-wallet-init.sh against a temp HOME. */
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve(__dirname, '../../scripts/server-wallet-init.sh');
const KEY_RE = /0x[0-9a-fA-F]{64}/;

function setup() {
  const home = mkdtempSync(join(tmpdir(), 'swi-'));
  mkdirSync(join(home, 'apibase'));
  const env = join(home, 'apibase', '.env');
  writeFileSync(env, 'FOO=bar', { mode: 0o600 }); // no trailing newline on purpose
  return { home, env, record: join(home, 'apibase', '.server-wallets.json') };
}
const run = (home: string, name: string, rail: string) =>
  spawnSync('bash', [SCRIPT, name, rail], {
    env: { PATH: process.env.PATH ?? '', HOME: home },
    encoding: 'utf8',
  });

describe('server-wallet-init.sh', () => {
  it('generates one key, prints only the address, writes env + record', () => {
    const { home, env, record } = setup();
    const r = run(home, 'REFUND_SIGNER_KEY_BASE', 'base');
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).not.toMatch(KEY_RE);
    const addr = /address: (0x[0-9a-fA-F]{40})/.exec(r.stdout)?.[1];
    expect(addr).toBeTruthy();
    expect(statSync(env).mode & 0o777).toBe(0o600);
    const lines = readFileSync(env, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('FOO=bar');
    expect(lines[1]).toMatch(/^REFUND_SIGNER_KEY_BASE=0x[0-9a-f]{64}$/);
    const rec = JSON.parse(readFileSync(record, 'utf8'));
    expect(rec).toHaveLength(1);
    expect(rec[0]).toMatchObject({ name: 'REFUND_SIGNER_KEY_BASE', rail: 'base', address: addr });
    expect(statSync(record).mode & 0o777).toBe(0o600);
    expect(readdirSync(join(home, 'apibase')).sort()).toEqual(['.env', '.server-wallets.json']);
  });

  it('refuses a second run and changes nothing', () => {
    const { home, env, record } = setup();
    expect(run(home, 'REFUND_SIGNER_KEY_TEMPO', 'tempo').status).toBe(0);
    const envBefore = readFileSync(env, 'utf8');
    const recBefore = readFileSync(record, 'utf8');
    const r = run(home, 'REFUND_SIGNER_KEY_TEMPO', 'tempo');
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('replacing a funded key is a hand ceremony');
    expect(r.stdout + r.stderr).not.toMatch(KEY_RE);
    expect(readFileSync(env, 'utf8')).toBe(envBefore);
    expect(readFileSync(record, 'utf8')).toBe(recBefore);
  });

  it('has no replace flag and is referenced by no npm script or workflow', () => {
    const src = readFileSync(SCRIPT, 'utf8');
    expect(src).not.toMatch(/--replace/);
    const pkg = readFileSync(resolve(__dirname, '../../package.json'), 'utf8');
    expect(pkg).not.toContain('server-wallet-init');
  });
});
