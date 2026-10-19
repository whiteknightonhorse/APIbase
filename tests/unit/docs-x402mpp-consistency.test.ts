/**
 * T-0432 gate: documentation consistency after the x402 2.28 / mppx 0.13.5 round (X402MPP-1015 R-12).
 * Scans every public surface that talks about payments and fails on:
 *   1. github.com/coinbase/x402 (the repository lives at x402-foundation/x402);
 *   2. an mppx or @x402/<pkg> version string that is not the package.json range
 *      (`mppx >= 0.6.16` is the one allowed minimum client version);
 *   3. the removed MPP charge memo: "memo" within 200 chars of MPP / Tempo / quote
 *      (two allowlisted anchors: keychain renewal memos and the fee-invoice memo in static/integrator/docs.md,
 *      plus the "Removed" line of docs/releases/v2.2.0.md);
 *   4. a minimum MPP client version other than 0.6.16;
 *   5. "USDC on Tempo" without ".e" (the Tempo token is USDC.e).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const MIN_MPP_CLIENT = '0.6.16';

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
};
const MPPX_VERSION = pkg.dependencies['mppx'].replace(/^[\^~]/, '');
const X402_MINOR = (pkg.dependencies['@x402/core'].replace(/^[\^~]/, '').match(/^2\.(\d+)/) ??
  [])[1];

function braces(base: string, names: string[], exts: string[]): string[] {
  return names.flatMap((n) => exts.map((e) => `${base}/${n}.${e}`));
}

function surfaces(): string[] {
  const list = [
    'README.md',
    ...[
      'x402-facilitator',
      'payments',
      'integrator',
      'architecture',
      'self-hosting',
      'runbook',
      'ROADMAP',
      'STRATEGY',
    ].map((n) => `docs/${n}.md`),
    ...readdirSync(join(ROOT, 'docs/releases'))
      .filter((f) => f.endsWith('.md'))
      .map((f) => `docs/releases/${f}`),
    'packages/mcp-client/README.md',
    ...braces(
      'static/integrator',
      ['docs', 'agent-guide', 'buyers', 'wallet', 'why-base-tempo', 'index', 'llms'],
      ['md', 'html', 'txt'],
    ),
    'static/legal/merchant-agreement.md',
    ...braces(
      'static',
      ['index', 'why', 'pricing', 'connect', 'frameworks', 'auth', 'catalog', 'terms', 'privacy'],
      ['html', 'md'],
    ),
    'static/llms.txt',
    'static/ai.txt',
    ...[
      'x402-payment.json',
      'agent-skills/x402-payment.md',
      'agent-skills/index.json',
      'mcp.json',
      'mcp/server-card.json',
      'openapi.json',
      'openapi-discovery.json',
      'agent.json',
      'ai-catalog.json',
      'acp.json',
      'api-catalog',
      'ucp',
    ].map((n) => `static/.well-known/${n}`),
  ];
  return list.filter((f) => existsSync(join(ROOT, f)));
}

// "memo" occurrences that are not the removed MPP charge memo, anchored by file and by the text of their own line.
const MEMO_ALLOW: Array<{ file: string; line: RegExp }> = [
  { file: 'static/integrator/docs.md', line: /renew-queue/ },
  { file: 'static/integrator/docs.md', line: /APIbase reads every transaction/ },
  { file: 'static/integrator/docs.md', line: /fee-invoices/ },
  { file: 'docs/releases/v2.2.0.md', line: /custom MPP charge memo/ },
];

function lineOf(text: string, idx: number): string {
  const start = text.lastIndexOf('\n', idx) + 1;
  const end = text.indexOf('\n', idx);
  return text.slice(start, end === -1 ? undefined : end);
}

const files = surfaces();
const read = (f: string): string => readFileSync(join(ROOT, f), 'utf8');

describe('T-0432 docs x402/MPP consistency gate', () => {
  it('scans the whole surface list', () => {
    expect(files.length).toBeGreaterThanOrEqual(45);
    expect(files).toContain('docs/x402-facilitator.md');
    expect(files).toContain('static/.well-known/mcp.json');
    expect(files).toContain('static/integrator/why-base-tempo.md');
  });

  it('package.json pins the versions the docs are compared against', () => {
    expect(MPPX_VERSION).toMatch(/^0\.\d+\.\d+$/);
    expect(X402_MINOR).toBeDefined();
  });

  it('G1: no github.com/coinbase/x402 link', () => {
    const bad = files.filter((f) => /github\.com\/coinbase\/x402/i.test(read(f)));
    expect(bad).toEqual([]);
  });

  it('G2: mppx and @x402/* versions equal the package.json range', () => {
    const bad: string[] = [];
    for (const f of files) {
      const t = read(f);
      for (const m of t.matchAll(/mppx\s*(>=|v|@)?\s*(0\.\d+(?:\.\d+)?)/gi)) {
        const ok = m[2] === MPPX_VERSION || (m[1] === '>=' && m[2] === MIN_MPP_CLIENT);
        if (!ok) bad.push(`${f}: ${m[0]}`);
      }
      for (const m of t.matchAll(/@x402\/\w+@?\s*2\.(\d+)/g)) {
        if (m[1] !== X402_MINOR) bad.push(`${f}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('G3: no charge memo next to MPP / Tempo / quote', () => {
    const bad: string[] = [];
    for (const f of files) {
      const t = read(f);
      for (const m of t.matchAll(/memo/gi)) {
        const i = m.index ?? 0;
        const around = t.slice(Math.max(0, i - 200), i + 200);
        if (!/MPP|Tempo|quote/i.test(around)) continue;
        const line = lineOf(t, i);
        if (MEMO_ALLOW.some((a) => a.file === f && a.line.test(line))) continue;
        bad.push(`${f}: ${line.slice(0, 120)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('G4: the minimum MPP client version is 0.6.16 everywhere it is stated', () => {
    const bad: string[] = [];
    let seen = 0;
    for (const f of files) {
      const t = read(f);
      for (const m of t.matchAll(/(?:mppx\s*>=|minimum[^.\n]{0,40}mppx\s*)\s*(\d+\.\d+\.\d+)/gi)) {
        seen++;
        if (m[1] !== MIN_MPP_CLIENT) bad.push(`${f}: ${m[0]}`);
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(bad).toEqual([]);
  });

  it('G5: the Tempo token is always written USDC.e', () => {
    const bad = files.filter((f) => /USDC on Tempo/i.test(read(f)));
    expect(bad).toEqual([]);
  });
});
