import { createHash, randomBytes } from 'node:crypto';
import { logger } from '../config/logger';
import type { PipelineContext } from '../pipeline/types';

/**
 * A-GA-01: immutable public receipt for every billed on-chain call (apibase-receipt/1).
 *
 * The receipt is planned from the finished pipeline context and written strictly AFTER the response
 * was handed to the transport. It reads billing results; it never computes a price, never touches
 * x402/MPP verification or settlement and never changes the response. Failed (unbilled) calls and
 * calls paid from a prepaid balance (no on-chain payment_tx) get no receipt in v0.
 */

export const RECEIPT_SCHEMA = 'apibase-receipt/1';
/** MCP tool-result `_meta` key carrying the receipt URL. */
export const MCP_RECEIPT_URL_META_KEY = 'apibase/receipt_url';
export const RECEIPT_BASE_URL = 'https://apibase.pro/r/';

/** The ONLY keys a receipt may carry. A test fails on any other key. */
export const RECEIPT_ALLOWED_KEYS = [
  'amount_atomic',
  'asset',
  'billed',
  'chain_id',
  'issued_at',
  'payee',
  'payer',
  'payment_tx',
  'rail',
  'receipt_id',
  'response_sha256',
  'schema',
  'tool',
  'upstream_status',
] as const;

export interface ReceiptBody {
  schema: typeof RECEIPT_SCHEMA;
  receipt_id: string;
  issued_at: string;
  tool: string;
  upstream_status: number;
  response_sha256: string;
  billed: true;
  rail: 'x402-base' | 'mpp-tempo';
  chain_id: number;
  asset: 'USDC';
  amount_atomic: string;
  payer: string;
  payee: string;
  payment_tx: string;
}

export interface ReceiptStore {
  insert(receiptId: string, body: string): Promise<void>;
  get(receiptId: string): Promise<string | null>;
}

export interface ReceiptPlan {
  receiptId: string;
  url: string;
  body: string;
}

const ADDR_RE = /^0x[0-9a-f]{40}$/;
const TX_RE = /^0x[0-9a-f]{64}$/;
export const RECEIPT_ID_RE = /^[0-9a-f]{32}$/;

export function newReceiptId(): string {
  return randomBytes(16).toString('hex');
}

export function receiptUrl(receiptId: string): string {
  return `${RECEIPT_BASE_URL}${receiptId}.json`;
}

/** Canonical JSON: keys sorted at every depth, no whitespace. Byte-stable across calls. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const parts = Object.keys(obj)
      .sort()
      .filter((k) => obj[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
    return `{${parts.join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/** USD (number or decimal string) -> integer string of 6-decimal atomic units; null if not positive. */
export function usdToAtomic(usd: unknown): string | null {
  const n = typeof usd === 'string' ? Number(usd) : typeof usd === 'number' ? usd : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const atomic = Math.round(n * 1e6);
  return atomic > 0 ? String(atomic) : null;
}

function lower(x: unknown): string {
  return typeof x === 'string' ? x.toLowerCase() : '';
}

export interface ReceiptInputs {
  receiptId: string;
  issuedAt: Date;
  responseText: string;
  x402Payee: string;
  x402ChainId: number | null;
  mppPayee: string;
  mppChainId: number;
}

/**
 * Pure: the receipt body for a finished context, or null when nothing was billed on-chain
 * (or any field fails its strict format, in which case no receipt is better than a wrong one).
 */
export function buildReceiptBody(ctx: PipelineContext, inp: ReceiptInputs): ReceiptBody | null {
  if (ctx.billingStatus !== 'PAID') return null;
  const amount = usdToAtomic(ctx.finalCost ?? ctx.toolPrice);
  if (!amount || !ctx.toolId) return null;

  let rail: ReceiptBody['rail'];
  let chainId: number | null;
  let payer: string;
  let payee: string;
  let tx: string;
  if (ctx.x402Paid) {
    if (ctx.x402SettleSucceeded !== true) return null;
    rail = 'x402-base';
    chainId = inp.x402ChainId;
    payer = lower(ctx.x402Payer);
    payee = lower(inp.x402Payee);
    tx = lower(ctx.x402SettleTxHash);
  } else if (ctx.mppPaid) {
    rail = 'mpp-tempo';
    chainId = inp.mppChainId;
    payer = lower(ctx.mppPayer);
    payee = lower(ctx.mppRecipient ?? inp.mppPayee);
    tx = lower(ctx.mppTxHash);
  } else {
    return null;
  }
  if (chainId === null || !ADDR_RE.test(payer) || !ADDR_RE.test(payee) || !TX_RE.test(tx)) {
    return null;
  }

  return {
    schema: RECEIPT_SCHEMA,
    receipt_id: inp.receiptId,
    issued_at: inp.issuedAt.toISOString(),
    tool: ctx.toolId,
    upstream_status: ctx.responseStatus ?? 200,
    response_sha256: sha256Hex(inp.responseText),
    billed: true,
    rail,
    chain_id: chainId,
    asset: 'USDC',
    amount_atomic: amount,
    payer,
    payee,
    payment_tx: tx,
  };
}

/** Plans a receipt for a finished, billed call. Pure and non-throwing: null = no receipt. */
export async function planReceipt(
  ctx: PipelineContext,
  responseText: string,
  now: Date = new Date(),
): Promise<ReceiptPlan | null> {
  try {
    if (ctx.billingStatus !== 'PAID' || (!ctx.x402Paid && !ctx.mppPaid)) return null;
    const { getX402Config } = await import('../config/x402.config');
    const { getMppConfig } = await import('../config/mpp.config');
    const x402 = getX402Config();
    const mpp = getMppConfig();
    const m = /^eip155:(\d+)$/.exec(x402.network);
    const receiptId = newReceiptId();
    const body = buildReceiptBody(ctx, {
      receiptId,
      issuedAt: now,
      responseText,
      x402Payee: x402.paymentAddress,
      x402ChainId: m ? Number(m[1]) : null,
      mppPayee: mpp.walletAddress,
      mppChainId: mpp.chainId,
    });
    if (!body) return null;
    return { receiptId, url: receiptUrl(receiptId), body: canonicalJson(body) };
  } catch (e) {
    logger.error({ err: e, request_id: ctx.requestId }, 'receipt: planning failed, no receipt');
    return null;
  }
}

export const pgReceiptStore: ReceiptStore = {
  async insert(receiptId, body) {
    const { getPrisma } = await import('./prisma.service');
    await getPrisma().$executeRawUnsafe(
      `INSERT INTO public_receipts (receipt_id, body) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      receiptId,
      body,
    );
  },
  async get(receiptId) {
    const { getPrisma } = await import('./prisma.service');
    const rows = (await getPrisma().$queryRawUnsafe(
      `SELECT body FROM public_receipts WHERE receipt_id = $1`,
      receiptId,
    )) as Array<{ body: string }>;
    return rows[0]?.body ?? null;
  },
};

/** Writes a planned receipt. NEVER throws: a failure is logged and the response is unaffected. */
export async function writeReceiptSafe(
  plan: ReceiptPlan | null,
  store: ReceiptStore = pgReceiptStore,
): Promise<void> {
  if (!plan) return;
  try {
    await store.insert(plan.receiptId, plan.body);
  } catch (e) {
    logger.error(
      { err: e, receipt_id: plan.receiptId },
      'receipt: write failed (response unchanged)',
    );
  }
}
