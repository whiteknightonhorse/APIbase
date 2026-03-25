import type { Logger } from 'pino';

/**
 * Agent context populated by auth middleware (§9.3, §12.60).
 * Never trust client-provided agent_id from request body.
 */
export interface AgentContext {
  agent_id: string;
  tier: 'free' | 'paid' | 'enterprise';
  status: string;
}

export interface X402PaymentInfo {
  verified: boolean;
  payer: string;
  amount: string;
  network: string;
  scheme: string;
}

export interface MppPaymentInfo {
  verified: boolean;
  payer: string;
  amount: string;
  txHash: string;
  method: string;
}

// Extend Express Request type globally
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
      log: Logger;
      agent?: AgentContext;
      idempotencyKey?: string;
      toolId?: string;
      x402Payment?: X402PaymentInfo;
      mppPayment?: MppPaymentInfo;
    }
  }
}
