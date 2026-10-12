import { renderTokens, DEFAULT_SANDBOX_STATUS } from '../../src/shop/integrator/tokens';

describe('T-0320: sandbox status token', () => {
  const saved = process.env.SANDBOX_STATUS;
  afterEach(() => {
    if (saved === undefined) delete process.env.SANDBOX_STATUS;
    else process.env.SANDBOX_STATUS = saved;
  });

  it('T1: SANDBOX_STATUS unset renders the live sandbox URL', () => {
    delete process.env.SANDBOX_STATUS;
    const out = renderTokens('{{SANDBOX_STATUS}}');
    expect(out).toContain('https://sandbox.apibase.pro');
    expect(out).toBe(DEFAULT_SANDBOX_STATUS);
    expect(out).not.toContain('not yet available');
  });

  it('T2: SANDBOX_STATUS env overrides the default', () => {
    process.env.SANDBOX_STATUS = 'Sandbox: offline for maintenance';
    expect(renderTokens('{{SANDBOX_STATUS}}')).toBe('Sandbox: offline for maintenance');
  });
});
