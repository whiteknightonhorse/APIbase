/** T-0820: .md and .txt files are served raw, so they carry no template markers; values are found by word anchors. */
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (dir: string, p: string) => readFileSync(join(dir, p), 'utf8');

function served(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) served(p, out);
    else if (/\.(md|txt)$/.test(n)) out.push(relative(ROOT, p));
  }
  return out;
}

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mdanchors-'));
  mkdirSync(join(dir, 'static/.well-known/agent-skills'), { recursive: true });
  for (const f of [
    'static/.well-known/mcp.json',
    'static/.well-known/site-facts.json',
    'static/pricing.md',
    'static/llms.txt',
    'static/ai.txt',
    'static/index.md',
    'static/.well-known/agent-skills/x402-payment.md',
    'static/.well-known/agent-skills/auto-register.md',
  ])
    cpSync(join(ROOT, f), join(dir, f));
  return dir;
}
const hf = (dir: string, cmd: string) =>
  spawnSync('python3', [join(ROOT, 'scripts/home-facts.py'), cmd], { cwd: dir, encoding: 'utf8' });

describe('T-0820 markdown and text files carry no template markers', () => {
  it('(a) no served .md/.txt (outside guides and legal) contains a comment marker', () => {
    const bad = served(join(ROOT, 'static'))
      .filter((f) => !f.startsWith('static/guides/') && !f.startsWith('static/legal/'))
      .filter((f) => readFileSync(join(ROOT, f), 'utf8').includes('<!--'));
    expect(bad).toEqual([]);
  });

  it('(b) an edited-away anchor makes check fail and name the file and cache-ttl', () => {
    const dir = sandbox();
    const p = join(dir, 'static/pricing.md');
    writeFileSync(
      p,
      readFileSync(p, 'utf8').replace('cached per its own TTL (', 'cached for a time ('),
    );
    const r = hf(dir, 'check');
    expect(r.status).not.toBe(0);
    expect(r.stdout).toContain('static/pricing.md');
    expect(r.stdout).toContain('cache-ttl');
  });

  it('(c) a changed value in the facts source renders into the .md without a marker', () => {
    const dir = sandbox();
    const sf = join(dir, 'static/.well-known/site-facts.json');
    const d = JSON.parse(readFileSync(sf, 'utf8'));
    d.cache_ttl_seconds.max_days = 45;
    writeFileSync(sf, JSON.stringify(d));
    expect(hf(dir, 'render').status).toBe(0);
    const md = read(dir, 'static/pricing.md');
    expect(md).toContain('cached per its own TTL (1 second to 45 days)');
    expect(md).not.toContain('<!--');
    expect(hf(dir, 'check').status).toBe(0);
  });

  it('the real tree renders clean and passes check', () => {
    expect(hf(ROOT, 'check').status).toBe(0);
    execFileSync('python3', [join(ROOT, 'scripts/integrator-facts.py'), 'check'], { cwd: ROOT });
  });
});
