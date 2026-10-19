import { config } from './index';

export interface X402Config {
  readonly network: string;
  readonly usdcAddress: string;
  readonly paymentAddress: string;
  readonly facilitatorUrl: string;
  readonly priceLockSeconds: number;
  readonly receiptTtlSeconds: number;
  readonly maxTimeoutSeconds: number;
  readonly testnet: boolean;
  readonly facilitatorMode: 'local' | 'remote';
  readonly operatorPrivateKey: string;
  readonly baseRpcUrl: string;
  readonly operatorMinEthBalance: number;
}

const NETWORK_MAP: Record<string, { chainId: string; usdc: string; testnet: boolean }> = {
  base: {
    chainId: 'eip155:8453',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    testnet: false,
  },
  'base-sepolia': {
    chainId: 'eip155:84532',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    testnet: true,
  },
};

let frozen: X402Config | null = null;

export function getX402Config(): X402Config {
  if (!frozen) {
    const net = NETWORK_MAP[config.X402_NETWORK] ?? NETWORK_MAP['base-sepolia'];
    frozen = Object.freeze({
      network: net.chainId,
      usdcAddress: net.usdc,
      paymentAddress: config.X402_PAYMENT_ADDRESS,
      facilitatorUrl: config.X402_FACILITATOR_URL,
      priceLockSeconds: 60,
      receiptTtlSeconds: 86_400,
      maxTimeoutSeconds: 30,
      testnet: net.testnet,
      facilitatorMode: config.X402_FACILITATOR_MODE,
      operatorPrivateKey: config.X402_OPERATOR_PRIVATE_KEY,
      baseRpcUrl: net.testnet ? config.X402_BASE_SEPOLIA_RPC_URL : config.X402_BASE_RPC_URL,
      operatorMinEthBalance: config.X402_OPERATOR_MIN_ETH_BALANCE,
    });
  }
  return frozen;
}

/**
 * Convert a USD price to integer micro-USDC (6 decimals) as a string.
 *
 * SINGLE source of rounding for the on-chain amount. Both the 402 challenge
 * (`buildPaymentRequiredResponse`) and the server-trusted binding requirements
 * (`buildServerX402Requirements`) MUST use this so the value the client signs
 * over and the value the facilitator enforces are byte-identical — the exact
 * scheme requires `authorization.value === requirements.amount` (issue #103).
 */
export function toMicroUsdc(priceUsd: number): string {
  return String(Math.round(priceUsd * 1_000_000));
}

export interface ServerX402Requirements {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
}

/**
 * Build x402 payment requirements from SERVER-trusted config + the tool's real
 * price. This is the authoritative anchor for payment verification and
 * settlement — it must NEVER be derived from the client-supplied
 * `payload.accepted` (that was the issue #103 bypass). The facilitator's exact
 * scheme binds the signed authorization to `payTo`, `amount`, `network`, and
 * `asset` from these requirements, rejecting any mismatch.
 */
export function buildServerX402Requirements(priceUsd: number): ServerX402Requirements {
  const cfg = getX402Config();
  return {
    scheme: 'exact',
    network: cfg.network,
    asset: cfg.usdcAddress,
    amount: toMicroUsdc(priceUsd),
    payTo: cfg.paymentAddress,
    maxTimeoutSeconds: cfg.maxTimeoutSeconds,
    extra: { name: 'USD Coin', version: '2' },
  };
}
