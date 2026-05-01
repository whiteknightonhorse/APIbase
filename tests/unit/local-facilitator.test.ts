// Stub the operator-lock so we don't hit Redis in unit tests.
jest.mock('../../src/payments/operator-lock', () => ({
  withOperatorLock: <T>(_addr: string, fn: () => Promise<T>) => fn(),
}));

// Stub the operator-signer to avoid loading config/x402.config and zod env
// validation in the test environment (no DATABASE_URL etc.).
jest.mock('../../src/payments/operator-signer', () => ({
  getOperatorWallet: jest.fn(),
}));

// Stub config/x402 so buildLocalFacilitatorClient (not exercised here, but
// reachable via module-level imports) doesn't try to read a frozen config.
jest.mock('../../src/config/x402.config', () => ({
  getX402Config: () => ({
    network: 'eip155:8453',
    facilitatorUrl: 'https://x402.org/facilitator',
  }),
}));

// Stub metrics — verify counter calls below.
jest.mock('../../src/services/metrics.service', () => ({
  x402LocalSettleTotal: { inc: jest.fn() },
  x402LocalSettleDurationSeconds: { observe: jest.fn() },
  x402OperatorEthBalance: { set: jest.fn() },
}));

// Stub the project logger so importing the module doesn't try to write to
// stdout via Pino (also avoids pulling config/index → env validation).
jest.mock('../../src/config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { LocalFacilitatorClient } from '../../src/payments/local-facilitator';
import type { FacilitatorClient } from '@x402/core/server';
import type {
  PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
  SupportedResponse,
} from '@x402/core/types';

import {
  x402LocalSettleTotal,
  x402LocalSettleDurationSeconds,
} from '../../src/services/metrics.service';

const PAYLOAD = { x402Version: 2 } as unknown as PaymentPayload;
const REQUIREMENTS = {
  scheme: 'exact',
  network: 'eip155:8453',
  asset: '0xUSDC',
  amount: '1000',
  payTo: '0xPayTo',
  maxTimeoutSeconds: 30,
  extra: {},
} as unknown as PaymentRequirements;

function makeLocalStub(opts: {
  verifyResult?: VerifyResponse;
  verifyThrows?: Error;
  settleResult?: SettleResponse;
  settleThrows?: Error;
}): {
  verify: jest.Mock;
  settle: jest.Mock;
  getSupported: jest.Mock;
} {
  return {
    verify: jest.fn().mockImplementation(async () => {
      if (opts.verifyThrows) throw opts.verifyThrows;
      return opts.verifyResult ?? { isValid: true, payer: '0xPayer' };
    }),
    settle: jest.fn().mockImplementation(async () => {
      if (opts.settleThrows) throw opts.settleThrows;
      return (
        opts.settleResult ?? {
          success: true,
          transaction: '0xtx',
          network: 'eip155:8453',
          payer: '0xPayer',
        }
      );
    }),
    getSupported: jest.fn().mockResolvedValue({
      kinds: [{ x402Version: 2, scheme: 'exact', network: 'eip155:8453' }],
      extensions: [],
      signers: {},
    } as SupportedResponse),
  };
}

function makeRemoteStub(): jest.Mocked<FacilitatorClient> {
  return {
    verify: jest.fn().mockResolvedValue({ isValid: true, payer: '0xRemote' } as VerifyResponse),
    settle: jest.fn().mockResolvedValue({
      success: true,
      transaction: '0xremote',
      network: 'eip155:8453',
      payer: '0xRemote',
    } as SettleResponse),
    getSupported: jest.fn().mockResolvedValue({
      kinds: [],
      extensions: [],
      signers: {},
    } as SupportedResponse),
  };
}

beforeEach(() => {
  (x402LocalSettleTotal.inc as jest.Mock).mockClear();
  (x402LocalSettleDurationSeconds.observe as jest.Mock).mockClear();
});

describe('LocalFacilitatorClient', () => {
  test('verify delegates to local facilitator on happy path', async () => {
    const local = makeLocalStub({ verifyResult: { isValid: true, payer: '0xPayer' } });
    const client = new LocalFacilitatorClient(local as never, '0xOperator');
    const result = await client.verify(PAYLOAD, REQUIREMENTS);
    expect(result.isValid).toBe(true);
    expect(result.payer).toBe('0xPayer');
    expect(local.verify).toHaveBeenCalledTimes(1);
  });

  test('verify falls back to remote when local throws', async () => {
    const local = makeLocalStub({ verifyThrows: new Error('local rpc down') });
    const remote = makeRemoteStub();
    const client = new LocalFacilitatorClient(local as never, '0xOperator', remote);
    const result = await client.verify(PAYLOAD, REQUIREMENTS);
    expect(result.payer).toBe('0xRemote');
    expect(remote.verify).toHaveBeenCalledTimes(1);
  });

  test('verify rethrows when local throws and no fallback configured', async () => {
    const local = makeLocalStub({ verifyThrows: new Error('local rpc down') });
    const client = new LocalFacilitatorClient(local as never, '0xOperator');
    await expect(client.verify(PAYLOAD, REQUIREMENTS)).rejects.toThrow('local rpc down');
  });

  test('settle returns local result and increments success counter', async () => {
    const local = makeLocalStub({});
    const client = new LocalFacilitatorClient(local as never, '0xOperator');
    const result = await client.settle(PAYLOAD, REQUIREMENTS);
    expect(result.success).toBe(true);
    expect(result.transaction).toBe('0xtx');
    expect(x402LocalSettleTotal.inc).toHaveBeenCalledWith({ result: 'success' });
    expect(x402LocalSettleDurationSeconds.observe).toHaveBeenCalled();
  });

  test('settle increments error counter when local returns success=false', async () => {
    const local = makeLocalStub({
      settleResult: {
        success: false,
        errorReason: 'insufficient_funds',
        transaction: '',
        network: 'eip155:8453',
      } as SettleResponse,
    });
    const client = new LocalFacilitatorClient(local as never, '0xOperator');
    const result = await client.settle(PAYLOAD, REQUIREMENTS);
    expect(result.success).toBe(false);
    expect(x402LocalSettleTotal.inc).toHaveBeenCalledWith({ result: 'error' });
  });

  test('settle falls back to remote when local throws and increments fallback counter', async () => {
    const local = makeLocalStub({ settleThrows: new Error('chain stalled') });
    const remote = makeRemoteStub();
    const client = new LocalFacilitatorClient(local as never, '0xOperator', remote);
    const result = await client.settle(PAYLOAD, REQUIREMENTS);
    expect(result.transaction).toBe('0xremote');
    expect(remote.settle).toHaveBeenCalledTimes(1);
    expect(x402LocalSettleTotal.inc).toHaveBeenCalledWith({ result: 'fallback' });
  });

  test('settle rethrows when local throws and no fallback configured (counter=error)', async () => {
    const local = makeLocalStub({ settleThrows: new Error('chain stalled') });
    const client = new LocalFacilitatorClient(local as never, '0xOperator');
    await expect(client.settle(PAYLOAD, REQUIREMENTS)).rejects.toThrow('chain stalled');
    expect(x402LocalSettleTotal.inc).toHaveBeenCalledWith({ result: 'error' });
  });

  test('getSupported delegates to local facilitator', async () => {
    const local = makeLocalStub({});
    const client = new LocalFacilitatorClient(local as never, '0xOperator');
    const result = await client.getSupported();
    expect(result.kinds).toHaveLength(1);
    expect(local.getSupported).toHaveBeenCalledTimes(1);
  });
});
