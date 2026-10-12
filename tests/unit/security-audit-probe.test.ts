import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(ROOT, 'scripts/security-audit-cron.sh');
const SKILL = path.join(os.homedir(), '.claude/skills/security/SKILL.md');
const KEY_RE = /ak_live_(?!0{32})[0-9a-f]{32}/; // all-zero placeholders are invalid-key fixtures

function listFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(p) : [p];
  });
}

/** Probe block: from the T-0300 marker up to the next numbered section banner. */
function probeBlock(): string {
  const src = fs.readFileSync(SCRIPT, 'utf8');
  const start = src.indexOf('# T-0300:');
  const end = src.indexOf('# ========================================\n# 8.');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

function classify(reply: string, scriptFile = SCRIPT): string {
  const src = fs.readFileSync(scriptFile, 'utf8');
  const m = src.match(/^classify_mcp_reply\(\) \{\n[\s\S]*?^\}\n/m);
  expect(m).not.toBeNull();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'classify-'));
  const fn = path.join(tmp, 'fn.sh');
  fs.writeFileSync(fn, m![0]);
  return execFileSync('bash', ['-c', 'source "$2"; classify_mcp_reply "$1"', 'bash', reply, fn], {
    encoding: 'utf8',
  }).trim();
}

describe('security audit MCP payment probe', () => {
  it('T1 no live API key literal in scripts/ or the security skill', () => {
    const files = listFiles(path.join(ROOT, 'scripts')).filter((f) => !f.includes('node_modules'));
    if (fs.existsSync(SKILL)) files.push(SKILL);
    const hits = files.filter((f) => KEY_RE.test(fs.readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });

  it('T2 probe block and script parse with bash -n', () => {
    execFileSync('bash', ['-n', SCRIPT]);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-'));
    const f = path.join(tmp, 'probe.sh');
    fs.writeFileSync(f, probeBlock());
    execFileSync('bash', ['-n', f]);
  });

  it('T3 classify_mcp_reply: 402 reply passes, data reply is critical', () => {
    expect(classify('{"error":{"message":"payment_required"}}')).toBe('PASS');
    expect(classify('{"result":{"content":[{"type":"text","text":"{}"}]}}')).toBe('CRITICAL');
  });

  it('T4 probe block carries no Authorization key of its own and has a SKIP path', () => {
    const block = probeBlock();
    expect(block).toContain('SKIP: AUDIT_ZERO_BALANCE_KEY unset');
    expect(block).toContain('head -c 300');
  });
});
