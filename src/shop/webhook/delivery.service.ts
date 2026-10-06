import { config } from '../../config';
import {
  X_APIBASE_DELIVERY_ID,
  X_APIBASE_EVENT,
  X_APIBASE_SIGNATURE,
} from '../../config/http-headers';
import { decryptSecret, encryptSecret } from '../../services/secret-crypto.service';
import type { ShopDeps } from '../merchant-lifecycle.service';
import type { ShopTx } from '../db';
import { transition } from '../order-state';
import { DEFAULT_REFUND_WINDOW_DAYS, refundPolicy } from '../order-lifecycle.service';
import { BREAKER_THRESHOLD, MAX_ATTEMPTS, RETRY_DELAYS_MS } from './constants';
import { defaultResolver, resolvePublicTarget, type HostResolver } from './ssrf';
import { httpsTransport, WEBHOOK_TIMEOUT_MS, type WebhookTransport } from './transport';
import { signPayload } from './webhook.service';
import { loadWireEnvelopes, markDelivered, type WireEnvelope } from '../pii/pii.service';

export { BREAKER_THRESHOLD, MAX_ATTEMPTS, RETRY_DELAYS_MS };
export const DELIVERY_CONCURRENCY = 16;
export const EXCERPT_BYTES = 1024;
export const MAX_FULFILLMENT_BYTES = 16 * 1024;
const LEASE_MS = 60_000;

export interface DeliveryDeps extends ShopDeps {
  resolve?: HostResolver;
  transport?: WebhookTransport;
  timeoutMs?: number;
}

interface DueRow {
  delivery_id: string;
  endpoint_id: string;
  merchant_id: string;
  event_type: string;
  outbox_id: string;
  attempt: number;
  payload: Record<string, unknown>;
  event_at: Date;
  url: string;
  secret_enc: string | null;
  endpoint_status: string;
}

export function excerptOf(body: Buffer): string {
  return body.subarray(0, EXCERPT_BYTES).toString('utf8').replace(/�+$/, '');
}

/** The exact body of an event, rebuilt identically on every attempt. */
export function eventBody(
  r: Pick<DueRow, 'event_type' | 'outbox_id' | 'payload' | 'event_at'>,
  pii: WireEnvelope[] = [],
): string {
  return JSON.stringify({
    id: String(r.outbox_id),
    event: r.event_type,
    created_at: new Date(r.event_at).toISOString(),
    // T-INT-21: envelopes are read at send time (never copied into the outbox or the delivery row),
    // so a purged envelope is never re-sent.
    data: pii.length > 0 ? { ...r.payload, pii } : r.payload,
  });
}

