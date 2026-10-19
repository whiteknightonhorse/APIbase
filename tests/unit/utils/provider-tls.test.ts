import https from 'https';
import { providerHttpsAgent } from '../../../src/utils/provider-tls';

describe('providerHttpsAgent (T-0480)', () => {
  it('returns undefined for a provider without a tls block', () => {
    expect(providerHttpsAgent('ibge')).toBeUndefined();
    expect(providerHttpsAgent('no-such-provider')).toBeUndefined();
  });

  it('gives ecdc-surveillance an agent capped at TLSv1.2, cached per provider', () => {
    const agent = providerHttpsAgent('ecdc-surveillance');
    expect(agent).toBeInstanceOf(https.Agent);
    expect((agent as https.Agent & { options: { maxVersion?: string } }).options.maxVersion).toBe(
      'TLSv1.2',
    );
    expect(providerHttpsAgent('ecdc-surveillance')).toBe(agent);
  });

  it('fails closed on an unknown max_version', () => {
    expect(() => providerHttpsAgent('p', { p: { tls: { max_version: 'TLSv1.0' } } })).toThrow(
      /max_version/,
    );
  });

  it('fails closed on an unknown tls key (no CA overrides)', () => {
    expect(() => providerHttpsAgent('p', { p: { tls: { ca: 'x' } } })).toThrow(
      /unsupported key "ca"/,
    );
    expect(() => providerHttpsAgent('p', { p: { tls: 'TLSv1.2' } })).toThrow(/must be an object/);
  });

  it('accepts TLSv1.3 from an injected config', () => {
    const agent = providerHttpsAgent('p', { p: { tls: { max_version: 'TLSv1.3' } } });
    expect(agent).toBeInstanceOf(https.Agent);
  });
});
