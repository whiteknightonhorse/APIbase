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
