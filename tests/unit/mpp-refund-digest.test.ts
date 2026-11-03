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
  it('ships 15 lowercase Heartbeat addresses', () => {
    const list = JSON.parse(
      readFileSync(join(ROOT, 'config/autopilot/internal-wallets.json'), 'utf-8'),
    ) as Array<{ address: string; label: string; source: string }>;
    expect(list).toHaveLength(15);
    for (const e of list) {
      expect(e.address).toMatch(/^0x[0-9a-f]{40}$/);
      const tester = '0xe03d9423d06dd5e3300fb1c09a03ddbb5e8b274b';
      expect(e.label).toBe(e.address === tester ? 'mcp-protocol-tester' : 'mcp-heartbeat');
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
