import { x402Facilitator } from '@x402/core/facilitator';
import { registerExactEvmScheme } from '@x402/evm/exact/facilitator';
import { HTTPFacilitatorClient, type FacilitatorClient } from '@x402/core/server';
import type {
  PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
  SupportedResponse,
} from '@x402/core/types';
import {
  encodeFunctionData,
  getAddress,
  multicall3Abi,
  parseAbi,
  parseSignature,
  type Hex,
} from 'viem';
import { getOperatorWallet } from './operator-signer';
import { withOperatorLock } from './operator-lock';
import { getX402Config } from '../config/x402.config';
import { logger } from '../config/logger';
import { x402LocalSettleTotal, x402LocalSettleDurationSeconds } from '../services/metrics.service';

/**
 * Local x402 facilitator client.
 *
 * Implements `FacilitatorClient` (the SDK's HTTP-shaped interface) but
 * delegates to an in-process `x402Facilitator` registered with the EVM exact
 * scheme. That gives us EIP-3009 verify + settle without any HTTP hop.
 *
 * Settle is serialized through a Redis lock per operator address to prevent
 * cross-container nonce races.
 *
 * Optional `remoteFallback` is invoked when local verify/settle throws, so a
 * transient RPC outage or unhandled SDK edge case does not stop revenue. The
 * fallback is the existing PayAI HTTP facilitator (already configured).
 */
/** One EIP-3009 authorization as signed by the payer (T-INT-42 fee-split). */
export interface Eip3009Authorization {
  from: string;
  to: string;
  value: string | bigint;
  validAfter: string | bigint;
  validBefore: string | bigint;
  nonce: string;
}

const usdcTransferAbi = parseAbi([
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)',
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature)',
]);

/** Receipt wait for the Multicall3 settle; on expiry the result is `transaction: ""` (as the SDK). */
const FEE_SPLIT_RECEIPT_TIMEOUT_MS = 30_000;

function encodeTransferWithAuthorization(a: Eip3009Authorization, signature: string): Hex {
  const common = [
    getAddress(a.from),
    getAddress(a.to),
    BigInt(a.value),
    BigInt(a.validAfter),
    BigInt(a.validBefore),
    a.nonce as Hex,
  ] as const;
  const bare = signature.startsWith('0x') ? signature.length - 2 : signature.length;
  if (bare === 130) {
    const sig = parseSignature(signature as Hex);
    return encodeFunctionData({
      abi: usdcTransferAbi,
      functionName: 'transferWithAuthorization',
      args: [...common, Number(sig.v ?? BigInt(27 + sig.yParity)), sig.r, sig.s],
    });
  }
  return encodeFunctionData({
    abi: usdcTransferAbi,
    functionName: 'transferWithAuthorization',
    args: [...common, signature as Hex],
  });
}

export class LocalFacilitatorClient implements FacilitatorClient {
  private readonly localFacilitator: x402Facilitator;
  private readonly operatorAddress: string;
  private readonly remoteFallback: FacilitatorClient | undefined;

  constructor(
    localFacilitator: x402Facilitator,
    operatorAddress: string,
    remoteFallback?: FacilitatorClient,
  ) {
    this.localFacilitator = localFacilitator;
    this.operatorAddress = operatorAddress;
    this.remoteFallback = remoteFallback;
  }

