/**
 * F6 gate: MARGIN_MULTIPLIER lived as a separate hardcoded `1.3` literal in both
 * src/pipeline/stages/tool-status.stage.ts (the runtime gate) and
 * scripts/margin-gate-alerts.py (the hourly alert cron that re-derives the same
 * violation from the DB) -- one policy constant, two places, no link between them.
 *
 * This doesn't run the Python script (no Python runtime assumed in this Jest
 * process) -- it's a cheap, mechanical cross-check: the TS runtime value must equal
 * config/margin.json, and margin-gate-alerts.py must actually read that same file
 * rather than carrying its own hardcoded copy.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import marginConfig from '../../src/config/margin.json';

describe('MARGIN_MULTIPLIER single source (F6)', () => {
  it('config/margin.json is the value the TS runtime gate actually uses', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { __getMarginMultiplierForTest } = require('../../src/pipeline/stages/tool-status.stage');
    expect(__getMarginMultiplierForTest()).toBe(marginConfig.MARGIN_MULTIPLIER);
  });

  it('margin-gate-alerts.py reads config/margin.json and carries no hardcoded literal', () => {
    const py = readFileSync(join(__dirname, '../../scripts/margin-gate-alerts.py'), 'utf8');
    expect(py).toMatch(/config\/margin\.json/);
    expect(py).toMatch(/MARGIN_MULTIPLIER\s*=\s*json\.load/);
    // No bare "1.3" literal anywhere in the SQL/arithmetic -- every use must route
    // through the MARGIN_MULTIPLIER variable loaded from the shared config.
    expect(py).not.toMatch(/\*\s*1\.3\b/);
  });
});
