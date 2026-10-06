/**
 * T-INT-43 WC1-WC10: the WooCommerce plugin (packages/woocommerce-apibase, GPL-2.0-or-later).
 * The PHP checks run in a throwaway `php:8.3-cli` container (no network, package mounted read-only);
 * when docker or the image is missing they are skipped here and run by the dispatcher.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

jest.mock('../../src/config/index', () => ({
  config: { ENCRYPTION_KEY: 'k'.repeat(40), X402_NETWORK: 'base' },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { CatalogItemSchema } from '../../src/shop/catalog.service';
import { signPayload } from '../../src/shop/webhook/webhook.service';

const ROOT = resolve(__dirname, '../..');
const PKG = join(ROOT, 'packages/woocommerce-apibase');
const FIX = join(PKG, 'tests/fixtures');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const phpReady = (() => {
  const r = spawnSync('docker', ['image', 'inspect', 'php:8.3-cli'], { stdio: 'ignore' });
  return r.status === 0;
})();
const phpIt = phpReady ? it : it.skip;

function php(args: string[]): { status: number; out: string } {
  const r = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--network',
      'none',
      '-v',
      `${PKG}:/app:ro`,
      '-w',
      '/app',
      'php:8.3-cli',
      ...args,
    ],
    { encoding: 'utf8' },
  );
  return { status: r.status ?? 1, out: `${r.stdout}${r.stderr}` };
}

describe('WooCommerce plugin', () => {
  it('signature fixture is the INT-14 TypeScript signer output (PHP verifies it in WC2)', () => {
    const secret = `whsec_${'b'.repeat(32)}`;
    const t = 1_800_000_000;
    const body = JSON.stringify({
      id: 'ob1',
      event: 'order.paid',
      created_at: '2026-10-06T00:00:00.000Z',
      data: { order_id: 'o-1', total_usd: '12.00' },
    });
    const fx = { secret, t, body, header: signPayload(secret, t, body) };
    writeFileSync(join(FIX, 'signature.json'), `${JSON.stringify(fx, null, 2)}\n`);
    expect(fx.header).toMatch(/^t=1800000000,v1=[0-9a-f]{64}$/);
  });

  it('WC5: the expected catalog JSON parses with the fleet zod schema', () => {
    const items = JSON.parse(readFileSync(join(FIX, 'catalog-expected.json'), 'utf8'));
    expect(items.length).toBeGreaterThanOrEqual(3);
    for (const it of items) {
      const r = CatalogItemSchema.safeParse(it);
      expect(r.success ? '' : JSON.stringify(r.error.issues)).toBe('');
    }
    const modes = items.map((i: { fulfillment_mode: string }) => i.fulfillment_mode).sort();
    expect(modes).toEqual(['merchant', 'physical', 'physical']);
    expect(items.some((i: { variants?: unknown[] }) => i.variants?.length)).toBe(true);
  });

  it('WC5: bundled allowed categories equal the fleet list', () => {
    const fleet = JSON.parse(
      readFileSync(join(ROOT, 'config/integrator/prohibited-categories.json'), 'utf8'),
    ).allowed;
    const bundled = JSON.parse(readFileSync(join(PKG, 'data/allowed-categories.json'), 'utf8'));
    expect(bundled).toEqual(fleet);
  });

  phpIt(
    'WC1: php -l on every file -> 0 errors',
    () => {
      const files = walk(PKG)
        .filter((f) => f.endsWith('.php'))
        .map((f) => f.slice(PKG.length + 1));
      expect(files.length).toBeGreaterThan(10);
      const bad: string[] = [];
      for (const f of files) {
        const r = php(['php', '-l', f]);
        if (r.status !== 0) bad.push(`${f}: ${r.out}`);
      }
      expect(bad).toEqual([]);
    },
    120_000,
  );

  phpIt(
    'WC2-WC7: tests/run.php passes',
    () => {
      const r = php(['php', 'tests/run.php']);
      expect(r.out).toMatch(/\d+ checks, 0 failed/);
      expect(r.status).toBe(0);
    },
    60_000,
  );

  it('WC8: readme.txt is GPLv2 or later and every .php has the license header', () => {
    expect(readFileSync(join(PKG, 'readme.txt'), 'utf8')).toContain('License: GPLv2 or later');
    expect(readFileSync(join(PKG, 'LICENSE'), 'utf8')).toContain('GNU GENERAL PUBLIC LICENSE');
    const missing = walk(PKG)
      .filter((f) => f.endsWith('.php'))
      .filter(
        (f) =>
          !/@license GPL-2\.0-or-later|License:\s+GPL-2\.0-or-later/.test(
            readFileSync(f, 'utf8').slice(0, 1500),
          ),
      );
    expect(missing).toEqual([]);
  });

  it('WC9: build-zip.sh makes a zip without tests/ and .git', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'woozip-')), 'woocommerce-apibase.zip');
    execFileSync('bash', [join(ROOT, 'scripts/woo/build-zip.sh'), out]);
    const names = execFileSync('python3', [
      '-I',
      '-c',
      'import sys,zipfile;print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))',
      out,
    ])
      .toString()
      .split('\n')
      .filter(Boolean);
    expect(names).toContain('woocommerce-apibase/apibase-ai-payment.php');
    expect(names).toContain('woocommerce-apibase/uninstall.php');
    expect(names.filter((n) => /\/tests\/|\/\.git(\/|$)/.test(n))).toEqual([]);
  });

  it('WC10: no forbidden phrases in the plugin texts or the platform page', () => {
    const forbidden = [
      'all agents already buy',
      'chatgpt buys from you',
      'instant refund',
      'buyer protection',
      'legal everywhere',
      'no kyc',
      'de facto',
      'standard',
      'connect to the mcp server',
    ];
    const files = walk(PKG)
      .filter((f) => !f.includes('/tests/') && !f.endsWith('LICENSE'))
      .concat(join(ROOT, 'static/integrator/platforms/woocommerce.md'));
    for (const f of files) {
      const low = readFileSync(f, 'utf8').toLowerCase();
      for (const p of forbidden) expect([f, low.includes(p)]).toEqual([f, false]);
    }
    expect(
      readFileSync(join(ROOT, 'static/integrator/platforms/woocommerce.md'), 'utf8'),
    ).not.toMatch(/<script/i);
  });
});