/** Claims up to `limit` due attempts (a lease keeps a crashed claim from being lost), delivers them. */
export async function deliverDue(
  d: DeliveryDeps,
  opts: { limit?: number; nowMs?: number } = {},
): Promise<number> {
  const nowMs = opts.nowMs ?? (d.now ?? Date.now)();
  const rows = await d.db.$queryRawUnsafe<DueRow[]>(
    `WITH due AS (
       SELECT delivery_id FROM shop_webhook_deliveries
        WHERE status = 'pending' AND next_attempt_at <= $1::timestamptz
        ORDER BY next_attempt_at ASC LIMIT $2::int FOR UPDATE SKIP LOCKED
     ), claimed AS (
       UPDATE shop_webhook_deliveries x SET next_attempt_at = $3::timestamptz
         FROM due WHERE x.delivery_id = due.delivery_id
       RETURNING x.*
     )
     SELECT c.delivery_id, c.endpoint_id, c.merchant_id, c.event_type, c.outbox_id::text AS outbox_id,
            c.attempt, c.payload, c.event_at, e.url, e.secret_enc, e.status AS endpoint_status
       FROM claimed c JOIN shop_webhook_endpoints e ON e.endpoint_id = c.endpoint_id`,
    new Date(nowMs),
    opts.limit ?? DELIVERY_CONCURRENCY,
    new Date(nowMs + LEASE_MS),
  );
  await Promise.all(rows.map((r) => deliverOne(d, r, nowMs)));
  return rows.length;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new Error('timeout')), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function deliverOne(d: DeliveryDeps, r: DueRow, nowMs: number): Promise<void> {
  const timeoutMs = d.timeoutMs ?? WEBHOOK_TIMEOUT_MS;
  let status_code: number | null = null;
  let excerpt = '';
  let ok = false;
  let respBody: Buffer = Buffer.alloc(0);
  let piiSent = 0;
  try {
    if (r.endpoint_status !== 'active' || !r.secret_enc) throw new Error('endpoint inactive');
    // DNS pinning: resolved again at delivery time, every address public, the connection uses that IP.
    const target = await resolvePublicTarget(r.url, d.resolve ?? defaultResolver);
    const secret = decryptSecret(r.secret_enc, config.ENCRYPTION_KEY);
    const pii =
      r.event_type === 'order.paid'
        ? await loadWireEnvelopes(d.db, String(r.payload.order_id ?? ''))
        : [];
    piiSent = pii.length;
    const body = eventBody(r, pii);
    const t = Math.floor(nowMs / 1000);
    const send = d.transport ?? httpsTransport;
    const res = await withTimeout(
      send({
        target,
        timeoutMs,
        body,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'APIbase-Webhooks/1',
          [X_APIBASE_EVENT]: r.event_type,
          [X_APIBASE_DELIVERY_ID]: r.outbox_id,
          [X_APIBASE_SIGNATURE]: signPayload(secret, t, body),
        },
      }),
      timeoutMs,
    );
    status_code = res.status;
    respBody = res.body;
    excerpt = excerptOf(respBody);
    ok = res.status >= 200 && res.status < 300; // 3xx is never followed: it is a refusal
    if (!ok && res.status >= 300 && res.status < 400)
      excerpt = `redirect not followed (${res.status})`;
  } catch (err) {
    excerpt = `error: ${(err as Error).message}`.slice(0, EXCERPT_BYTES);
  }

  if (ok) {
    let accepted = false;
    if (r.event_type === 'order.paid' && status_code === 200) {
      const f = parseFulfillment(respBody);
      if (f !== null) {
        try {
          accepted = await acceptFulfillment(d, r.merchant_id, String(r.payload.order_id ?? ''), f);
        } catch {
          accepted = false; // the delivery itself still succeeded; the order stays where it was
        }
        // never keep the delivered content in the log
        excerpt = accepted ? '[fulfillment accepted]' : '[fulfillment ignored: not accepted]';
      }
    }
    await d.transaction(async (tx) => {
      if (piiSent > 0) {
        await markDelivered(tx, r.merchant_id, String(r.payload.order_id ?? ''), new Date(nowMs));
      }
      await tx.$executeRawUnsafe(
        `UPDATE shop_webhook_deliveries
            SET status = 'delivered', status_code = $2, response_excerpt = $3,
                fulfillment_accepted = $4, delivered_at = $5::timestamptz, next_attempt_at = NULL
          WHERE delivery_id = $1::uuid`,
        r.delivery_id,
        status_code,
        excerpt,
        accepted,
        new Date(nowMs),
      );
      await tx.$executeRawUnsafe(
        `UPDATE shop_webhook_endpoints SET failures_in_row = 0 WHERE endpoint_id = $1::uuid`,
        r.endpoint_id,
      );
    });
    return;
  }

  const final = r.attempt >= MAX_ATTEMPTS;
  await d.transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `UPDATE shop_webhook_deliveries
          SET status = $2, status_code = $3, response_excerpt = $4, next_attempt_at = NULL
        WHERE delivery_id = $1::uuid`,
      r.delivery_id,
      final ? 'failed' : 'retry',
      status_code,
      excerpt,
    );
    await tx.$executeRawUnsafe(
      `UPDATE shop_webhook_endpoints SET failures_in_row = failures_in_row + 1 WHERE endpoint_id = $1::uuid`,
      r.endpoint_id,
    );
    if (!final) {
      await tx.$executeRawUnsafe(
        `INSERT INTO shop_webhook_deliveries
           (endpoint_id, merchant_id, event_type, outbox_id, attempt, status, payload, event_at, next_attempt_at)
         VALUES ($1::uuid, $2::uuid, $3, $4::bigint, $5::int, 'pending', $6::jsonb, $7::timestamptz, $8::timestamptz)
         ON CONFLICT DO NOTHING`,
        r.endpoint_id,
        r.merchant_id,
        r.event_type,
        r.outbox_id,
        r.attempt + 1,
        JSON.stringify(r.payload),
        r.event_at,
        new Date(nowMs + RETRY_DELAYS_MS[r.attempt - 1]),
      );
    }
  });
}

