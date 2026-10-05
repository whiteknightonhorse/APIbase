/** T-INT-19 CN1-CN8 (no database): mcp.json merchants/integrator block, sync-counts facts check. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildIntegratorBlock } from '../../src/shop/integrator/facts';
import { renderTokens } from '../../src/shop/integrator/tokens';
import { shopToolDefinitions } from '../../src/shop/tool-definitions';

jest.mock('../../src/config', () => ({ config: {} }));

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const MCP = 'static/.well-known/mcp.json';
const ACP_SHA256 = '5a9d25087f69d99de5c243eecb5cdf7da952cbb9c8d7de2e6363961ce98a9f5c';
const FACT_FILES = [
  MCP,
  'static/pricing.html',
  'static/llms.txt',
  'static/integrator/index.html',
  'static/integrator/index.md',
  'static/integrator/llms.txt',
];

function factsCheck(dir: string) {
  return spawnSync('python3', [join(ROOT, 'scripts/integrator-facts.py'), 'check'], {
    cwd: dir,
    encoding: 'utf8',
  });
}

function copyTree(): string {
  const dir = mkdtempSync(join(tmpdir(), 'int19-'));
  for (const f of FACT_FILES) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    cpSync(join(ROOT, f), join(dir, f));
  }
  return dir;
}

describe('T-INT-19', () => {
  it('CN1 mcp.json carries merchants_count and integrator.fee_pct', () => {
    const d = JSON.parse(read(MCP));
    expect(typeof d.merchants_count).toBe('number');
    expect(typeof d.integrator.fee_pct).toBe('number');
    expect(d.integrator.test_sku_usd).toBe(0.01);
    expect(Array.isArray(d.integrator.rails)).toBe(true);
  });

  it('CN1 fee off -> fee_pct 0 and fee_enabled false; on -> from BPS; rails by flags', () => {
    const off = buildIntegratorBlock({
      INTEGRATOR_FEE_ENABLED: 'false',
      INTEGRATOR_FEE_BPS: '150',
    });
    expect(off.fee_pct).toBe(0);
    expect(off.fee_enabled).toBe(false);
    const on = buildIntegratorBlock({
      INTEGRATOR_FEE_ENABLED: 'true',
      INTEGRATOR_FEE_BPS: '150',
      INTEGRATOR_BASE_ORDERS_ENABLED: 'true',
      MPP_ENABLED: 'true',
    });
    expect(on.fee_pct).toBe(1.5);
    expect(on.fee_enabled).toBe(true);
    expect(on.rails).toEqual(['base', 'tempo']);
    expect(on.min_order_usd).toBe(1);
    expect(on.fee_min_usd).toBe(0.05);
  });

  it('CN2 facts check passes on the tree; a hardcoded merchants count in /integrator fails', () => {
    expect(factsCheck(ROOT).status).toBe(0);
    const dir = copyTree();
    try {
      expect(factsCheck(dir).status).toBe(0);
      const p = join(dir, 'static/integrator/index.html');
      writeFileSync(p, readFileSync(p, 'utf8').replace('{{MERCHANTS_COUNT}}', '7'));
      const r = factsCheck(dir);
      expect(r.status).not.toBe(0);
      expect(r.stdout).toContain('MERCHANTS_COUNT');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('CN2 a stale rendered sentence in pricing.html fails', () => {
    const dir = copyTree();
    try {
      const p = join(dir, 'static/pricing.html');
      writeFileSync(p, readFileSync(p, 'utf8').replace('orders from $1.00', 'orders from $5.00'));
      expect(factsCheck(dir).status).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('CN3 no hardcoded 1.5% on the fact surfaces', () => {
    for (const f of ['static/integrator/index.html', 'static/pricing.html', 'static/llms.txt']) {
      expect(read(f)).not.toMatch(/1[.,]5 ?%/);
    }
  });

  it('CN4 fee off renders 0% (pilot) on /integrator and /pricing', () => {
    const saved = { ...process.env };
    process.env.INTEGRATOR_FEE_ENABLED = 'false';
    try {
      const page = renderTokens(read('static/integrator/index.html'));
      expect(page).toContain('0% (pilot)');
      expect(page).toContain('Комиссия 0 % в пилоте');
    } finally {
      process.env = saved;
    }
    expect(read('static/pricing.html')).toContain('0% (pilot)');
    expect(JSON.parse(read(MCP)).integrator.fee_enabled).toBe(false);
  });

  it('CN4b /integrator renders merchants_count from the baseline file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baseline-'));
    try {
      const p = join(dir, 'baseline.json');
      writeFileSync(p, JSON.stringify({ merchants_count: 42 }));
      const page = renderTokens(read('static/integrator/index.html'), p);
      expect(page).toContain('42');
      expect(page).not.toContain('{{MERCHANTS_COUNT}}');
      expect(renderTokens('{{MERCHANTS_COUNT}}', join(dir, 'missing.json'))).toBe('0');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('CN5 acp.json is untouched', () => {
    const sha = createHash('sha256')
      .update(readFileSync(join(ROOT, 'static/.well-known/acp.json')))
      .digest('hex');
    expect(sha).toBe(ACP_SHA256);
  });

  it('CN6 llms.txt links /integrator; x402 file has orders and the platform payTo', () => {
    expect(read('static/llms.txt')).toContain('https://apibase.pro/integrator');
    const x = JSON.parse(read('static/.well-known/x402-payment.json'));
    expect(x.orders).toBe('paid to the merchant wallet from the quote; see /integrator');
    expect(x.payTo).toBe('0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480');
  });

  it('CN7 docs/payments.md keeps the 0256 text and has Integrator orders', () => {
    const t = read('docs/payments.md');
    expect(t).toContain('binds the paid amount to the tool price');
    expect(t).toContain('## Integrator orders');
    expect(t).toContain('Settle before delivery');
  });

  it('CN8 tools_count = catalog + shop.* exactly once; merchants not included', async () => {
    const d = JSON.parse(read(MCP));
    const shop = (await shopToolDefinitions()).length;
    expect(d.shop_tools_count).toBe(shop);
    const catalog = read('scripts/discovery-snapshot.tsv').split('\n').filter(Boolean).length;
    expect(d.tools_count).toBe(catalog + shop);
  });
});
