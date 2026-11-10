import { readFileSync } from 'fs';
import { join } from 'path';
import config from '../../jest.config';

describe('jest config limits (JEST-MEM-1110)', () => {
  it('pins one worker and a recycle limit', () => {
    expect(config.maxWorkers).toBe(1);
    expect(config.workerIdleMemoryLimit).toBe('1GB');
  });

  it('CI workflows pass --maxWorkers=2 and never run in band', () => {
    for (const f of ['test.yml', 'deploy.yml']) {
      const text = readFileSync(join(__dirname, '../../.github/workflows', f), 'utf8');
      expect(text).toContain('--maxWorkers=2');
      // deploy.yml legitimately uses `ssh -i`, so check only the lines that run the tests.
      const testLines = text
        .split('\n')
        .filter((l) => /npm run test|jest/.test(l) && !/^\s*#/.test(l));
      expect(testLines.length).toBeGreaterThan(0);
      for (const l of testLines) {
        expect(l).not.toContain('--runInBand');
        expect(l).not.toMatch(/\s-i(\s|$)/);
      }
    }
  });
});
