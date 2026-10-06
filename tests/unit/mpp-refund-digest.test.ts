/**
 * T-0280 (TG-POLICY-1006 / MPP-REFUND-DIGEST): internal-wallets loader is fail-closed,
 * and the digest/page decision logic in scripts/mpp-refund-owed-alerts.py passes its selftest.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isInternalWallet, parseInternalWallets } from '../../src/config/internal-wallets';

const ROOT = join(__dirname, '..', '..');

describe('internal-wallets (T-0280)', () => {
  it('ships 14 lowercase Heartbeat addresses', () => {
    const list = JSON.parse(
      readFileSync(join(ROOT, 'config/autopilot/internal-wallets.json'), 'utf-8'),
    ) as Array<{ address: string; label: string; source: string }>;
    expect(list).toHaveLength(14);
    for (const e of list) {
      expect(e.address).toMatch(/^0x[0-9a-f]{40}$/);
      expect(e.label).toBe('mcp-heartbeat');
    }
  });

  it('matches case-insensitively and rejects unknown / empty payers', () => {
    expect(isInternalWallet('0x6B414116D641D9AF479297DAF9892DE91F72B4CF')).toBe(true);
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

describe('mpp-refund-owed-alerts.py digest/page logic', () => {
  it('selftest passes', () => {
    const out = execFileSync('python3', ['scripts/mpp-refund-owed-alerts.py', '--selftest'], {
      cwd: ROOT,
    }).toString();
    expect(out).toContain('selftest ok');
  });
});
