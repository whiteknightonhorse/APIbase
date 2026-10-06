/** T-INT-26 SB1-SB4: sandbox compose project, env template, host nginx, no overlap with prod. No containers run. */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const SANDBOX_COMPOSE = 'deploy/sandbox/docker-compose.sandbox.yml';
const ENV_EXAMPLE = 'deploy/sandbox/sandbox.env.example';
const NGINX_CONF = 'deploy/sandbox/nginx-sandbox.conf';

const have = (cmd: string, args: string[]) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 20000 });
  return r.status === 0;
};
const haveCompose = have('docker', ['compose', 'version']);
const haveNginxImage = have('docker', ['image', 'inspect', 'nginx:1.25-alpine']);
if (!haveCompose) console.warn('SB1 skipped: docker compose unavailable');
if (!haveNginxImage) console.warn('SB3 skipped: nginx:1.25-alpine image unavailable');

/** Strip comments, then collect `- "host:container"` port bindings and top-level volume names. */
function ports(yml: string): string[] {
  return [...yml.matchAll(/^\s*-\s*"?((?:\d+\.\d+\.\d+\.\d+:)?\d+:\d+)"?\s*$/gm)].map((m) => m[1]);
}
function namedVolumes(yml: string): string[] {
  const block = /^volumes:\n((?:[ \t]+\S.*\n|[ \t]*\n)+)/m.exec(yml.replace(/#.*$/gm, ''));
  return block ? [...block[1].matchAll(/^ {2}([A-Za-z0-9_]+):/gm)].map((m) => m[1]) : [];
}
function networks(yml: string): string[] {
  const block = /^networks:\n((?:[ \t]+\S.*\n|[ \t]*\n)+)/m.exec(yml.replace(/#.*$/gm, ''));
  return block ? [...block[1].matchAll(/^ {2}([A-Za-z0-9_]+):/gm)].map((m) => m[1]) : [];
}

describe('SB1 compose config is valid', () => {
  (haveCompose ? it : it.skip)('docker compose config succeeds with the template values', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sb1-'));
    copyFileSync(join(ROOT, SANDBOX_COMPOSE), join(dir, 'docker-compose.sandbox.yml'));
    copyFileSync(join(ROOT, ENV_EXAMPLE), join(dir, '.env.sandbox'));
    const r = spawnSync(
      'docker',
      ['compose', '-f', 'docker-compose.sandbox.yml', '--env-file', '.env.sandbox', 'config'],
      {
        cwd: dir,
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, POSTGRES_PASSWORD: 'x' },
      },
    );
    expect([r.status, r.stderr]).toEqual([0, '']);
    for (const svc of ['postgres', 'redis', 'api', 'worker', 'outbox-worker', 'nginx']) {
      expect([svc, r.stdout.includes(`\n  ${svc}:\n`)]).toEqual([svc, true]);
    }
  });
  it('declares the six base services on one image tag and the sandbox env file', () => {
    const y = read(SANDBOX_COMPOSE);
    expect(y).toMatch(/^name: apibase-sandbox$/m);
    expect(
      y.match(/image: ghcr\.io\/whiteknightonhorse\/apibase:\$\{IMAGE_TAG:-latest\}/g),
    ).toHaveLength(3);
    expect(y).toContain('.env.sandbox');
  });
});

describe('SB2 env template carries no values for keys', () => {
  const env = read(ENV_EXAMPLE);
  it('no 0x… hex, sk_ or re_ values', () => {
    expect(env).not.toMatch(/=\s*0x[0-9a-fA-F]+/);
    expect(env).not.toMatch(/=\s*sk_/);
    expect(env).not.toMatch(/=\s*re_/);
  });
  it('every key, password, wallet and URL credential line is blank', () => {
    const lines = env.split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l));
    for (const l of lines) {
      const [k, v] = [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)];
      if (/(KEY|SECRET|PASSWORD|WALLET|ADDRESS|^DATABASE_URL)/.test(k)) {
        expect([k, v]).toEqual([k, '']);
      }
    }
  });
  it('pins the testnet rails and the sandbox public URL', () => {
    expect(env).toMatch(/^X402_NETWORK=base-sepolia$/m);
    expect(env).toMatch(/^MPP_TESTNET=true$/m);
    expect(env).toMatch(/^PUBLIC_BASE_URL=https:\/\/sandbox\.apibase\.pro$/m);
    expect(env).toMatch(/^INTEGRATOR_BASE_ORDERS_ENABLED=/m);
  });
});

