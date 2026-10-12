/**
 * T-0298: the shop DB test helpers must never fall back to the DATABASE_URL in .env (a symlink to
 * the live DB). No database is needed here: every case is a refusal.
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { requireTestDb } from './helpers/shop-db';

const root = path.resolve(__dirname, '../..');
const LOCAL = 'postgresql://u:p@127.0.0.1:55999/t';
const saved = { t: process.env.TEST_DATABASE_URL, d: process.env.DATABASE_URL };

afterEach(() => {
  if (saved.t === undefined) delete process.env.TEST_DATABASE_URL;
  else process.env.TEST_DATABASE_URL = saved.t;
  if (saved.d === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = saved.d;
});

describe('requireTestDb', () => {
  it('G1 unset -> throws', () => {
    delete process.env.TEST_DATABASE_URL;
    expect(() => requireTestDb()).toThrow(/refusing/);
  });

  it('G2 equal to DATABASE_URL -> throws', () => {
    process.env.TEST_DATABASE_URL = LOCAL;
    process.env.DATABASE_URL = LOCAL;
    expect(() => requireTestDb()).toThrow(/refusing/);
  });

  it('G3 non-local host -> throws', () => {
    process.env.TEST_DATABASE_URL = 'postgresql://u:p@db.example.com:5432/t';
    expect(() => requireTestDb()).toThrow(/refusing/);
  });

  it('accepts a local URL and pins DATABASE_URL to it', () => {
    process.env.TEST_DATABASE_URL = LOCAL;
    process.env.DATABASE_URL = 'postgresql://x:y@10.0.0.1:5432/other';
    expect(requireTestDb()).toBe(LOCAL);
    expect(process.env.DATABASE_URL).toBe(LOCAL);
  });
});

describe('real-mppx child', () => {
  it('G4 without TEST_DATABASE_URL it refuses, prints RESULT and exits 0', () => {
    const env = { ...process.env };
    delete env.TEST_DATABASE_URL;
    const r = spawnSync(
      path.join(root, 'node_modules/.bin/tsx'),
      [path.join(__dirname, 'helpers/shop-stream-merchant-real-mppx.child.ts')],
      { cwd: root, env, encoding: 'utf8', timeout: 10000 },
    );
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout.split('RESULT')[1]);
    expect(out.crashed).toContain('refusing');
  }, 15000);
});
