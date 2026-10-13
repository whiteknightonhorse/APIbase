import { appEnvSchema, getShopEnv } from '../../src/config/env';

const required = {
  DATABASE_URL: 'x',
  DATABASE_URL_WORKER: 'x',
  DATABASE_URL_OUTBOX: 'x',
  API_KEY_SECRET: 'k'.repeat(32),
  ENCRYPTION_KEY: 'k'.repeat(40),
};

describe('env schema honesty (T-0350)', () => {
  it('parses without PROVIDER_KEY_OPENWEATHER or any shop var', () => {
    const r = appEnvSchema.safeParse(required);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.PROVIDER_KEY_OPENWEATHER).toBe('');
      expect(r.data.INTEGRATOR_FEE_ENABLED).toBe('false');
      expect(r.data.INTEGRATOR_FEE_BPS).toBe(150);
      expect(r.data.INTEGRATOR_MIN_ORDER_USD).toBe(1);
      expect(r.data.PUBLIC_BASE_URL).toBe('https://apibase.pro');
      expect(r.data.SANDBOX_STATUS).toBe('');
    }
  });

  it('getShopEnv defaults with an empty source; fee is off', () => {
    const e = getShopEnv({});
    expect(e.INTEGRATOR_FEE_ENABLED).toBe('false');
    expect(e.INTEGRATOR_FEE_BPS).toBe(150);
  });

  it('getShopEnv reads values and tolerates empty or malformed numbers', () => {
    expect(getShopEnv({ INTEGRATOR_FEE_BPS: '200', INTEGRATOR_FEE_ENABLED: 'true' })).toMatchObject(
      {
        INTEGRATOR_FEE_BPS: 200,
        INTEGRATOR_FEE_ENABLED: 'true',
      },
    );
    expect(getShopEnv({ INTEGRATOR_FEE_BPS: '', INTEGRATOR_MIN_ORDER_USD: 'abc' })).toMatchObject({
      INTEGRATOR_FEE_BPS: 150,
      INTEGRATOR_MIN_ORDER_USD: 1,
    });
  });
});
