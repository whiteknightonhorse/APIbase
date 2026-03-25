import { config } from './index';

export interface MppConfig {
  readonly enabled: boolean;
  readonly secretKey: string;
  readonly walletAddress: string;
  readonly realm: string;
  readonly chainId: number;
  readonly usdcAddress: string;
  readonly rpcUrl: string;
  readonly testnet: boolean;
}

let frozen: MppConfig | null = null;

export function getMppConfig(): MppConfig {
  if (!frozen) {
    const testnet = config.MPP_TESTNET === 'true';
    frozen = Object.freeze({
      enabled: config.MPP_ENABLED === 'true' && !!config.MPP_SECRET_KEY && !!config.TEMPO_WALLET_ADDRESS,
      secretKey: config.MPP_SECRET_KEY,
      walletAddress: config.TEMPO_WALLET_ADDRESS,
      realm: config.MPP_REALM || 'apibase.pro',
      chainId: testnet ? 42431 : 4217,
      usdcAddress: testnet
        ? '0x20c0000000000000000000000000000000000000'   // pathUSD (testnet)
        : '0x20C000000000000000000000b9537d11c60E8b50',  // USDC (mainnet)
      rpcUrl: testnet
        ? 'https://rpc.moderato.tempo.xyz'
        : 'https://rpc.tempo.xyz',
      testnet,
    });
  }
  return frozen;
}
