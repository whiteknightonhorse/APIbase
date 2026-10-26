/** T-0561 part 1: /attest/ is served as static files; no server-side RPC wait can block the response. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');

function block(conf: string, header: string): string {
  const start = conf.indexOf(header);
  if (start < 0) throw new Error(`missing nginx block: ${header}`);
  return conf.slice(start, conf.indexOf('}', start));
}

describe('/attest/ renders without any server-side chain read', () => {
  const nginx = readFileSync(resolve(ROOT, 'nginx/nginx.conf'), 'utf8');

  it('docker nginx serves /attest/ from the static root with no upstream', () => {
    const b = block(nginx, 'location = /attest/ {');
    expect(b).toContain('try_files /attest/index.html');
    expect(b).not.toMatch(/proxy_pass|fastcgi_pass|upstream/);
  });

  it('attest.js is a static file', () => {
    const b = block(nginx, 'location = /attest/attest.js {');
    expect(b).toContain('root /var/www/static');
    expect(b).not.toMatch(/proxy_pass/);
  });

  it('the HTML issues no chain request before the module script loads', () => {
    const html = readFileSync(resolve(ROOT, 'static/attest/index.html'), 'utf8');
    expect(html).not.toMatch(/fetch\(|XMLHttpRequest|rpc-bradbury|rpc\.testnet-chain/);
  });
});
