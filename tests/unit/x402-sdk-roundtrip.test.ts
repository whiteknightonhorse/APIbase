/**
 * T-0859: real-SDK verify/settle round trip for the x402 rail, pinned before and after a bump.
 *
 * No @x402 package is mocked and nothing touches the network: the payer key is generated here,
 * the facilitator signer is a stub object whose verifyTypedData is viem's real implementation,
 * and the chain answers (getCode, readContract, writeContract, receipt) are scripted per case.
 * Only our own operator lock, metrics, logger and config modules are stubbed.
 *
 * Every SDK string our code reads or classifies on is recorded below. Two strings changed on
 * purpose in @x402 2.30.0 (changelog entries 70303ce and 3c0a740); they are keyed by the
 * installed minor so the same file is green on 2.29.0 and 2.30.0, and any other drift is red.
 */
jest.mock('../../src/payments/operator-lock', () => ({
  withOperatorLock: <T>(_addr: string, fn: () => Promise<T>) => fn(),
}));
jest.mock('../../src/payments/operator-signer', () => ({ getOperatorWallet: jest.fn() }));
jest.mock('../../src/config/x402.config', () => ({
  getX402Config: () => ({ network: 'eip155:8453', facilitatorUrl: 'http://127.0.0.1:9' }),
}));
jest.mock('../../src/services/metrics.service', () => ({
  x402LocalSettleTotal: { inc: jest.fn() },
  x402LocalSettleDurationSeconds: { observe: jest.fn() },
  x402OperatorEthBalance: { set: jest.fn() },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyTypedData, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { ExactEvmScheme } from '@x402/evm';
import { registerExactEvmScheme as registerFacilitatorScheme } from '@x402/evm/exact/facilitator';
import { registerExactEvmScheme as registerServerScheme } from '@x402/evm/exact/server';
import { x402Facilitator } from '@x402/core/facilitator';
import { x402ResourceServer } from '@x402/core/server';
import { decodePaymentSignatureHeader, encodePaymentSignatureHeader } from '@x402/core/http';
import { parsePaymentPayload } from '@x402/core/schemas';
import type { PaymentPayload, PaymentRequirements } from '@x402/core/types';
import { MCP_PAYMENT_META_KEY, MCP_PAYMENT_RESPONSE_META_KEY } from '@x402/mcp';
import { LocalFacilitatorClient } from '../../src/payments/local-facilitator';
import { settleOutcomeIsUnknown, UNKNOWN_THROWN_RE } from '../../src/payments/settle-outcome';

const ROOT = join(__dirname, '..', '..');
const sdkMinor = (pkg: string): string =>
  (
    JSON.parse(readFileSync(join(ROOT, 'node_modules', '@x402', pkg, 'package.json'), 'utf8')) as {
      version: string;
    }
  ).version
    .split('.')
    .slice(0, 2)
    .join('.');

/** Recorded on 2.29.0 (baseline) and 2.30.0. */
const RECORDED = {
  amountBelow: 'invalid_exact_evm_payload_authorization_value_mismatch',
  payToMismatch: 'invalid_exact_evm_recipient_mismatch',
  validBeforePast: 'invalid_exact_evm_payload_authorization_valid_before',
  revertedReceipt: 'invalid_exact_evm_transaction_failed',
  writeContractThrew: 'invalid_exact_evm_transaction_failed',
} as const;
/** v1 exact networks the facilitator advertises (registerV1 in registerExactEvmScheme). */
const RECORDED_V1_NETWORKS = [
  'ethereum',
  'sepolia',
  'abstract',
  'abstract-testnet',
  'base-sepolia',
  'base',
  'avalanche-fuji',
  'avalanche',
  'iotex',
  'sei',
  'sei-testnet',
  'polygon',
  'polygon-amoy',
  'peaq',
  'story',
  'educhain',
  'skale-base-sepolia',
  'megaeth',
  'monad',
  'monad-testnet',
  'stable',
  'stable-testnet',
  'celo',
  'flare',
];
/** 70303ce (@x402/evm 2.30.0): malformed EIP-3009 payload reason renamed. */
const MALFORMED_PAYLOAD_REASON: Record<string, string> = {
  '2.29': 'invalid_payload',
  '2.30': 'invalid_exact_evm_payload',
};
/** 3c0a740 (@x402/core 2.30.0): a header that decodes to non-object JSON now throws. */
const NON_OBJECT_HEADER_THROWS: Record<string, boolean> = { '2.29': false, '2.30': true };

const BASE = 'eip155:8453';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const PAY_TO = '0x1111111111111111111111111111111111111111';
const OPERATOR = '0x2222222222222222222222222222222222222222';
const TX = ('0x' + 'ab'.repeat(32)) as Hex;

const requirement = (over: Partial<PaymentRequirements> = {}): PaymentRequirements =>
  ({
    scheme: 'exact',
    network: BASE,
    amount: '1000',
    asset: USDC,
    payTo: PAY_TO,
    maxTimeoutSeconds: 60,
    extra: { name: 'USD Coin', version: '2' },
    ...over,
  }) as PaymentRequirements;

const payer = privateKeyToAccount(generatePrivateKey());

async function signPayload(req: PaymentRequirements): Promise<PaymentPayload> {
  const scheme = new ExactEvmScheme(payer as never);
  const res = await scheme.createPaymentPayload(2, req as never);
  return { x402Version: 2, accepted: req, payload: res.payload } as PaymentPayload;
}

type Receipt = { status: 'success' | 'reverted'; logs?: unknown[] };
function stubSigner(opts: { write?: () => Promise<Hex>; receipt?: () => Promise<Receipt> } = {}) {
  const calls: string[] = [];
  return {
    calls,
    getAddresses: () => [OPERATOR],
    getCode: async ({ address }: { address: string }) => {
      calls.push(`getCode:${address.toLowerCase() === USDC.toLowerCase() ? 'asset' : 'payer'}`);
      return address.toLowerCase() === USDC.toLowerCase() ? ('0x6080' as Hex) : undefined;
    },
    readContract: async (p: { functionName: string }) => {
      calls.push(`readContract:${p.functionName}`);
      return undefined;
    },
    verifyTypedData: (args: Parameters<typeof verifyTypedData>[0]) => verifyTypedData(args),
    writeContract: jest.fn(async (p: { functionName: string }) => {
      calls.push(`writeContract:${p.functionName}`);
      return opts.write ? opts.write() : TX;
    }),
    sendTransaction: jest.fn(async () => TX),
    waitForTransactionReceipt: jest.fn(async () =>
      opts.receipt ? opts.receipt() : ({ status: 'success' } as Receipt),
    ),
  };
}

function facilitatorWith(signer: ReturnType<typeof stubSigner>): x402Facilitator {
  // Built as buildLocalFacilitatorClient does (src/payments/local-facilitator.ts).
  const f = new x402Facilitator();
  registerFacilitatorScheme(f, {
    signer: signer as unknown as Parameters<typeof registerFacilitatorScheme>[1]['signer'],
    networks: BASE as `${string}:${string}`,
  });
  return f;
}

describe('T-0859: @x402 real-SDK round trip (exact, Base USDC)', () => {
  it('(a) client signs; encode -> decode -> parsePaymentPayload keeps the authorization', async () => {
    const req = requirement();
    const p = await signPayload(req);
    const header = encodePaymentSignatureHeader(p);
    const parsed = parsePaymentPayload(decodePaymentSignatureHeader(header));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const auth = (parsed.data.payload as { authorization: Record<string, string> }).authorization;
    expect(auth).toEqual((p.payload as { authorization: unknown }).authorization);
    expect(auth.from.toLowerCase()).toBe(payer.address.toLowerCase());
    expect(auth.to.toLowerCase()).toBe(PAY_TO.toLowerCase());
    expect(auth.value).toBe('1000');
    expect((parsed.data as { accepted?: unknown }).accepted).toEqual(req);
  });

  it('(b) verify: valid payload passes; three refusals carry the recorded invalidReason', async () => {
    const f = facilitatorWith(stubSigner());
    const req = requirement();
    const ok = await f.verify(await signPayload(req), req);
    expect(ok.isValid).toBe(true);
    expect(ok.payer?.toLowerCase()).toBe(payer.address.toLowerCase());

    const low = await signPayload(requirement({ amount: '999' }));
    const r1 = await f.verify({ ...low, accepted: req } as PaymentPayload, req);
    expect([r1.isValid, r1.invalidReason]).toEqual([false, RECORDED.amountBelow]);

    const other = await signPayload(requirement({ payTo: OPERATOR }));
    const r2 = await f.verify({ ...other, accepted: req } as PaymentPayload, req);
    expect([r2.isValid, r2.invalidReason]).toEqual([false, RECORDED.payToMismatch]);

    // Signed with validBefore an hour in the past (the client sets validBefore = now + maxTimeout).
    const stale = await signPayload(requirement({ maxTimeoutSeconds: -3600 }));
    const sa = (stale.payload as { authorization: Record<string, string> }).authorization;
    expect(Number(sa.validBefore)).toBeLessThan(Math.floor(Date.now() / 1000));
    const r3 = await f.verify({ ...stale, accepted: req } as PaymentPayload, req);
    expect([r3.isValid, r3.invalidReason]).toEqual([false, RECORDED.validBeforePast]);
  });

  it('(b2) 70303ce: a malformed EIP-3009 payload is refused with the recorded reason', async () => {
    const f = facilitatorWith(stubSigner());
    const req = requirement();
    const bad = { x402Version: 2, accepted: req, payload: { signature: '0x' } } as PaymentPayload;
    const r = await f.verify(bad, req);
    expect(r.isValid).toBe(false);
    // Our code only logs this reason (escrow.stage.ts reject); no branch reads it.
    expect(r.invalidReason).toBe(MALFORMED_PAYLOAD_REASON[sdkMinor('evm')]);
  });

  it('(c) settle through LocalFacilitatorClient: success, reverted, writeContract threw', async () => {
    const req = requirement();

    const okSigner = stubSigner();
    const ok = await new LocalFacilitatorClient(facilitatorWith(okSigner), OPERATOR).settle(
      await signPayload(req),
      req,
    );
    expect(ok.success).toBe(true);
    expect(ok.transaction).toBe(TX);
    expect(okSigner.writeContract).toHaveBeenCalledTimes(1);

    const revSigner = stubSigner({ receipt: async () => ({ status: 'reverted' }) });
    const rev = await new LocalFacilitatorClient(facilitatorWith(revSigner), OPERATOR).settle(
      await signPayload(req),
      req,
    );
    expect(rev.success).toBe(false);
    expect(rev.errorReason).toBe(RECORDED.revertedReceipt);
    expect(rev.transaction).toBe(TX);
    // T-0883: the same bare reason WITH a hash (reverted receipt) is known failed.
    expect(
      settleOutcomeIsUnknown(rev.errorReason, rev.errorMessage, { transaction: rev.transaction }),
    ).toBe('failed');

    // EIP-3009 settle catches the broadcast throw itself (parseEip3009TransferError) and returns
    // the BARE reason with the thrown text in errorMessage, not the `: <message>` suffix that
    // UNKNOWN_THROWN_RE matches (that suffix is mapSettleError, the Permit2 path). T-0883: bare
    // reason and no hash = threw before a hash existed, the tx may have landed -> 'pending'.
    const thrSigner = stubSigner({
      write: async () => {
        throw new Error('request timed out');
      },
    });
    const thr = await new LocalFacilitatorClient(facilitatorWith(thrSigner), OPERATOR).settle(
      await signPayload(req),
      req,
    );
    expect(thr.success).toBe(false);
    expect(thr.errorReason).toBe(RECORDED.writeContractThrew);
    expect(thr.errorMessage).toBe('request timed out');
    expect(thr.transaction).toBe('');
    expect(UNKNOWN_THROWN_RE.test(thr.errorReason ?? '')).toBe(false);
    expect(
      settleOutcomeIsUnknown(thr.errorReason, thr.errorMessage, { transaction: thr.transaction }),
    ).toBe('pending');
  });

  it('(c2) c349511: x402ResourceServer.settlePayment over the local client, no hooks', async () => {
    const req = requirement();
    const server = new x402ResourceServer([
      new LocalFacilitatorClient(facilitatorWith(stubSigner()), OPERATOR),
    ]);
    registerServerScheme(server);
    await server.initialize();
    const p = await signPayload(req);
    const v = await server.verifyPayment(p, req);
    expect(v.isValid).toBe(true);
    const s = await server.settlePayment(p, req);
    expect([s.success, s.transaction]).toEqual([true, TX]);
  });

  it('(d) getSupported: one v2 kind (exact eip155:8453) plus the SDK-registered v1 exact kinds', async () => {
    const sup = await new LocalFacilitatorClient(
      facilitatorWith(stubSigner()),
      OPERATOR,
    ).getSupported();
    const v2 = sup.kinds.filter((k) => k.x402Version === 2);
    expect(v2).toEqual([{ x402Version: 2, scheme: 'exact', network: BASE }]);
    // registerExactEvmScheme (facilitator) also calls registerV1(NETWORKS, ...) for every EVM
    // network the SDK knows. Recorded on 2.29.0; any change to this list is a finding.
    const v1 = sup.kinds.filter((k) => k.x402Version === 1);
    expect(v1.every((k) => k.scheme === 'exact')).toBe(true);
    expect(v1.map((k) => k.network)).toEqual(RECORDED_V1_NETWORKS);
    expect(sup.kinds).toHaveLength(1 + RECORDED_V1_NETWORKS.length);
  });

  it('(e) server registers exact for Base and Base Sepolia; MCP meta keys', () => {
    const server = new x402ResourceServer([]);
    registerServerScheme(server);
    expect(server.hasRegisteredScheme('eip155:8453', 'exact')).toBe(true);
    expect(server.hasRegisteredScheme('eip155:84532', 'exact')).toBe(true);
    expect(MCP_PAYMENT_META_KEY).toBe('x402/payment');
    expect(MCP_PAYMENT_RESPONSE_META_KEY).toBe('x402/payment-response');
  });

  it('(f) 3c0a740: a non-object header is never accepted by decode + parsePaymentPayload', () => {
    const header = Buffer.from('123').toString('base64');
    let threw = false;
    let accepted = false;
    try {
      accepted = parsePaymentPayload(decodePaymentSignatureHeader(header)).success;
    } catch {
      threw = true;
    }
    expect(accepted).toBe(false);
    // x402.middleware.ts: a throw -> 400 'Invalid x402 payment header'; a parse failure -> 400
    // 'Invalid x402 payment payload'. Same status and code either way.
    expect(threw).toBe(NON_OBJECT_HEADER_THROWS[sdkMinor('core')]);
  });
});