describe('SB3 host nginx config', () => {
  const conf = read(NGINX_CONF);
  const locations = (c: string) =>
    new Set([...c.matchAll(/^\s*location\s+(?:=\s*|\^~\s*)?(\/\S*)\s*\{/gm)].map((m) => m[1]));
  it('serves sandbox.apibase.pro, same locations as the prod host file, noindex everywhere', () => {
    expect(conf).toMatch(/server_name sandbox\.apibase\.pro;/);
    expect(conf).not.toMatch(/server_name apibase\.pro;/);
    const prod = locations(read('nginx/apibase-host.conf'));
    const sb = locations(conf);
    for (const p of prod) expect([p, sb.has(p)]).toEqual([p, true]);
    for (const p of ['/m/', '/shops', '/legal', '/integrator']) expect(sb.has(p)).toBe(true);
    expect(conf).toMatch(/add_header X-Robots-Tag "noindex, nofollow, noarchive" always;/);
    expect(conf).toMatch(/location = \/robots\.txt/);
    expect(conf).toContain('127.0.0.1:8881');
    expect(conf).not.toContain('127.0.0.1:8880');
  });
  it('carries the same CSP as the prod host file', () => {
    const csp = (c: string) => /add_header Content-Security-Policy "[^"]*"/.exec(c)?.[0];
    expect(csp(conf)).toBeDefined();
    expect(csp(conf)).toEqual(csp(read('nginx/apibase-host.conf')));
  });
  (haveNginxImage ? it : it.skip)('nginx -t parses it in a throwaway container', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sb3-'));
    // Stand-ins for the files certbot installs on the host: a self-signed cert and no-op includes.
    const mk = spawnSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-subj',
        '/CN=sandbox.apibase.pro',
        '-keyout',
        join(dir, 'k.pem'),
        '-out',
        join(dir, 'c.pem'),
      ],
      { encoding: 'utf8', timeout: 30000 },
    );
    expect(mk.status).toBe(0);
    writeFileSync(
      join(dir, 'site.conf'),
      conf
        .replace(/^\s*include \/etc\/letsencrypt\/options-ssl-nginx\.conf;$/m, '')
        .replace(/^\s*ssl_dhparam .*;$/m, ''),
    );
    writeFileSync(join(dir, 'nginx.conf'), 'events {}\nhttp {\n  include /site.conf;\n}\n');
    const live = '/etc/letsencrypt/live/sandbox.apibase.pro';
    const r = spawnSync(
      'docker',
      [
        'run',
        '--rm',
        '--network',
        'none',
        '-v',
        `${dir}/nginx.conf:/etc/nginx/nginx.conf:ro`,
        '-v',
        `${dir}/site.conf:/site.conf:ro`,
        '-v',
        `${dir}/c.pem:${live}/fullchain.pem:ro`,
        '-v',
        `${dir}/k.pem:${live}/privkey.pem:ro`,
        'nginx:1.25-alpine',
        'nginx',
        '-t',
      ],
      { encoding: 'utf8', timeout: 60000 },
    );
    expect([r.status, r.stderr]).toEqual([0, expect.stringContaining('test is successful')]);
  });
});

describe('SB4 no overlap with the prod compose', () => {
  const prod = read('docker-compose.yml');
  const sb = read(SANDBOX_COMPOSE);
  it('host ports differ', () => {
    const p = ports(prod);
    const s = ports(sb);
    expect(p.length).toBeGreaterThan(0);
    expect(s.length).toBeGreaterThan(0);
    const hostPort = (b: string) => b.split(':').slice(-2)[0];
    for (const b of s) expect([b, p.map(hostPort).includes(hostPort(b))]).toEqual([b, false]);
  });
  it('named volumes and networks differ', () => {
    const [pv, sv] = [namedVolumes(prod), namedVolumes(sb)];
    expect(sv).toEqual(expect.arrayContaining(['sandbox_pg', 'sandbox_redis']));
    for (const v of sv) expect(pv).not.toContain(v);
    const [pn, sn] = [networks(prod), networks(sb)];
    expect(sn.length).toBeGreaterThan(0);
    for (const n of sn) expect(pn).not.toContain(n);
  });
  it('the compose project name differs from the prod default', () => {
    expect(prod).not.toMatch(/^name:/m);
    expect(sb).toMatch(/^name: apibase-sandbox$/m);
  });
  it('does not pin container_name (would collide across projects)', () => {
    expect(sb).not.toMatch(/container_name:/);
  });
});
