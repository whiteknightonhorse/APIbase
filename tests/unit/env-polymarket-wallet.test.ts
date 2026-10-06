import { appEnvSchema } from '../../src/config/env';

const issuesFor = (env: Record<string, string>) => {
  const r = appEnvSchema.safeParse(env);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

describe('POLYMARKET_WALLET_ADDRESS validation', () => {
  const required = {
    DATABASE_URL: 'x',
    DATABASE_URL_WORKER: 'x',
    DATABASE_URL_OUTBOX: 'x',
    API_KEY_SECRET: 'k'.repeat(32),
    PROVIDER_KEY_OPENWEATHER: 'x',
  };

  it('is not an issue when unset', () => {
    expect(issuesFor(required)).not.toContain('POLYMARKET_WALLET_ADDRESS');
  });

  it('is not an issue when empty', () => {
    expect(issuesFor({ ...required, POLYMARKET_WALLET_ADDRESS: '' })).not.toContain(
      'POLYMARKET_WALLET_ADDRESS',
    );
  });

  it('is not an issue when it starts with 0x', () => {
    expect(issuesFor({ ...required, POLYMARKET_WALLET_ADDRESS: '0xabc' })).not.toContain(
      'POLYMARKET_WALLET_ADDRESS',
    );
  });

  it('is an issue when it lacks the 0x prefix', () => {
    expect(issuesFor({ ...required, POLYMARKET_WALLET_ADDRESS: 'abc' })).toContain(
      'POLYMARKET_WALLET_ADDRESS',
    );
  });
});
