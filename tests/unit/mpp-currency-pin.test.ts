/**
 * T-0426: the challenge advertises exactly ONE currency, cfg.usdcAddress, never another Tempo token.
 * Challenges are built by the REAL mppx in a tsx child (helpers/mpp-chain-id.child.ts).
 * Tempo tokens mppx ships (node_modules/mppx/dist/tempo/internal/defaults.js): OUSD, USDC.e and
 * pathUSD from `viem/tokens`, plus the machine-token deployment from `machineTokenDeployments`.
 */
import { execFileSync } from 'child_process';
import path from 'path';

const root = path.resolve(__dirname, '../..');
const MAINNET_USDCE = '0x20c000000000000000000000b9537d11c60e8b50';
const TESTNET_PATHUSD = '0x20c0000000000000000000000000000000000000';

function child(testnet: boolean): { request: Record<string, unknown> } {
  const out = execFileSync(
    path.join(root, 'node_modules/.bin/tsx'),
    [path.join(__dirname, 'helpers/mpp-chain-id.child.ts'), String(testnet)],
    { cwd: root, encoding: 'utf8', timeout: 90000, stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const r = JSON.parse(out.split('RESULT')[1]);
  expect(r.crashed).toBeUndefined();
  return r;
}

/** Every Tempo token address mppx ships (machine token deployments) as lowercase strings. */
function otherTempoTokens(): string[] {
  const out = execFileSync(
    path.join(root, 'node_modules/.bin/tsx'),
    [
      '--input-type=module',
      '-e',
      `import { machineTokenDeployments } from 'mppx/tempo';
import { ousd, usdce, pathusd } from 'viem/tokens';
const found = new Set([ousd(4217).address, usdce(4217).address, pathusd(4217).address].map((a) => a.toLowerCase()));
const walk = (v) => { if (typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v)) found.add(v.toLowerCase());
  else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
walk(machineTokenDeployments);
console.log('RESULT' + JSON.stringify([...found]));`,
    ],
    { cwd: root, encoding: 'utf8', timeout: 60000 },
  );
  return JSON.parse(out.split('RESULT')[1]);
}

describe('MPP currency pin (T-0426)', () => {
  const tokens = otherTempoTokens();

  it('mainnet: the one advertised currency is USDC.e and no other mppx Tempo token', () => {
    const { request } = child(false);
    expect(typeof request['currency']).toBe('string');
    expect((request['currency'] as string).toLowerCase()).toBe(MAINNET_USDCE);
    expect(request['currencies']).toBeUndefined();
    for (const t of tokens.filter((x) => x !== MAINNET_USDCE)) {
      expect(JSON.stringify(request).toLowerCase()).not.toContain(t);
    }
  }, 100000);

  it('testnet: the one advertised currency is pathUSD', () => {
    const { request } = child(true);
    expect((request['currency'] as string).toLowerCase()).toBe(TESTNET_PATHUSD);
    for (const t of tokens.filter((x) => x !== TESTNET_PATHUSD)) {
      expect(JSON.stringify(request).toLowerCase()).not.toContain(t);
    }
  }, 100000);
});
