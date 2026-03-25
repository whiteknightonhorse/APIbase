// Type declarations for mppx ESM package (used via dynamic import)
declare module 'mppx/server' {
  export function tempo(options: {
    currency: string;
    recipient: string;
    testnet?: boolean;
    chainId?: number;
    amount?: string;
    decimals?: number;
    description?: string;
    memo?: string;
    waitForConfirmation?: boolean;
    store?: { get(key: string): Promise<unknown>; put(key: string, value: unknown): Promise<void> };
    mode?: 'push' | 'pull';
    rpcUrl?: string;
  }): unknown;

  export const Mppx: {
    create(options: {
      methods: unknown[];
      secretKey?: string;
      realm?: string;
    }): {
      charge(options: { amount: string; currency?: string; recipient?: string }): (
        request: Request,
      ) => Promise<{
        status: number;
        challenge: Response;
        withReceipt(response: Response): Response;
      }>;
    };
  };
}
