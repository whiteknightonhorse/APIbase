/**
 * T-0299: scripts/flywheel-update.sh writes the memory dir only, never the deploy tree.
 * No DB needed.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'flywheel-update.sh');

describe('flywheel-update.sh', () => {
  it('T1: does not reference the deploy-tree CLAUDE.md', () => {
    expect(readFileSync(SCRIPT, 'utf8')).not.toContain('/home/apibase/apibase/CLAUDE.md');
  });

  it('T2: writes a memory file and changes nothing under the repo root', () => {
    const dir = mkdtempSync(join(tmpdir(), 'flywheel-'));
    writeFileSync(join(dir, 'MEMORY.md'), '## Feedback\n');
    const status = () =>
      execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
    const before = status();
    execFileSync('bash', [SCRIPT, 'test error', 'test rule', 'general'], {
      env: { ...process.env, MEMORY_DIR: dir, LOG: join(dir, 'flywheel.log') },
    });
    expect(readdirSync(dir).some((f) => f.startsWith('feedback_flywheel_general_'))).toBe(true);
    expect(status()).toBe(before);
  });
});