/** `{fulfillment: string}`, 1..16 KB, nothing else required; null = no valid fulfillment in the answer. */
export function parseFulfillment(body: Buffer): string | null {
  if (body.length === 0 || body.length > MAX_FULFILLMENT_BYTES + 1024) return null;
  let j: unknown;
  try {
    j = JSON.parse(body.toString('utf8'));
  } catch {
    return null;
  }
  const f = (j as { fulfillment?: unknown } | null)?.fulfillment;
  if (typeof f !== 'string' || f.length === 0) return null;
  if (Buffer.byteLength(f) > MAX_FULFILLMENT_BYTES) return null;
  return f;
}

/**
 * Synchronous issuance (F-6): the first valid `fulfillment` of an order is stored (encrypted) and the
 * automaton goes PAID -> CONFIRMED -> FULFILLED (a merchant that did not confirm explicitly is read as
 * confirming by answering with the goods). Any later one is ignored. Returns whether this one was taken.
 */
export async function acceptFulfillment(
  d: ShopDeps,
  merchant_id: string,
  order_id: string,
  text: string,
): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(order_id)) return false;
  return d.transaction(async (tx: ShopTx) => {
    const rows = await tx.$queryRawUnsafe<
      Array<{ state: string; fulfillment_payload_enc: string | null; waive_withdrawal: boolean }>
    >(
      `SELECT o.state, o.fulfillment_payload_enc, q.waive_withdrawal
         FROM shop_orders o JOIN shop_quotes q ON q.quote_id = o.quote_id
        WHERE o.order_id = $1::uuid AND o.merchant_id = $2::uuid FOR UPDATE OF o`,
      order_id,
      merchant_id,
    );
    const o = rows[0];
    if (!o || o.fulfillment_payload_enc !== null) return false;
    if (o.state !== 'PAID' && o.state !== 'CONFIRMED') return false;
    if (o.state === 'PAID') {
      await transition(tx, order_id, 'CONFIRMED', {
        actor: 'merchant',
        reason: 'webhook_fulfillment',
      });
    }
    await transition(tx, order_id, 'FULFILLED', {
      actor: 'merchant',
      reason: 'webhook_fulfillment',
    });
    await tx.$executeRawUnsafe(
      `UPDATE shop_orders SET fulfillment_payload_enc = $2, confirm_due_at = NULL WHERE order_id = $1::uuid`,
      order_id,
      encryptSecret(text, config.ENCRYPTION_KEY),
    );
    if (o.waive_withdrawal) {
      await transition(tx, order_id, 'CLOSED', { actor: 'system', reason: 'withdrawal_waived' });
      await tx.$executeRawUnsafe(
        `UPDATE shop_orders SET close_after = now() WHERE order_id = $1::uuid`,
        order_id,
      );
    } else {
      const policy = await refundPolicy(tx, order_id);
      await tx.$executeRawUnsafe(
        `UPDATE shop_orders SET close_after = now() + ($2::int * interval '1 day') WHERE order_id = $1::uuid`,
        order_id,
        policy.refund_window_days ?? DEFAULT_REFUND_WINDOW_DAYS,
      );
    }
    return true;
  });
}

/**
 * Re-sends an already attempted event to the same endpoint right away: a NEW attempt row with the same
 * outbox id, hence the same `X-APIbase-Delivery-Id` and the same `order_id`.
 */
export async function redeliver(d: ShopDeps, delivery_id: string, nowMs: number): Promise<boolean> {
  const n = await d.db.$executeRawUnsafe(
    `INSERT INTO shop_webhook_deliveries
       (endpoint_id, merchant_id, event_type, outbox_id, attempt, status, payload, event_at, next_attempt_at)
     SELECT endpoint_id, merchant_id, event_type, outbox_id,
            (SELECT max(attempt) + 1 FROM shop_webhook_deliveries y
              WHERE y.endpoint_id = x.endpoint_id AND y.outbox_id = x.outbox_id),
            'pending', payload, event_at, $2::timestamptz
       FROM shop_webhook_deliveries x WHERE delivery_id = $1::uuid
     ON CONFLICT DO NOTHING`,
    delivery_id,
    new Date(nowMs),
  );
  return n > 0;
}
