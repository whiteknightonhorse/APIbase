/** A-GA-02: the fee quote and the write of `attest(receipt_id)`, over an injected client (no genlayer-js import, so unit tests need no browser). */
import { CONTRACT_ADDRESS } from './attest-view';

export interface WriteClient {
  estimateTransactionFeesForWrite(a: unknown): Promise<{ feeValue: bigint; distribution: unknown }>;
  writeContract(a: unknown): Promise<unknown>;
}

export interface FeeQuote {
  feeValue: bigint;
  distribution: unknown;
}

/** The receipt id goes in as a plain string argument, the same shape for the estimate and the write. */
export async function quote(client: WriteClient, receiptId: string): Promise<FeeQuote> {
  const est = await client.estimateTransactionFeesForWrite({
    address: CONTRACT_ADDRESS,
    functionName: 'attest',
    args: [receiptId],
    value: 0n,
  });
  return { feeValue: est.feeValue, distribution: est.distribution };
}

export async function send(client: WriteClient, receiptId: string, q: FeeQuote): Promise<string> {
  const hash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: 'attest',
    args: [receiptId],
    value: 0n,
    fees: { distribution: q.distribution, feeValue: q.feeValue },
  });
  return String(hash);
}
