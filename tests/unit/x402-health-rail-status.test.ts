/**
 * T-0372 — pure status rules for the Mode A (escrow) and MPP rail probes.
 */

jest.mock('../../src/config', () => ({ config: {} }));
jest.mock('../../src/services/cdp-jwt.service', () => ({ buildCdpAuthHeadersFn: jest.fn() }));
jest.mock('../../src/payments/operator-signer', () => ({
  getOperatorWallet: jest.fn(),
  weiToEth: jest.fn(),
}));
jest.mock('../../src/services/prisma.service', () => ({ getPrisma: jest.fn() }));

import { modeAStatus, mppStatus, MppStatusInput } from '../../src/jobs/x402-health.job';

describe('modeAStatus', () => {
  it.each([
    [5, 0, 1, 'red'],
    [0, 0, 1, 'red'],
    [3, 1, 0, 'green'],
    [0, 2, 0, 'orange'],
    [0, 0, 0, 'n/a'],
  ])('paid=%d refunded=%d stuck=%d -> %s', (paid, refunded, stuck, expected) => {
    expect(modeAStatus(paid, refunded, stuck)).toBe(expected);
  });
});

describe('mppStatus', () => {
  const base: MppStatusInput = {
    testnet: false,
    isProduction: true,
    fetchFailed: false,
    httpOk: true,
    chainId: 4217,
    expectedChainId: 4217,
    latencyMs: 300,
  };
  it.each([
    ['healthy', {}, 'green'],
    ['testnet in production', { testnet: true }, 'red'],
    ['testnet outside production', { testnet: true, isProduction: false }, 'green'],
    ['fetch threw', { fetchFailed: true, httpOk: false, chainId: null }, 'red'],
    ['non-2xx', { httpOk: false, chainId: null }, 'red'],
    ['chain id mismatch', { chainId: 1 }, 'orange'],
    ['chain id unparsed', { chainId: null }, 'orange'],
    ['slow', { latencyMs: 2001 }, 'orange'],
    ['exactly 2000 ms', { latencyMs: 2000 }, 'green'],
  ])('%s -> %s', (_name, patch, expected) => {
    expect(mppStatus({ ...base, ...(patch as Partial<MppStatusInput>) })).toBe(expected);
  });
});
