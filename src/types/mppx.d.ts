// Type declarations for mppx ESM package (used via dynamic import)
declare module 'mppx/server' {
  type TempoMethodParams = {
    account?: unknown;
    /** mppx >= 0.12: the challenge advertises exactly these currencies (T-0426: one). */
    currencies: string[];
    recipient: `0x${string}` | string;
    testnet?: boolean;
    chainId?: number;
    amount?: string;
    suggestedDeposit?: string;
    unitType?: string;
    decimals?: number;
    description?: string;
    waitForConfirmation?: boolean;
    store?: {
      get(key: string): Promise<unknown>;
      put(key: string, value: unknown): Promise<void>;
      update(key: string, fn: (current: unknown) => unknown): Promise<unknown>;
    };
    mode?: 'push' | 'pull';
    rpcUrl?: string;
  };

  interface TempoFn {
    (options: TempoMethodParams): unknown;
    charge(options: TempoMethodParams): unknown;
    session(options: TempoMethodParams): unknown;
    /** One-shot settle of the highest voucher in the channel store (T-INT-40). */
    settle(
      store: unknown,
      client: unknown,
      channelId: `0x${string}`,
      options?: { account?: unknown; escrowContract?: `0x${string}` },
    ): Promise<`0x${string}`>;
  }
  export const tempo: TempoFn;

  export const Store: {
    redis(client: {
      get(key: string): Promise<string | null>;
      set(key: string, value: string): Promise<unknown>;
      del(key: string): Promise<unknown>;
      update?(key: string, fn: (current: string | null) => unknown): Promise<unknown>;
    }): {
      get(key: string): Promise<unknown>;
      put(key: string, value: unknown): Promise<void>;
      delete(key: string): Promise<void>;
      update(key: string, fn: (current: unknown) => unknown): Promise<unknown>;
    };
  };

  export const Mppx: {
    create(options: { methods: unknown[]; secretKey?: string; realm?: string }): {
      session(options: { amount?: string }): (request: Request) => Promise<{
        status: number;
        challenge: Response;
        withReceipt(response: Response): Response;
      }>;
      charge(options: {
        amount: string;
        chainId?: number;
        recipient?: string;
        splits?: Array<{ recipient: string; amount: string }>;
      }): (request: Request) => Promise<{
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

// T-0426 lane B: the stream lane runs on the pinned alias `mppx-legacy` (npm:mppx@0.8.2), whose
// declarations are the pre-0.13 ones, verbatim.
declare module 'mppx-legacy/server' {
  type TempoMethodParams = {
    account?: unknown;
    currency: string;
    recipient: `0x${string}` | string;
    testnet?: boolean;
    chainId?: number;
    amount?: string;
    suggestedDeposit?: string;
    unitType?: string;
    decimals?: number;
    description?: string;
    memo?: string;
    waitForConfirmation?: boolean;
    store?: {
      get(key: string): Promise<unknown>;
      put(key: string, value: unknown): Promise<void>;
      update(key: string, fn: (current: unknown) => unknown): Promise<unknown>;
    };
    mode?: 'push' | 'pull';
    rpcUrl?: string;
  };

  interface TempoFn {
    (options: TempoMethodParams): unknown;
    charge(options: TempoMethodParams): unknown;
    session(options: TempoMethodParams): unknown;
    /** Contract-backed session (what `session` was before mppx 0.7; T-0393). */
    sessionLegacy: {
      (options: TempoMethodParams): unknown;
      settle(
        store: unknown,
        client: unknown,
        channelId: `0x${string}`,
        options?: { account?: unknown; escrowContract?: `0x${string}` },
      ): Promise<`0x${string}`>;
    };
    /** One-shot settle of the highest voucher in the channel store (T-INT-40). */
    settle(
      store: unknown,
      client: unknown,
      channelId: `0x${string}`,
      options?: { account?: unknown; escrowContract?: `0x${string}` },
    ): Promise<`0x${string}`>;
  }
  export const tempo: TempoFn;

  export const Store: {
    redis(client: {
      get(key: string): Promise<string | null>;
      set(key: string, value: string): Promise<unknown>;
      del(key: string): Promise<unknown>;
      update?(key: string, fn: (current: string | null) => unknown): Promise<unknown>;
    }): {
      get(key: string): Promise<unknown>;
      put(key: string, value: unknown): Promise<void>;
      delete(key: string): Promise<void>;
      update(key: string, fn: (current: unknown) => unknown): Promise<unknown>;
    };
  };

  export const Mppx: {
    create(options: { methods: unknown[]; secretKey?: string; realm?: string }): {
      session(options: { amount?: string }): (request: Request) => Promise<{
        status: number;
        challenge: Response;
        withReceipt(response: Response): Response;
      }>;
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

declare module 'mppx-legacy/tempo' {
  export const SessionLegacy: { Session: LegacySession };
  interface LegacySession {
    Chain: {
      getOnChainChannel(
        client: unknown,
        escrowContract: `0x${string}`,
        channelId: `0x${string}`,
      ): Promise<{
        closeRequestedAt: bigint;
        deposit: bigint;
        settled: bigint;
        finalized: boolean;
      }>;
    };
  }
}
