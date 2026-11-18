/**
 * T-0280 (TG-POLICY-1006 / MPP-REFUND-DIGEST): internal-wallets loader is fail-closed,
 * and the page decision logic in scripts/refund-alerts.py passes its selftest.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isInternalWallet, parseInternalWallets } from '../../src/config/internal-wallets';

const ROOT = join(__dirname, '..', '..');

describe('internal-wallets (T-0280)', () => {
  it('ships 20 lowercase internal addresses', () => {
    const list = JSON.parse(
      readFileSync(join(ROOT, 'config/autopilot/internal-wallets.json'), 'utf-8'),
    ) as Array<{ address: string; label: string; source: string }>;
    expect(list).toHaveLength(20);
    expect(new Set(list.map((e) => e.address)).size).toBe(20);
    const tester = '0xe03d9423d06dd5e3300fb1c09a03ddbb5e8b274b';
    const shop = '0x03c545a6d6f1254e4bc4fb16dd6898863f0ea0a3';
    const checkShop = '0xd35f407eaadbde1626f36f13524d20652d8330d0';
    const teamShops = [
      '0x2aeb8466f84057ba094b46f68ff79118ae9de344',
      '0x04a17a77e17fa758ab043ce0d376cf9dcc72906e',
      '0x90263ae6a6dc42cea10f96660c7ebd3278425c9e',
    ];
    for (const e of list) {
      expect(e.address).toMatch(/^0x[0-9a-f]{40}$/);
      const want =
        e.address === tester
          ? 'mcp-protocol-tester'
          : e.address === shop || e.address === checkShop
            ? 'integrator-shop-test'
            : teamShops.includes(e.address)
              ? 'team-shop'
              : 'mcp-heartbeat';
      expect(e.label).toBe(want);
    }
  });

  it('lists the Integrator test-shop wallet (T-0881, PAYGRAPH-1114 ruling-3)', () => {
    expect(isInternalWallet('0x03C545A6d6f1254E4bC4fB16dD6898863f0ea0a3')).toBe(true);
    const list = JSON.parse(
      readFileSync(join(ROOT, 'config/autopilot/internal-wallets.json'), 'utf-8'),
    ) as Array<{ address: string; label: string }>;
    expect(
      list.find((e) => e.address === '0x03c545a6d6f1254e4bc4fb16dd6898863f0ea0a3')?.label,
    ).toBe('integrator-shop-test');
  });

  it('lists the check-0913-test shop wallet (T-0907, MS-1117-0903 ruling-1)', () => {
    expect(isInternalWallet('0xD35F407EAADBDE1626F36F13524D20652D8330D0')).toBe(true);
    const list = JSON.parse(
      readFileSync(join(ROOT, 'config/autopilot/internal-wallets.json'), 'utf-8'),
    ) as Array<{ address: string; label: string }>;
    expect(
      list.find((e) => e.address === '0xd35f407eaadbde1626f36f13524d20652d8330d0')?.label,
    ).toBe('integrator-shop-test');
  });

  it('lists the three team-shop wallets (T-0908, MS-1117-0903 ruling-2)', () => {
    const list = JSON.parse(
      readFileSync(join(ROOT, 'config/autopilot/internal-wallets.json'), 'utf-8'),
    ) as Array<{ address: string; label: string }>;
    for (const a of [
      '0x2aeb8466f84057ba094b46f68ff79118ae9de344',
      '0x04a17a77e17fa758ab043ce0d376cf9dcc72906e',
      '0x90263ae6a6dc42cea10f96660c7ebd3278425c9e',
    ]) {
      expect(isInternalWallet(a.toUpperCase().replace('0X', '0x'))).toBe(true);
      expect(list.find((e) => e.address === a)?.label).toBe('team-shop');
    }
  });

  it('matches case-insensitively and rejects unknown / empty payers', () => {
    expect(isInternalWallet('0x6B414116D641D9AF479297DAF9892DE91F72B4CF')).toBe(true);
    expect(isInternalWallet('0xE2D8DC842FC5037C99C332BD57BAABA3649F66C2')).toBe(true);
    expect(isInternalWallet('0x' + '1'.repeat(40))).toBe(false);
    expect(isInternalWallet('unknown-mpp-payer')).toBe(false);
    expect(isInternalWallet(undefined)).toBe(false);
  });

  it('fails closed on malformed input', () => {
    expect(() => parseInternalWallets('{}')).toThrow();
    expect(() => parseInternalWallets('[{"address":"0xABC","label":"x","source":"y"}]')).toThrow();
    expect(() => parseInternalWallets('[{"address":"0x' + 'a'.repeat(40) + '"}]')).toThrow();
    expect(() => parseInternalWallets('not json')).toThrow();
  });
});

describe('refund-alerts.py page logic', () => {
  it('selftest passes', () => {
    const out = execFileSync('python3', ['scripts/refund-alerts.py', '--selftest'], {
      cwd: ROOT,
    }).toString();
    expect(out).toContain('selftest ok');
  });
});
