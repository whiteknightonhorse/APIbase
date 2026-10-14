import { execFileSync } from 'child_process';
import * as path from 'path';

describe('scripts/release-check.sh', () => {
  it('--selftest reports OK', () => {
    const script = path.resolve(__dirname, '../../scripts/release-check.sh');
    const out = execFileSync('bash', [script, '--selftest'], { encoding: 'utf8' });
    expect(out.trim()).toBe('OK');
  });
});
