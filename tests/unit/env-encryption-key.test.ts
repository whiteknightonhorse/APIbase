import { appEnvSchema } from '../../src/config/env';

const issuesFor = (env: Record<string, string>) => {
  const r = appEnvSchema.safeParse(env);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

describe('ENCRYPTION_KEY production fail-fast', () => {
  const required = {
    DATABASE_URL: 'x',
    DATABASE_URL_WORKER: 'x',
    DATABASE_URL_OUTBOX: 'x',
    API_KEY_SECRET: 'k'.repeat(32),
    PROVIDER_KEY_OPENWEATHER: 'x',
    POLYMARKET_WALLET_ADDRESS: '0x0',
  };
  const base = { ...required, NODE_ENV: 'production' };

  it('is rejected at startup in production when unset', () => {
    expect(issuesFor(base)).toContain('ENCRYPTION_KEY');
  });

  it('is rejected in production when shorter than 32 chars', () => {
    expect(issuesFor({ ...base, ENCRYPTION_KEY: 'short' })).toContain('ENCRYPTION_KEY');
  });

  it('is accepted in production at 32 chars', () => {
    expect(issuesFor({ ...base, ENCRYPTION_KEY: 'a'.repeat(32) })).not.toContain('ENCRYPTION_KEY');
  });

  it('is not required outside production', () => {
    expect(issuesFor({ ...required, NODE_ENV: 'test' })).not.toContain('ENCRYPTION_KEY');
    expect(issuesFor({ ...required, NODE_ENV: 'development' })).not.toContain('ENCRYPTION_KEY');
  });
});
