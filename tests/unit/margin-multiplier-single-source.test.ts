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
 *
 * Д-2 (2026-09-02): this test used to pass a SUBSTRING check
 * (`expect(py).toMatch(/config\/margin\.json/)`) that is true of BOTH
 * "{ROOT}/config/margin.json" (broken -- root config/ doesn't exist, F6 actually put
 * the file at src/config/) AND "{ROOT}/src/config/margin.json" (correct) -- so it never
 * discriminated the real bug, which ran FileNotFoundError in production for an hour
 * before anyone read the log. Fixed to extract the exact relative path the script opens
 * and require it to be the literal resolved path AND to exist on disk.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import marginConfig from '../../src/config/margin.json';

describe('MARGIN_MULTIPLIER single source (F6)', () => {
  it('config/margin.json is the value the TS runtime gate actually uses', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { __getMarginMultiplierForTest } = require('../../src/pipeline/stages/tool-status.stage');
    expect(__getMarginMultiplierForTest()).toBe(marginConfig.MARGIN_MULTIPLIER);
  });

  it('margin-gate-alerts.py opens the exact resolved file the TS side reads (not a substring match)', () => {
    const py = readFileSync(join(__dirname, '../../scripts/margin-gate-alerts.py'), 'utf8');

    // Extract the literal path fragment the script opens: f"{ROOT}/<relative-path>"
    const match = py.match(/open\(f"\{ROOT\}\/([^"]+)"\)/);
    expect(match).not.toBeNull();
    const relativePath = match![1]; // e.g. "src/config/margin.json"

    // The regression this test exists to catch: a prior version opened
    // "config/margin.json" (root config/, no such file) instead of
    // "src/config/margin.json" (where F6 actually put the file, and where the TS side
    // resolves its own '../../config/margin.json' import from src/pipeline/stages/).
    // A bare substring check on "config/margin.json" is true of BOTH strings and
    // therefore proves nothing -- require the FULL resolved relative path exactly.
    expect(relativePath).toBe('src/config/margin.json');

    // And require the file the script would actually open to really exist on disk at
    // that resolved path (repo root + relativePath) -- not just that the string reads right.
    const repoRoot = join(__dirname, '../..');
    expect(existsSync(join(repoRoot, relativePath))).toBe(true);

    expect(py).toMatch(/MARGIN_MULTIPLIER\s*=\s*json\.load/);
    // No bare "1.3" literal anywhere in the SQL/arithmetic -- every use must route
    // through the MARGIN_MULTIPLIER variable loaded from the shared config.
    expect(py).not.toMatch(/\*\s*1\.3\b/);
  });
});
