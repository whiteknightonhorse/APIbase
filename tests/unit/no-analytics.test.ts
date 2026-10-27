/** T-0598: no third-party analytics on any page; CSP carries no Google origins; privacy states no cookies. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rd = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf-8');

describe('T-0598 no third-party analytics', () => {
  it('home page and integrator layout carry no gtag or GA marker', () => {
    for (const f of ['static/index.html', 'static/integrator/_layout.html']) {
      const s = rd(f);
      expect(s).not.toContain('gtag');
      expect(s).not.toContain('googletagmanager');
      expect(s).not.toContain('<!--ga4-->');
    }
  });

  it('nginx and sandbox CSP carry no Google origins', () => {
    for (const f of ['nginx/apibase-host.conf', 'deploy/sandbox/nginx-sandbox.conf']) {
      const s = rd(f);
      expect(s).not.toContain('googletagmanager');
      expect(s).not.toContain('google-analytics');
    }
  });

  it('privacy policy names no Google Analytics and states no cookies', () => {
    const s = rd('static/privacy.html');
    expect(s).not.toContain('Google Analytics');
    expect(s).not.toContain('3a-analytics');
    expect(s).toContain('No cookies or tracking pixels.');
  });
});
