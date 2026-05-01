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
