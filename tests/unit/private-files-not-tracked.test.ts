/**
 * T-INT-01 SC10 (spec section 15): no tracked file may carry `.private.` in its path.
 * `git add -N` (intent-to-add) is enough to make `git ls-files` list a path, so the
 * fixture check below proves the matcher actually sees an about-to-be-tracked file.
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const root = join(__dirname, '../..');
const PATTERN = '.private.';
const offenders = (files: string[]) => files.filter((f) => f.includes(PATTERN));
const tracked = (cwd: string) =>
  execFileSync('git', ['ls-files'], { cwd, encoding: 'utf8' }).split('\n').filter(Boolean);

describe('private files stay out of git', () => {
  it('git ls-files contains no `.private.` path', () => {
    expect(offenders(tracked(root))).toEqual([]);
  });

  it('control: a `.private.` file made visible to git (git add -N) IS caught', () => {
    const dir = mkdtempSync(join(tmpdir(), 'priv-'));
    try {
      const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
      git('init', '-q');
      writeFileSync(join(dir, 'x.private.json'), '{}');
      git('add', '-N', 'x.private.json');
      expect(offenders(tracked(dir))).toEqual(['x.private.json']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('.gitignore carries both section-15 lines', () => {
    const gi = execFileSync('cat', [join(root, '.gitignore')], { encoding: 'utf8' }).split('\n');
    expect(gi).toContain('config/integrator/*.private.json');
    expect(gi).toContain('scripts/integrator/state/');
  });
});
