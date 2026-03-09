import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../config/logger';
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

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 1000,
    });
    redis.on('error', (err) => {
      logger.warn({ err }, 'Receipt Redis background error');
    });
  }
  return redis;
}

async function ensureConnected(): Promise<Redis> {
  const r = getRedis();
  if (r.status === 'wait') {
    await r.connect();
  }
  return r;
}

function redisKey(receiptId: string): string {
  return `x402:receipt:${receiptId}`;
}

export function generateReceiptId(txHash: string, requestHash: string): string {
  return createHash('sha256').update(`${txHash}${requestHash}`).digest('hex');
}

export async function storeReceipt(receipt: ReceiptRecord): Promise<void> {
  const r = await ensureConnected();
  const ttl = getX402Config().receiptTtlSeconds;
  await r.set(redisKey(receipt.receiptId), JSON.stringify(receipt), 'EX', ttl);
}

export async function getReceipt(receiptId: string): Promise<ReceiptRecord | null> {
  const r = await ensureConnected();
  const raw = await r.get(redisKey(receiptId));
  if (!raw) return null;
  return JSON.parse(raw) as ReceiptRecord;
}

export async function shutdownReceiptRedis(): Promise<void> {
  if (redis) {
    redis.disconnect();
    redis = null;
  }
}
