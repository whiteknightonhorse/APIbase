/** T-INT-27: homepage numbers have one source (sync-counts baseline) and the status line is live. */
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getStatusLine,
  resetStatusLineCache,
  STATUS_LINE_FALLBACK,
} from '../../src/services/status-line.service';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const lint = (file: string, cwd = ROOT) =>
  spawnSync('python3', [join(ROOT, 'scripts/home-facts.py'), 'lint', file], {
    cwd,
    encoding: 'utf8',
  });

describe('H1 no fake terminal status', () => {
  it('the homepage HTML has no PID / TTY / Uptime text and no curl box', () => {
    const html = read('static/index.html');
    expect(html).not.toMatch(/\bPID\b/);
    expect(html).not.toMatch(/\bTTY\b/);
    expect(html).not.toMatch(/Uptime/);
    expect(html).not.toMatch(/class="terminal"/);
    expect(html).not.toMatch(/STATUS: ONLINE/);
  });
  it('one SSI status line with the fallback stub', () => {
    const html = read('static/index.html');
    expect(html).toContain('<!--#include virtual="/health/status-line" stub="statusfb" -->');
    expect(html).toContain(`<!--#block name="statusfb"-->${STATUS_LINE_FALLBACK}<!--#endblock-->`);
  });
});

describe('H2 numbers only from sync-counts tokens', () => {
  for (const f of ['static/index.html', 'static/ai.txt', 'static/index.md']) {
    it(`${f}: every number of 2+ digits is a baseline token or allow-listed`, () => {
      const r = lint(f);
      expect([f, r.stdout]).toEqual([f, '']);
      expect(r.status).toBe(0);
    });
  }
  it('mutation: a hardcoded tool count / old price / stale 207 turns lint red', () => {
    const dir = mkdtempSync(join(tmpdir(), 'homenum-'));
    const cwd = ROOT;
    const cases: Array<[string, string, string, string]> = [
      ['static/index.html', '1389 tools', '1500 tools', 'baseline'],
      ['static/index.html', '$0.001–$0.035', '$0.001–$1.00', 'baseline'],
      ['static/ai.txt', 'Tools: 1389 across', 'Tools: 1390 across', 'baseline'],
      ['static/index.html', 'many other services', '77 other services', 'untokenized'],
    ];
    for (const [file, from, to, msg] of cases) {
      const src = read(file);
      expect([file, from, src.includes(from)]).toEqual([file, from, true]);
      const tmp = join(dir, file.split('/').pop()!);
      writeFileSync(tmp, src.replace(from, to));
      const r = lint(tmp, cwd);
      expect([file, to, r.status]).toEqual([file, to, 1]);
      expect(r.stdout).toContain(msg);
    }
  });
});

describe('H3 /index.md', () => {
  it('nginx serves it as text/markdown from the static tree and the page links to it', () => {
    const conf = read('nginx/nginx.conf');
    expect(conf).toMatch(
      /location = \/index\.md \{[^}]*default_type "text\/markdown; charset=utf-8";[^}]*try_files \/index\.md =404;/,
    );
    expect(existsSync(join(ROOT, 'static/index.md'))).toBe(true);
    expect(read('static/index.html')).toContain(
      '<link rel="alternate" type="text/markdown" href="/index.md">',
    );
  });
});

describe('H4 sync-counts consistency', () => {
  it('home-facts check and the integrator facts check exit 0 on the tree', () => {
    execFileSync('python3', ['scripts/home-facts.py', 'check'], { cwd: ROOT });
    execFileSync('python3', ['scripts/integrator-facts.py', 'check'], { cwd: ROOT });
  });
  it('ai.txt is on the sync-counts-cron allow-list and carries no date or old price', () => {
    expect(read('scripts/sync-counts-cron.sh')).toMatch(/static\/llms\.txt static\/ai\.txt /);
    const ai = read('static/ai.txt');
    expect(ai).not.toMatch(/Last updated/);
    expect(ai).not.toMatch(/29\.99/);
  });
  it('mutation: a stale price range makes home-facts check fail', () => {
    const dir = mkdtempSync(join(tmpdir(), 'homechk-'));
    for (const f of [
      'static/index.html',
      'static/index.md',
      'static/ai.txt',
      'static/.well-known/mcp.json',
    ]) {
      const dst = join(dir, f);
      execFileSync('mkdir', ['-p', join(dst, '..')]);
      copyFileSync(join(ROOT, f), dst);
    }
    writeFileSync(join(dir, 'static/ai.txt'), read('static/ai.txt').replace('$0.035', '$29.99'));
    const r = spawnSync('python3', [join(ROOT, 'scripts/home-facts.py'), 'check'], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(r.status).toBe(1);
  });
});

describe('H5 status line', () => {
  beforeEach(resetStatusLineCache);
  it('/health/ready unavailable -> fallback line', async () => {
    const line = await getStatusLine(() => Promise.reject(new Error('down')), 1000);
    expect(line).toBe('status: see /health/ready');
  });
  it('ready -> live line, cached for 10 s', async () => {
    const ready = jest.fn().mockResolvedValue({ status: 'ready' });
    expect(await getStatusLine(ready, 1000)).toBe('status: ready');
    expect(await getStatusLine(ready, 10_999)).toBe('status: ready');
    expect(ready).toHaveBeenCalledTimes(1);
    expect(await getStatusLine(ready, 11_000)).toBe('status: ready');
    expect(ready).toHaveBeenCalledTimes(2);
  });
  it('not ready -> degraded', async () => {
    expect(await getStatusLine(async () => ({ status: 'not_ready' }) as never, 1)).toBe(
      'status: degraded',
    );
  });
});
