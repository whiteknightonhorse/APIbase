const mockWarn = jest.fn();
jest.mock('../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: (...a: unknown[]) => mockWarn(...a), info: jest.fn() },
}));
jest.mock('../../src/config/mpp.config', () => ({
  getMppConfig: () => ({ enabled: true, rpcUrl: 'https://rpc.invalid' }),
}));
jest.mock('../../src/pipeline/stages/tool-status.stage', () => ({ getToolPriceUsd: jest.fn() }));

const mockFromResponse = jest.fn();
jest.mock('mppx', () => ({
  Receipt: { fromResponse: (r: unknown) => mockFromResponse(r) },
}));
const mockGetTransaction = jest.fn();
jest.mock('viem', () => ({
  createPublicClient: () => ({ getTransaction: (a: unknown) => mockGetTransaction(a) }),
  http: jest.fn(),
}));

import { resolveRealPayer } from '../../src/middleware/mpp.middleware';

const FALLBACK = { payer: 'unknown-mpp-payer', txHash: 'unknown' };
const REF = '0x' + 'ab'.repeat(32);

function result() {
  return {
    status: 200,
    withReceipt: jest.fn(
      () => new Response(null, { headers: { 'Payment-Receipt': 'serialized' } }),
    ),
  };
}

describe('resolveRealPayer (T-0259)', () => {
  beforeEach(() => {
    mockWarn.mockReset();
    mockFromResponse.mockReset();
    mockGetTransaction.mockReset();
    // Real mppx reads the header off a Response; reject anything without .headers.get
    mockFromResponse.mockImplementation((r: { headers: { get(n: string): string | null } }) => {
      if (!r.headers.get('Payment-Receipt')) throw new Error('no receipt');
      return { reference: REF };
    });
  });

  it('P1: reads the receipt off result.withReceipt(Response) and returns tx.from', async () => {
    mockGetTransaction.mockResolvedValue({ from: '0xPAYER' });
    const r = result();
    const out = await resolveRealPayer(r);
    expect(r.withReceipt).toHaveBeenCalledTimes(1);
    const arg = mockFromResponse.mock.calls[0][0];
    expect(typeof arg.headers.get).toBe('function');
    expect(out).toEqual({ payer: '0xPAYER', txHash: REF });
  });

  it('P2: RPC failure → fallback and one warn', async () => {
    mockGetTransaction.mockRejectedValue(new Error('rpc down'));
    expect(await resolveRealPayer(result())).toEqual(FALLBACK);
    expect(mockWarn).toHaveBeenCalledTimes(1);
  });

  it('P3: reference without 0x → fallback, RPC never called', async () => {
    mockFromResponse.mockReturnValue({ reference: 'not-hex' });
    expect(await resolveRealPayer(result())).toEqual(FALLBACK);
    expect(mockGetTransaction).not.toHaveBeenCalled();
  });
});
