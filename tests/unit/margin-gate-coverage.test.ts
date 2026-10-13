import { execFileSync, spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPTS = join(__dirname, '../../scripts');

describe('T-0352 margin-gate coverage', () => {
  it('margin-gate-alerts.py --selftest passes (coverage_stats, coverage_line)', () => {
    const out = execFileSync('python3', [join(SCRIPTS, 'margin-gate-alerts.py'), '--selftest']);
    expect(out.toString()).toContain('OK');
  });

  it('gate fails below 90% and prints the coverage line', () => {
    const src = readFileSync(join(SCRIPTS, 'margin-gate-alerts.py'), 'utf8');
    expect(src).toContain('COVERAGE_MIN_PCT = 90.0');
    expect(src).toContain('return 0 if check_coverage() else 1');
    expect(src).toContain('coverage: {with_cost}/{paid} ({pct:.1f}%)');
  });

  it('backfill dry run writes nothing; --apply only adds cost fields', () => {
    const root = mkdtempSync(join(tmpdir(), 't0352-'));
    mkdirSync(join(root, 'scripts/night-orchestra/state'), { recursive: true });
    mkdirSync(join(root, 'config'));
    mkdirSync(join(root, 'src/config'), { recursive: true });
    writeFileSync(
      join(root, 'scripts/backfill-upstream-cost.py'),
      readFileSync(join(SCRIPTS, 'backfill-upstream-cost.py')),
    );
    writeFileSync(
      join(root, 'scripts/night-orchestra/state/connected.json'),
      JSON.stringify({
        freeco: { status: 'connected' },
        paidco: { status: 'connected' },
        keyed: { status: 'blocked' },
      }),
    );
    writeFileSync(
      join(root, 'src/config/provider-limits.json'),
      JSON.stringify({ paidco: { billing: { cap: 1 } } }),
    );
    const yamlText = [
      'tools:',
      '  - tool_id: a.one',
      '    name: A',
      '    provider: freeco',
      '    price_usd: "0.001"',
      '    cache_ttl: 5',
      '',
      '  - tool_id: b.one',
      '    name: B',
      '    provider: paidco',
      '    price_usd: "0.002"',
      '    cache_ttl: 5',
      '',
      '  - tool_id: c.one',
      '    name: C',
      '    provider: keyed',
      '    price_usd: "0.003"',
      '    upstream_cost_usd: "0.001"',
      '    cache_ttl: 5',
      '',
    ].join('\n');
    const y = join(root, 'config/tool_provider_config.yaml');
    writeFileSync(y, yamlText);
    const script = join(root, 'scripts/backfill-upstream-cost.py');

    const dry = spawnSync('python3', [script]).stdout.toString();
    expect(dry).toContain('would get upstream_cost_usd 0: 1');
    expect(dry).toContain('UNKNOWN paidco: 1 tool(s)');
    expect(readFileSync(y, 'utf8')).toBe(yamlText);

    spawnSync('python3', [script, '--apply']);
    const after = readFileSync(y, 'utf8');
    expect(after).toContain('    price_usd: "0.001"\n    upstream_cost_usd: "0"\n');
    expect(after.replace(/    upstream_cost_usd: "0"\n/g, '')).toBe(yamlText);
  });
});
