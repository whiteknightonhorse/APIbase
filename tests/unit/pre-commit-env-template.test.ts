/**
 * T-0279: .husky/pre-commit lets the tracked template .env.example through the dotenv name
 * block, and only while every secret-like key keeps a CHANGE_ME placeholder. Each case runs
 * the real hook (sh -e, as husky does) inside a throwaway git repo; lint-staged is stubbed.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const ROOT = join(__dirname, '../..');
const HOOK = join(ROOT, '.husky/pre-commit');
const TEMPLATE = readFileSync(join(ROOT, '.env.example'), 'utf8');
const ENCRYPTION_LINE = 'ENCRYPTION_KEY=CHANGE_ME_MIN_32_CHARS_RANDOM_SECRET\n';
// Built at runtime so this test file itself never trips the hook's private-key scan.
const FAKE_PRIVATE_KEY = '0x' + 'ab'.repeat(32);

function runHook(files: Record<string, string>): { code: number; err: string } {
  const repo = mkdtempSync(join(tmpdir(), 'precommit-'));
  const bin = join(repo, 'stub-bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'npx'), '#!/bin/sh\nexit 0\n');
  chmodSync(join(bin, 'npx'), 0o755);
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, env });
  git('init', '-q');
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, rel)), { recursive: true });
    writeFileSync(join(repo, rel), body);
  }
  git('add', '-f', '--', ...Object.keys(files));
  try {
    execFileSync('sh', ['-e', HOOK], { cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, err: '' };
  } catch (e) {
    const failed = e as { status: number | null; stderr: Buffer };
    return { code: failed.status ?? -1, err: failed.stderr.toString() };
  }
}

describe('pre-commit: dotenv name block with the .env.example exception (T-0279)', () => {
  it('HK1 .env stays blocked', () => {
    const r = runHook({ '.env': 'API_KEY_SECRET=real\n' });
    expect(r.code).toBe(1);
    expect(r.err).toContain('BLOCKED: .env file staged for commit');
  });
  it('HK2 .env.production stays blocked', () => {
    const r = runHook({ '.env.production': 'PORT=3000\n' });
    expect(r.code).toBe(1);
    expect(r.err).toContain('BLOCKED: .env file staged for commit');
  });
  it('HK3 .env.enc anywhere stays blocked', () => {
    const r = runHook({ 'config/.env.enc': 'sops\n' });
    expect(r.code).toBe(1);
    expect(r.err).toContain('BLOCKED: .env file staged for commit');
  });
  it('HK4 the committed template passes, with and without ENCRYPTION_KEY', () => {
    expect(runHook({ '.env.example': TEMPLATE }).code).toBe(0);
    expect(runHook({ '.env.example': TEMPLATE + ENCRYPTION_LINE }).code).toBe(0);
  });
  it('HK5 .env.example next to .env does not unlock .env', () => {
    const r = runHook({ '.env.example': TEMPLATE, '.env': 'X=1\n' });
    expect(r.code).toBe(1);
    expect(r.err).toContain('BLOCKED: .env file staged for commit');
  });
  it('HK6 a secret-like key with a real value is blocked', () => {
    const body = TEMPLATE.replace(
      'API_KEY_SECRET=CHANGE_ME_MIN_32_CHARS_RANDOM_SECRET',
      'API_KEY_SECRET=s3cr3t-value-looks-real',
    );
    const r = runHook({ '.env.example': body });
    expect(r.code).toBe(1);
    expect(r.err).toContain('without a CHANGE_ME placeholder');
  });
  it('HK7 a URL with embedded non-placeholder credentials is blocked', () => {
    const body = TEMPLATE.replace(
      'postgresql://apibase:CHANGE_ME@postgres',
      'postgresql://apibase:hunter2@postgres',
    );
    const r = runHook({ '.env.example': body });
    expect(r.code).toBe(1);
    expect(r.err).toContain('embedded non-placeholder credentials');
  });
  it('HK8 the private-key content scan still covers the template', () => {
    const r = runHook({ '.env.example': `${TEMPLATE}OPERATOR_PK=${FAKE_PRIVATE_KEY}\n` });
    expect(r.code).toBe(1);
    expect(r.err).toContain('BLOCKED: Private key pattern detected');
  });
});
