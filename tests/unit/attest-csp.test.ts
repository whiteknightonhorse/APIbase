/** T-0510z: the /attest/ location carries its own CSP (script 'self' + Bradbury RPC); the site-wide CSP stays as served. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CONF = readFileSync(resolve(__dirname, '../../nginx/apibase-host.conf'), 'utf8');

function directives(csp: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of csp.split(';')) {
    const [name, ...vals] = part.trim().split(/\s+/);
    if (name) out[name] = vals;
  }
  return out;
}

const cspLines = [...CONF.matchAll(/add_header Content-Security-Policy "([^"]+)" always;/g)];
const attestStart = CONF.indexOf('location ^~ /attest/ {');
const attestBlock = CONF.slice(attestStart, CONF.indexOf('\n    }\n', attestStart));
const attestMatch = /Content-Security-Policy "([^"]+)"/.exec(attestBlock);
const siteCsp = directives(cspLines.length > 0 ? cspLines[0][1] : '');
const attestCsp = directives(attestMatch ? attestMatch[1] : '');

describe('host nginx CSP (T-0510z)', () => {
  it('has exactly one site-wide CSP and one /attest/ CSP', () => {
    expect(attestStart).toBeGreaterThan(0);
    expect(attestMatch).not.toBeNull();
    expect(cspLines).toHaveLength(2);
  });

  it('site-wide CSP is unchanged', () => {
    expect(cspLines[0]?.[1]).toBe(
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; img-src 'self' data:; media-src 'self'; frame-ancestors 'none'",
    );
    expect(siteCsp['script-src']).not.toContain("'self'");
    expect(siteCsp['connect-src']).not.toContain('https://rpc-bradbury.genlayer.com');
  });

  it("/attest/ allows script 'self' and the Bradbury RPC", () => {
    expect(attestCsp['script-src']).toContain("'self'");
    expect(attestCsp['connect-src']).toContain('https://rpc-bradbury.genlayer.com');
  });

  it('/attest/ differs from the site-wide CSP only in those two directives', () => {
    const strip = (d: Record<string, string[]>, drop: Record<string, string>) =>
      Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.filter((x) => x !== drop[k])]));
    expect(
      strip(attestCsp, {
        'script-src': "'self'",
        'connect-src': 'https://rpc-bradbury.genlayer.com',
      }),
    ).toEqual(siteCsp);
  });

  it('/attest/ repeats the other security headers (nginx drops inherited add_header)', () => {
    for (const h of [
      'Strict-Transport-Security',
      'X-Frame-Options',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
    ]) {
      expect(attestBlock).toContain(`add_header ${h} `);
    }
  });
});
