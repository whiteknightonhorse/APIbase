/**
 * T-0705: the worker logs the dispute key's ADDRESS at boot, never the key.
 */
jest.mock('../../src/config/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/config/x402.config', () => ({ getX402Config: jest.fn() }));
jest.mock('../../src/services/prisma.service', () => ({ getPrisma: jest.fn() }));
jest.mock('../../src/services/redis.service', () => ({ ensureRedisConnected: jest.fn() }));
jest.mock('../../src/payments/base-transport', () => ({ baseTransport: jest.fn() }));

import { privateKeyToAccount } from 'viem/accounts';
import { disputeBootLines, disputeKeyAddress } from '../../src/jobs/dispute-verdicts.job';

// Labelled test key, not a real one.
const TEST_KEY = '0x' + '11'.repeat(32);
const EXPECTED = privateKeyToAccount(TEST_KEY as `0x${string}`).address;

describe('T-0705: dispute key address at boot', () => {
  it('returns the address for a key and null for empty or malformed', () => {
    expect(disputeKeyAddress({ GL_DISPUTE_KEY: TEST_KEY })).toBe(EXPECTED);
    expect(disputeKeyAddress({ GL_DISPUTE_KEY: '' })).toBeNull();
    expect(disputeKeyAddress({ GL_DISPUTE_KEY: '0x1234' })).toBeNull();
  });

  it('boot lines carry the address and never the key', () => {
    const lines = disputeBootLines({ GL_DISPUTE_KEY: TEST_KEY });
    expect(lines[0]).toBe(`dispute lane: key present, address ${EXPECTED}`);
    expect(lines[1]).toBe('contracts: receipt unset, payment unset');
    expect(lines.join('\n')).not.toContain(TEST_KEY.slice(2));
    expect(disputeBootLines({ GL_DISPUTE_KEY: '', GL_DISPUTE_CONTRACT: '0x1' })).toEqual([
      'dispute lane: no GL_DISPUTE_KEY (reads only)',
      'contracts: receipt set, payment unset',
    ]);
  });
});
