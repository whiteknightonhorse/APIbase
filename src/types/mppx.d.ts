// Type declarations for mppx ESM package (used via dynamic import)
declare module 'mppx/server' {
  type TempoMethodParams = {
    account?: unknown;
    currency: string;
    recipient: `0x${string}` | string;
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
  };

  interface TempoFn {
    (options: TempoMethodParams): unknown;
    charge(options: TempoMethodParams): unknown;
    session(options: TempoMethodParams): unknown;
  }
  export const tempo: TempoFn;

  export const Store: {
    redis(client: {
      get(key: string): Promise<string | null>;
      set(key: string, value: string): Promise<unknown>;
      del(key: string): Promise<unknown>;
    }): {
      get(key: string): Promise<unknown>;
      put(key: string, value: unknown): Promise<void>;
      delete(key: string): Promise<void>;
    };
  };

  export const Mppx: {
    create(options: { methods: unknown[]; secretKey?: string; realm?: string }): {
      charge(options: { amount: string; currency?: string; recipient?: string }): (
        request: Request,
      ) => Promise<{
        status: number;
        challenge: Response;
        withReceipt(response: Response): Response;
      }>;
    };
    toNodeListener(
      handler: (request: Request) => Promise<unknown>,
    ): (
      req: import('node:http').IncomingMessage,
      res: import('node:http').ServerResponse,
    ) => Promise<unknown>;
  };
}
