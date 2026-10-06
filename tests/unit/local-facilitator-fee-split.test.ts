/**
 * T-INT-42: LocalFacilitatorClient.settleFeeSplit — one Multicall3 aggregate3 with
 * allowFailure=false. Mocked signer; zero real RPC or transactions.
 */
import { decodeFunctionData, parseAbi } from 'viem';
import { LocalFacilitatorClient } from '../../src/payments/local-facilitator';

jest.mock('../../src/config/index', () => ({
  config: {
    ENCRYPTION_KEY: 'k'.repeat(40),
    X402_NETWORK: 'base',
    X402_PAYMENT_ADDRESS: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
    X402_FACILITATOR_URL: 'https://facilitator.example',
    X402_FACILITATOR_MODE: 'local',
    X402_OPERATOR_PRIVATE_KEY: '0x00',
    X402_BASE_RPC_URL: 'https://base.example',
    X402_BASE_SEPOLIA_RPC_URL: 'https://sepolia.example',
    X402_OPERATOR_MIN_ETH_BALANCE: 0.01,
  },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
const MULTICALL3 = '0xca11bde05977b3631167028862be2a173976ca11';
const write = jest.fn();
const receipt = jest.fn();
jest.mock('../../src/payments/operator-signer', () => ({
  getOperatorWallet: () => ({
    address: '0x00000000000000000000000000000000000000a0',
    signer: {
      chain: { contracts: { multicall3: { address: MULTICALL3 } } },
      writeContract: (a: unknown) => write(a),
      waitForTransactionReceipt: (a: unknown) => receipt(a),
    },
  }),
}));
const lock = jest.fn((_a: string, fn: () => Promise<unknown>) => fn());
jest.mock('../../src/payments/operator-lock', () => ({
  withOperatorLock: (a: string, fn: () => Promise<unknown>) => lock(a, fn),
}));

const sig = `0x${'11'.repeat(32)}${'22'.repeat(32)}1b`;
const auth = (to: string, value: string, nonce: string) => ({
  from: '0x00000000000000000000000000000000000a11ce',
  to,
  value,
  validAfter: '0',
  validBefore: '9999999999',
  nonce: `0x${nonce.repeat(32)}`,
});
const A1 = auth('0x00000000000000000000000000000000000b0b0b', '87660000', 'aa');
const A2 = auth('0x00000000000000000000000000000000000fee0b', '1340000', 'bb');
const usdcAbi = parseAbi([
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)',
]);

describe('settleFeeSplit', () => {
  const fac = new LocalFacilitatorClient({} as never, '0xoperator');
  beforeEach(() => {
    write.mockReset().mockResolvedValue('0xhash');
    receipt.mockReset().mockResolvedValue({ status: 'success' });
    lock.mockClear();
  });

  it('one aggregate3 on the chain multicall3, two allowFailure=false calls, under the operator lock', async () => {
    const r = await fac.settleFeeSplit(A1, sig, A2, sig);
    expect(r).toMatchObject({ success: true, transaction: '0xhash' });
    expect(write).toHaveBeenCalledTimes(1);
    const c = write.mock.calls[0][0];
    expect(c.address).toBe(MULTICALL3);
    expect(c.functionName).toBe('aggregate3');
    expect(c.args[0]).toHaveLength(2);
    expect(c.args[0].map((x: any) => x.allowFailure)).toEqual([false, false]);
    const decoded = c.args[0].map((x: any) =>
      decodeFunctionData({ abi: usdcAbi, data: x.callData }),
    );
    expect(decoded.map((d: any) => d.functionName)).toEqual([
      'transferWithAuthorization',
      'transferWithAuthorization',
    ]);
    expect(decoded.map((d: any) => String(d.args[2]))).toEqual(['87660000', '1340000']);
    expect(lock).toHaveBeenCalledWith('0xoperator', expect.any(Function));
    expect(receipt.mock.calls[0][0]).toMatchObject({ hash: '0xhash', timeout: 30_000 });
  });

  it('a reverted receipt -> success:false with the reason', async () => {
    receipt.mockResolvedValue({ status: 'reverted' });
    expect(await fac.settleFeeSplit(A1, sig, A2, sig)).toMatchObject({
      success: false,
      errorReason: 'invalid_transaction_state',
      transaction: '0xhash',
    });
  });

  it('a receipt wait that expires -> transaction "" (reconcile decides)', async () => {
    receipt.mockRejectedValue(new Error('timeout'));
    expect(await fac.settleFeeSplit(A1, sig, A2, sig)).toMatchObject({
      success: true,
      transaction: '',
    });
  });

  it('a failed broadcast throws (nothing was sent, no PayAI fallback for this shape)', async () => {
    write.mockRejectedValue(new Error('rpc'));
    await expect(fac.settleFeeSplit(A1, sig, A2, sig)).rejects.toThrow('rpc');
  });
});
