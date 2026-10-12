import { appEnvSchema } from '../../src/config/env';

const issuesFor = (env: Record<string, string>) => {
  const r = appEnvSchema.safeParse(env);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

const required = {
  DATABASE_URL: 'x',
  DATABASE_URL_WORKER: 'x',
  DATABASE_URL_OUTBOX: 'x',
  API_KEY_SECRET: 'k'.repeat(32),
  PROVIDER_KEY_OPENWEATHER: 'x',
  ENCRYPTION_KEY: 'k'.repeat(40),
};
const TEMPO = '0x00000000000000000000000000000000000fee01';
const BASE = '0x00000000000000000000000000000000000fee02';

describe('fee wallets are required per enabled rail (T-0318)', () => {
  it('E1 fee on + MPP on + empty Tempo address fails', () => {
    const env = {
      ...required,
      INTEGRATOR_FEE_ENABLED: 'true',
      MPP_ENABLED: 'true',
      INTEGRATOR_FEE_WALLET: '',
    };
    expect(issuesFor(env)).toContain('INTEGRATOR_FEE_WALLET');
  });

  it('E1b fee on + Base orders on + empty Base address fails', () => {
    const env = {
      ...required,
      INTEGRATOR_FEE_ENABLED: 'true',
      INTEGRATOR_BASE_ORDERS_ENABLED: 'true',
    };
    expect(issuesFor(env)).toContain('INTEGRATOR_FEE_WALLET_BASE');
  });

  it('E2 fee on + both addresses is fine', () => {
    const env = {
      ...required,
      INTEGRATOR_FEE_ENABLED: 'true',
      MPP_ENABLED: 'true',
      INTEGRATOR_BASE_ORDERS_ENABLED: 'true',
      INTEGRATOR_FEE_WALLET: TEMPO,
      INTEGRATOR_FEE_WALLET_BASE: BASE,
    };
    expect(issuesFor(env)).toEqual([]);
  });

  it('E3 fee off needs no addresses', () => {
    const env = { ...required, MPP_ENABLED: 'true', INTEGRATOR_BASE_ORDERS_ENABLED: 'true' };
    expect(issuesFor(env)).toEqual([]);
  });
});
