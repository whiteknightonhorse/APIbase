/**
 * T-0826 (SOUKBASE-QUOTES-1113 ruling-1): best-effort record of what happened to a quote. Every
 * function here swallows its own failure (logged, never thrown): a failed write never changes a
 * buyer's answer, status or the timing path of a payment. Stored: counters, one error code, the
 * product token `client`, the requested SKUs of a refused quote. Never an IP, a user-agent beyond
 * the token, an e-mail, a buyer token or identity, a payer, a payment header, a signature, a
 * transaction hash, an item title or the fee.
 */
import { logger } from '../config/logger';
import type { ShopTx } from './db';
import type { ShopDeps } from './merchant-lifecycle.service';
import { QuoteError } from './quote.errors';
import { createQuote, type Buyer, type QuoteResponse } from './quote.service';
import { uaFamily } from './stats.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLIENT_MAX = 40;
const SKU_MAX = 64;
const SKUS_MAX = 20;
const CODE_MAX = 64;

/** Orders in these states have not been paid (the same set stats.service treats as unpaid). */
export const UNPAID_ORDER_STATES = ['QUOTED', 'EXPIRED', 'CANCELLED', 'PAYING', 'PAYMENT_FAILED'];

/** At most 40 characters of [A-Za-z0-9._-]; null when nothing usable is left. */
export function clientToken(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.replace(/[^A-Za-z0-9._-]/g, '').slice(0, CLIENT_MAX);
  return t === '' ? null : t;
}

/** REST: the user-agent family (`browser` for Mozilla); the full user-agent goes no further. */
export function clientFromUserAgent(ua: unknown): string | null {
  if (typeof ua !== 'string' || ua.trim() === '') return null;
  const fam = uaFamily(ua);
  if (fam === 'unknown') return null;
  return clientToken(fam === 'Mozilla' ? 'browser' : fam);
}

async function bestEffort(what: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    logger.warn({ err: (err as Error)?.message, what }, 'quote outcome not recorded');
  }
}

/** createQuote succeeded: the outcome row, with the caller's `client`. */
export function recordQuoteCreated(
  db: ShopTx,
  quote_id: string,
  client: string | null,
): Promise<void> {
  return bestEffort('created', async () => {
    if (!UUID_RE.test(quote_id)) return;
    await db.$executeRawUnsafe(
      `INSERT INTO shop_quote_outcomes (quote_id, merchant_id, client)
       SELECT quote_id, merchant_id, $2 FROM shop_quotes WHERE quote_id = $1::uuid
       ON CONFLICT (quote_id) DO UPDATE
          SET client = coalesce(EXCLUDED.client, shop_quote_outcomes.client), updated_at = now()`,
      quote_id,
      clientToken(client),
    );
  });
}

/** A quote refused with a 4xx after the merchant was known: one row, outside the rolled-back transaction. */
export function recordQuoteRefused(
  db: ShopTx,
  merchant_id: string,
  error_code: string,
  rawInput: unknown,
): Promise<void> {
  return bestEffort('refused', async () => {
    const items = (rawInput as { items?: unknown } | null)?.items;
    const skus: string[] = [];
    if (Array.isArray(items)) {
      for (const it of items) {
        const sku = (it as { sku?: unknown } | null)?.sku;
        if (typeof sku === 'string' && skus.length < SKUS_MAX) skus.push(sku.slice(0, SKU_MAX));
      }
    }
    await db.$executeRawUnsafe(
      `INSERT INTO shop_quote_refusals (merchant_id, error_code, skus)
       VALUES ($1::uuid, $2, $3::text[])`,
      merchant_id,
      String(error_code).slice(0, CODE_MAX),
      skus,
    );
  });
}

/**
 * payQuote answered: no payment + 402 -> challenges + 1; a payment presented -> pay_attempts + 1, and
 * when it ended other than 200/202 the code the buyer was answered. `already_placed` (200) records nothing.
 */
export function recordPayOutcome(
  db: ShopTx,
  quote_id: string,
  o: { presented: boolean; status: number; error_code?: unknown },
): Promise<void> {
  return bestEffort('pay', async () => {
    if (!UUID_RE.test(quote_id)) return;
    const challenge = !o.presented && o.status === 402;
    if (!challenge && !o.presented) return;
    const failed = o.presented && o.status !== 200 && o.status !== 202;
    const code =
      failed && typeof o.error_code === 'string' ? o.error_code.slice(0, CODE_MAX) : null;
    await db.$executeRawUnsafe(
      `INSERT INTO shop_quote_outcomes
              (quote_id, merchant_id, challenges, pay_attempts, last_error_code, last_error_at)
       SELECT quote_id, merchant_id, $2::int, $3::int, $4::text, CASE WHEN $5 THEN now() END
         FROM shop_quotes WHERE quote_id = $1::uuid
       ON CONFLICT (quote_id) DO UPDATE
          SET challenges = shop_quote_outcomes.challenges + $2::int,
              pay_attempts = shop_quote_outcomes.pay_attempts + $3::int,
              last_error_code = CASE WHEN $5 THEN $4::text ELSE shop_quote_outcomes.last_error_code END,
              last_error_at = CASE WHEN $5 THEN now() ELSE shop_quote_outcomes.last_error_at END,
              updated_at = now()`,
      quote_id,
      challenge ? 1 : 0,
      o.presented ? 1 : 0,
      code,
      failed,
    );
  });
}

/** The buyer or payer read a paid order: read_at is set once (merchant, owner and partner reads never call this). */
export function recordOrderRead(db: ShopTx, order_id: string): Promise<void> {
  return bestEffort('read', async () => {
    if (!UUID_RE.test(order_id)) return;
    await db.$executeRawUnsafe(
      `INSERT INTO shop_quote_outcomes (quote_id, merchant_id, read_at)
       SELECT q.quote_id, q.merchant_id, now()
         FROM shop_orders o JOIN shop_quotes q ON q.quote_id = o.quote_id
        WHERE o.order_id = $1::uuid
       ON CONFLICT (quote_id) DO UPDATE SET read_at = now(), updated_at = now()
        WHERE shop_quote_outcomes.read_at IS NULL`,
      order_id,
    );
  });
}

/**
 * createQuote for the buyer entry points (REST router, MCP tool): records the created quote with the
 * caller's `client`, and a 4xx refusal (merchant known) as one refusal row. The answer or the error is
 * exactly createQuote's.
 */
export async function createQuoteRecorded(
  d: ShopDeps,
  merchant_id: string,
  buyer: Buyer,
  rawInput: unknown,
  client: string | null,
): Promise<QuoteResponse> {
  try {
    const q = await createQuote(d, merchant_id, buyer, rawInput);
    await recordQuoteCreated(d.db, q.quote_id, client);
    return q;
  } catch (err) {
    if (err instanceof QuoteError && err.status >= 400 && err.status < 500) {
      await recordQuoteRefused(d.db, merchant_id, err.error_code, rawInput);
    }
    throw err;
  }
}