  async verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    try {
      return await this.localFacilitator.verify(paymentPayload, paymentRequirements);
    } catch (err) {
      logger.warn(
        { err: errMsg(err), operator: this.operatorAddress },
        'x402 local verify threw — attempting fallback',
      );
      if (this.remoteFallback) {
        return this.remoteFallback.verify(paymentPayload, paymentRequirements);
      }
      throw err;
    }
  }

  async settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const start = performance.now();
    try {
      const result = await withOperatorLock(this.operatorAddress, () =>
        this.localFacilitator.settle(paymentPayload, paymentRequirements),
      );
      const outcome = result.success ? 'success' : 'error';
      x402LocalSettleTotal.inc({ result: outcome });
      x402LocalSettleDurationSeconds.observe(
        { result: outcome },
        (performance.now() - start) / 1000,
      );
      return result;
    } catch (err) {
      logger.warn(
        { err: errMsg(err), operator: this.operatorAddress },
        'x402 local settle threw — attempting fallback',
      );
      if (this.remoteFallback) {
        x402LocalSettleTotal.inc({ result: 'fallback' });
        x402LocalSettleDurationSeconds.observe(
          { result: 'fallback' },
          (performance.now() - start) / 1000,
        );
        return this.remoteFallback.settle(paymentPayload, paymentRequirements);
      }
      x402LocalSettleTotal.inc({ result: 'error' });
      x402LocalSettleDurationSeconds.observe(
        { result: 'error' },
        (performance.now() - start) / 1000,
      );
      throw err;
    }
  }

  /**
   * T-INT-42: two EIP-3009 authorizations (merchant leg + fee leg) settled atomically through
   * Multicall3 `aggregate3` with `allowFailure: false`: both transfers land or neither does.
   * Same operator Redis lock as `settle`. A revert -> `success:false`; a receipt wait that
   * expires -> `success:true, transaction:""` (reconcile decides). No remote fallback: PayAI
   * cannot settle this shape.
   */
  async settleFeeSplit(
    auth1: Eip3009Authorization,
    sig1: string,
    auth2: Eip3009Authorization,
    sig2: string,
  ): Promise<SettleResponse> {
    const cfg = getX402Config();
    const network = cfg.network as `${string}:${string}`;
    const signer = getOperatorWallet().signer;
    const multicall = signer.chain.contracts?.multicall3?.address;
    if (!multicall) throw new Error('multicall3 is not configured for this chain');
    const usdc = getAddress(cfg.usdcAddress);
    const payer = auth1.from;
    const start = performance.now();
    const done = (outcome: 'success' | 'error') => {
      x402LocalSettleTotal.inc({ result: outcome });
      x402LocalSettleDurationSeconds.observe(
        { result: outcome },
        (performance.now() - start) / 1000,
      );
    };
    const tx = await withOperatorLock(this.operatorAddress, async () => {
      const hash = await signer.writeContract({
        address: multicall,
        abi: multicall3Abi,
        functionName: 'aggregate3',
        args: [
          [
            {
              target: usdc,
              allowFailure: false,
              callData: encodeTransferWithAuthorization(auth1, sig1),
            },
            {
              target: usdc,
              allowFailure: false,
              callData: encodeTransferWithAuthorization(auth2, sig2),
            },
          ],
        ],
      });
      try {
        const receipt = await signer.waitForTransactionReceipt({
          hash,
          timeout: FEE_SPLIT_RECEIPT_TIMEOUT_MS,
        });
        return { hash, status: receipt.status };
      } catch (waitErr) {
        logger.warn(
          { err: errMsg(waitErr), operator: this.operatorAddress },
          'x402 fee-split: receipt not seen in time',
        );
        return { hash, status: 'timeout' as const };
      }
    });
    if (tx.status === 'timeout') {
      done('success');
      return { success: true, transaction: '', network, payer };
    }
    if (tx.status !== 'success') {
      done('error');
      return {
        success: false,
        errorReason: 'invalid_transaction_state',
        transaction: tx.hash,
        network,
        payer,
      };
    }
    done('success');
    return { success: true, transaction: tx.hash, network, payer };
  }

  async getSupported(): Promise<SupportedResponse> {
    // x402Facilitator.getSupported returns the same shape but typed slightly
    // wider (network: string vs Network template literal). Cast is safe.
    return this.localFacilitator.getSupported() as unknown as SupportedResponse;
  }
}

/**
 * Build the local facilitator stack from current x402 config.
 * Returns a singleton-capable client wired with the operator signer and
 * (optionally) a PayAI HTTP fallback.
 */
export function buildLocalFacilitatorClient(): LocalFacilitatorClient {
  const cfg = getX402Config();
  const wallet = getOperatorWallet();

  const facilitator = new x402Facilitator();
  // Casts:
  // - signer: viem WalletClient+publicActions provides every method
  //   FacilitatorEvmSigner needs (verifyTypedData, writeContract, getCode, etc.)
  //   but its returned shapes are wider; structural equivalence holds at runtime.
  // - networks: cfg.network is "eip155:8453" / "eip155:84532" — matches the
  //   `${string}:${string}` template literal of SDK's Network type.
  registerExactEvmScheme(facilitator, {
    signer: wallet.signer as unknown as Parameters<typeof registerExactEvmScheme>[1]['signer'],
    networks: cfg.network as `${string}:${string}`,
  });

  // PayAI fallback (existing X402_FACILITATOR_URL — defaults to facilitator.payai.network)
  const remoteFallback = new HTTPFacilitatorClient({ url: cfg.facilitatorUrl });

  return new LocalFacilitatorClient(facilitator, wallet.address, remoteFallback);
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
