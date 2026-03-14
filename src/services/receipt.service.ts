import { createHash } from 'node:crypto';
import { ensureRedisConnected } from './redis.service';
import { getX402Config } from '../config/x402.config';

export interface ReceiptRecord {
  receiptId: string;
  txHash: string;
  payer: string;
  toolId: string;
  requestHash: string;
  response: unknown;
  payment: {
    amount: string;
    token: string;
    network: string;
    confirmed_at: string;
  };
  cached_until: string;
}

function redisKey(receiptId: string): string {
  return `x402:receipt:${receiptId}`;
}

export function generateReceiptId(txHash: string, requestHash: string): string {
  return createHash('sha256').update(`${txHash}${requestHash}`).digest('hex');
}

export async function storeReceipt(receipt: ReceiptRecord): Promise<void> {
  const r = await ensureRedisConnected();
  const ttl = getX402Config().receiptTtlSeconds;
  await r.set(redisKey(receipt.receiptId), JSON.stringify(receipt), 'EX', ttl);
}

export async function getReceipt(receiptId: string): Promise<ReceiptRecord | null> {
  const r = await ensureRedisConnected();
  const raw = await r.get(redisKey(receiptId));
  if (!raw) return null;
  return JSON.parse(raw) as ReceiptRecord;
}

/** No-op — shared Redis singleton shutdown handled by redis.service.ts. */
export async function shutdownReceiptRedis(): Promise<void> {
  // no-op: shared singleton
}
