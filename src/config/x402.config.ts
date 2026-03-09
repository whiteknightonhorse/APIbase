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
}

let frozen: X402Config | null = null;

export function getX402Config(): X402Config {
  if (!frozen) {
    frozen = Object.freeze({
      network: 'eip155:84532',
      usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      paymentAddress: config.X402_PAYMENT_ADDRESS,
      facilitatorUrl: config.X402_FACILITATOR_URL,
      priceLockSeconds: 60,
      receiptTtlSeconds: 86_400,
      maxTimeoutSeconds: 30,
      testnet: true,
    });
  }
  return frozen;
}
