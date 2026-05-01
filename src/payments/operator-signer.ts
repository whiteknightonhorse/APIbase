import {
  createWalletClient,
  http,
  publicActions,
  formatEther,
  type WalletClient,
  type PublicActions,
  type Account,
  type Transport,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';
import { getX402Config } from '../config/x402.config';
import { logger } from '../config/logger';
import { AppError, ErrorCode } from '../types/errors';

/**
 * Operator wallet for self-hosted x402 facilitator.
 *
 * Submits transferWithAuthorization (EIP-3009) on behalf of payers.
 * Holds NO USDC — only ETH for gas. Separate from X402_PAYMENT_ADDRESS receiver.
 *
 * Key handling rules (flywheel 2026-04-19):
 *   - Private key MUST come from .env (chmod 600, gitignored).
 *   - Never logged, never echoed to stdout, never returned via API.
 *   - Address (public) is logged at startup and via /health/operator.
 */

export type OperatorSigner = WalletClient<Transport, Chain, Account> & PublicActions;

export interface OperatorWallet {
  readonly signer: OperatorSigner;
  readonly address: `0x${string}`;
  /** Returns balance in wei. */
  getEthBalance(): Promise<bigint>;
}

const PRIVATE_KEY_REGEX = /^0x[0-9a-fA-F]{64}$/;

let cached: OperatorWallet | null = null;

/**
 * Build (or return cached) operator wallet.
 * Throws AppError(INTERNAL_ERROR) if key is missing or malformed.
 * Caller is responsible for guarding with `cfg.facilitatorMode === 'local'`.
 */
export function getOperatorWallet(): OperatorWallet {
  if (cached) return cached;

  const cfg = getX402Config();
  const key = cfg.operatorPrivateKey;

  if (!key) {
    throw new AppError(
      ErrorCode.INTERNAL_ERROR,
      'X402_OPERATOR_PRIVATE_KEY is required when X402_FACILITATOR_MODE=local',
    );
  }
  if (!PRIVATE_KEY_REGEX.test(key)) {
    throw new AppError(
      ErrorCode.INTERNAL_ERROR,
      'X402_OPERATOR_PRIVATE_KEY must match 0x + 64 hex characters',
    );
  }

  const account = privateKeyToAccount(key as `0x${string}`);
  const chain = cfg.testnet ? baseSepolia : base;

  const signer = createWalletClient({
    account,
    chain,
    transport: http(cfg.baseRpcUrl),
  }).extend(publicActions) as OperatorSigner;

  cached = {
    signer,
    address: account.address,
    async getEthBalance(): Promise<bigint> {
      return signer.getBalance({ address: account.address });
    },
  };

  logger.info(
    { operator: account.address, chain: chain.name, rpc: cfg.baseRpcUrl },
    'x402 local facilitator: operator wallet initialized',
  );

  return cached;
}

/**
 * Convert wei (bigint) to ETH (number) for metric/log display.
 * Use only for human-readable output — never for math.
 */
export function weiToEth(wei: bigint): number {
  return Number(formatEther(wei));
}

/** Reset singleton (test only). */
export function resetOperatorWallet(): void {
  cached = null;
}
