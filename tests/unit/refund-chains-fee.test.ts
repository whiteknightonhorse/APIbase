/** T-0884: the Base fee probe must build with a parseable dummy signature; fee failures name their step. */
jest.mock('../../src/config/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/config/x402.config', () => ({ getX402Config: jest.fn() }));
jest.mock('../../src/config/mpp.config', () => ({ getMppConfig: jest.fn() }));
jest.mock('../../src/payments/operator-signer', () => ({ getOperatorWallet: jest.fn() }));
jest.mock('../../src/payments/operator-lock', () => ({ withOperatorLock: jest.fn() }));

import { getAddress, hexToBytes, parseTransaction, type Hex } from 'viem';
import { encodeTransferWithAuthorization } from '../../src/payments/local-facilitator';
import { baseFeeProbeTx, makeBaseChain } from '../../src/refunds/refund-chains';
import { FeeUnavailableError } from '../../src/refunds/refund-payout.core';
import { getX402Config } from '../../src/config/x402.config';
import { getOperatorWallet } from '../../src/payments/operator-signer';
import { logger } from '../../src/config/logger';

const ADDR = getAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
const ARGS = {
  from: ADDR,
  to: ADDR,
  value: 1n,
  validAfter: 0n,
  validBefore: 1n,
  nonce: ('0x' + '00'.repeat(32)) as Hex,
};

describe('T-0884 measure: old dummy signature', () => {
  it('130-hex signature ending 0x11 throws in parseSignature', () => {
    let msg = '';
    try {
      encodeTransferWithAuthorization(ARGS, '0x' + '11'.repeat(65));
    } catch (e) {
      msg = (e as Error).message;
    }
    console.log('MEASURE old dummy throws:', msg.slice(0, 120));
    expect(msg).toMatch(/Invalid yParityOrV/);
  });
});

describe('baseFeeProbeTx', () => {
  it('builds an eip1559 tx with 4 + 9*32 byte calldata', () => {
    const hex = baseFeeProbeTx(ADDR, ADDR, 8453, 1_000_000_000n, 10_000_000n);
    expect(hex.startsWith('0x02')).toBe(true);
    const tx = parseTransaction(hex);
    expect(hexToBytes(tx.data as Hex).length).toBe(4 + 9 * 32);
  });
});

describe('makeBaseChain().feeUsd', () => {
  const setup = (pub: Record<string, unknown>) => {
    (getX402Config as jest.Mock).mockReturnValue({ usdcAddress: ADDR, network: 'eip155:8453' });
    (getOperatorWallet as jest.Mock).mockReturnValue({ address: ADDR, signer: pub });
    process.env.REFUND_ETH_USD_FEED = ADDR;
  };
  it('returns a positive finite number', async () => {
    const readContract = jest.fn(async (a: { functionName: string }) => {
      if (a.functionName === 'latestRoundData') return [0n, 300000000000n, 0n, 0n, 0n];
      if (a.functionName === 'decimals') return 8;
      return 5_000_000_000_000n; // getL1Fee
    });
    const getFeeHistory = jest.fn(async () => ({
      baseFeePerGas: [1_000_000_000n, 1_000_000_000n],
      reward: [[10_000_000n]],
    }));
    setup({ readContract, getFeeHistory });
    const v = await makeBaseChain(ADDR).feeUsd();
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeGreaterThan(0);
  });
  it('names the failing step', async () => {
    const readContract = jest.fn(async (a: { functionName: string }) =>
      a.functionName === 'decimals' ? 8 : [0n, 300000000000n, 0n, 0n, 0n],
    );
    const getFeeHistory = jest.fn(async () => {
      throw new Error('rpc down');
    });
    setup({ readContract, getFeeHistory });
    const p = makeBaseChain(ADDR).feeUsd();
    await expect(p).rejects.toBeInstanceOf(FeeUnavailableError);
    await expect(p).rejects.toThrow(/\(fee_history\)$/);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ rail: 'base', step: 'fee_history' }),
      'refund base fee step failed',
    );
  });
});
