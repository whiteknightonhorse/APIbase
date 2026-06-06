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
  /** Payment header present & structurally well-formed. NOT a cryptographic
   *  binding — authoritative verification against server requirements happens
   *  in the ESCROW pipeline stage (issue #103). */
  verified: boolean;
  /** Placeholder ('pending') at middleware time; the real on-chain payer is
   *  resolved by ESCROW from the authoritative verify result. */
  payer: string;
  /** UNVERIFIED placeholders set by middleware — do NOT treat as server-enforced
   *  values. The bound amount/network are derived from server config + tool
   *  price inside ESCROW, never from these fields. */
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
