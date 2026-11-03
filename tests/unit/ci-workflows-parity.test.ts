import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

// T-0682: Deploy validate must run the DB suites with the same services as the PR workflow.
function load(file: string): any {
  return parse(readFileSync(join(__dirname, '../../.github/workflows', file), 'utf8'));
}

describe('ci-workflows-parity (T-0682)', () => {
  const test = load('test.yml').jobs.validate;
  const deploy = load('deploy.yml').jobs.validate;

  it('postgres image matches', () => {
    expect(deploy.services?.postgres?.image).toBeDefined();
    expect(deploy.services.postgres.image).toBe(test.services.postgres.image);
  });
  it('redis image matches', () => {
    expect(deploy.services?.redis?.image).toBeDefined();
    expect(deploy.services.redis.image).toBe(test.services.redis.image);
  });
  it('TEST_DATABASE_URL matches', () => {
    expect(deploy.env?.TEST_DATABASE_URL).toBeDefined();
    expect(deploy.env.TEST_DATABASE_URL).toBe(test.env.TEST_DATABASE_URL);
  });
  it('deploy test step uses the CI flags and the DB url is set', () => {
    const step = deploy.steps.find((s: any) => /npm run test/.test(s.run ?? ''));
    expect(step).toBeDefined();
    expect(step.run).toContain('--ci --maxWorkers=2');
    expect(step.env?.NODE_OPTIONS).toBe('--max-old-space-size=4096');
    expect(deploy.env.TEST_DATABASE_URL).toMatch(/^postgresql:\/\//);
  });
});
