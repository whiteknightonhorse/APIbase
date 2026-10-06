import type { ShopDeps } from './merchant-lifecycle.service';
import type { ShopTx } from './db';
import { ACTIVE_STATES, transition, type State } from './order-state';
import { isPayer } from './order-payment.service';
import { QuoteError } from './quote.errors';
import type { Buyer } from './quote.service';

/**
 * §4 F-10 / UC-13 / §6.1 shop.order.dispute / §6.3 POST /orders/:id/disputes. Only the payer opens a
 * dispute; the merchant answers within 7 days. Escalation is reputation and suspension only (see
 * reputation.service.ts); nothing here moves money. Merchant dispute response channel: the refund tool
 * (a verified refund resolves the dispute) or the mail intake of §12.2 MERCHANT_REPLY; §6.3 has no
 * REST route for a merchant reply, so none exists.
 */

export const DISPUTE_REASONS = [
  'not_received',
  'not_as_described',
  'duplicate',
  'canceled_recurring',
  'agent_error',
  'other',
] as const;
export type DisputeReason = (typeof DISPUTE_REASONS)[number];
const DISPUTE_DUE_DAYS = 7;
export const DISPUTE_NOTE_MAX = 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOCS = '/docs/integrator#disputes';
const notFound = () => new QuoteError(404, 'not_found', 'order not found', 'use_different_tool');

const emit = (db: ShopTx, event_type: string, payload: Record<string, unknown>) =>
  db.$executeRawUnsafe(
    `INSERT INTO outbox (event_type, payload) VALUES ($1, $2::jsonb)`,
    event_type,
    JSON.stringify(payload),
  );

export interface DisputeView {
  dispute_id: string;
  order_id: string;
  status: string;
  reason_code: string;
  due_at: Date | string | null;
  state: string;
}

/** `shop.order.dispute({order_id, reason_code, note?})`: the payer only; another identity sees 404. */
export async function openDispute(
  d: ShopDeps,
  buyer: Buyer,
  input: { order_id?: unknown; reason_code?: unknown; note?: unknown },
): Promise<DisputeView> {
  const order_id = input.order_id;
  if (typeof order_id !== 'string' || !UUID_RE.test(order_id)) throw notFound();
  if (!DISPUTE_REASONS.includes(input.reason_code as DisputeReason)) {
    throw new QuoteError(
      422,
      'validation_failed',
      `reason_code must be one of ${DISPUTE_REASONS.join(', ')}`,
      'fix_request',
      { documentation_url: DOCS },
    );
  }
  const note = input.note;
  if (note !== undefined && note !== null) {
    if (typeof note !== 'string' || note.length > DISPUTE_NOTE_MAX) {
      throw new QuoteError(
        422,
        'validation_failed',
        `note must be a string of up to ${DISPUTE_NOTE_MAX} characters`,
        'fix_request',
        { documentation_url: DOCS },
      );
    }
  }
  const reason_code = input.reason_code as DisputeReason;

  return d.transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<
      Array<{
        state: State;
        merchant_id: string;
        buyer_identity: string | null;
        payer_wallet: string | null;
      }>
    >(
      `SELECT o.state, o.merchant_id, q.buyer_identity, o.payer_wallet
         FROM shop_orders o JOIN shop_quotes q ON q.quote_id = o.quote_id
        WHERE o.order_id = $1::uuid FOR UPDATE OF o`,
      order_id,
    );
    const o = rows[0];
    if (!o || !isPayer(o, buyer.identity)) throw notFound();

    const open = await tx.$queryRawUnsafe<DisputeView[]>(
      `SELECT dispute_id, order_id, status, reason_code, due_at, $2::text AS state FROM shop_disputes
        WHERE order_id = $1::uuid AND status IN ('open', 'merchant_responded') LIMIT 1`,
      order_id,
      o.state,
    );
    if (open[0]) return open[0];
    if (!ACTIVE_STATES.includes(o.state)) {
      throw new QuoteError(
        409,
        'not_disputable',
        `order is ${o.state}: a dispute needs a paid order that is not already refunded`,
        'use_different_tool',
        { state: o.state, documentation_url: DOCS },
      );
    }
    await transition(tx, order_id, 'DISPUTED', {
      actor: 'buyer',
      reason: 'dispute_opened',
      payload: { reason_code },
    });
    const ins = await tx.$queryRawUnsafe<Array<{ dispute_id: string; due_at: Date }>>(
      `INSERT INTO shop_disputes (order_id, opened_by, reason_code, buyer_note, due_at, status)
       VALUES ($1::uuid, $2, $3, $4, now() + make_interval(days => $5::int), 'open')
       RETURNING dispute_id, due_at`,
      order_id,
      buyer.identity,
      reason_code,
      note ?? null,
      DISPUTE_DUE_DAYS,
    );
    await emit(tx, 'shop.dispute.opened', {
      dispute_id: ins[0].dispute_id,
      order_id,
      merchant_id: o.merchant_id,
      reason_code,
      due_at: ins[0].due_at,
    });
    return {
      dispute_id: ins[0].dispute_id,
      order_id,
      status: 'open',
      reason_code,
      due_at: ins[0].due_at,
      state: 'DISPUTED',
    };
  });
}

/**
 * Close a dispute without a refund (`resolved_rejected`, the mail-intake outcome) or by expiry. The
 * order goes back to the state it was in before the dispute (§5.3). A refund resolves its dispute
 * inside merchantRefund (DISPUTED -> REFUND_PENDING instead).
 */
export async function closeDispute(
  tx: ShopTx,
  dispute_id: string,
  status: 'resolved_rejected' | 'expired',
  actor: 'system' | 'autopilot' = 'system',
): Promise<boolean> {
  const rows = await tx.$queryRawUnsafe<Array<{ order_id: string }>>(
    `UPDATE shop_disputes SET status = $2, resolved_at = now()
      WHERE dispute_id = $1::uuid AND status IN ('open', 'merchant_responded')
      RETURNING order_id`,
    dispute_id,
    status,
  );
  if (rows.length === 0) return false;
  const prior = await tx.$queryRawUnsafe<Array<{ from_state: State | null; state: State }>>(
    `SELECT (SELECT from_state FROM shop_order_events
              WHERE order_id = o.order_id AND to_state = 'DISPUTED' ORDER BY seq DESC LIMIT 1) AS from_state,
            o.state
       FROM shop_orders o WHERE o.order_id = $1::uuid FOR UPDATE`,
    rows[0].order_id,
  );
  if (prior[0]?.state === 'DISPUTED' && prior[0].from_state) {
    await transition(tx, rows[0].order_id, prior[0].from_state, {
      actor,
      reason: `dispute_${status}`,
    });
  }
  return true;
}

/**
 * Sweeper step: `due_at` passed with no resolution -> `expired`, the order returns to its prior state
 * and ONE `shop.dispute.unanswered` (§12.2 DISPUTE_UNANSWERED) is queued.
 */
export async function expireDisputes(d: ShopDeps, now: Date): Promise<number> {
  const due = await d.db.$queryRawUnsafe<Array<{ dispute_id: string }>>(
    `SELECT dispute_id FROM shop_disputes
      WHERE status IN ('open', 'merchant_responded') AND due_at < $1::timestamptz LIMIT 500`,
    now,
  );
  let n = 0;
  for (const x of due) {
    n += await d.transaction(async (tx) => {
      const cur = await tx.$queryRawUnsafe<
        Array<{ order_id: string; merchant_id: string; due_at: Date; reason_code: string }>
      >(
        `SELECT s.order_id, o.merchant_id, s.due_at, s.reason_code
           FROM shop_disputes s JOIN shop_orders o ON o.order_id = s.order_id
          WHERE s.dispute_id = $1::uuid AND s.status IN ('open', 'merchant_responded')
            AND s.due_at < $2::timestamptz FOR UPDATE OF s`,
        x.dispute_id,
        now,
      );
      if (cur.length === 0) return 0;
      if (!(await closeDispute(tx, x.dispute_id, 'expired'))) return 0;
      await emit(tx, 'shop.dispute.unanswered', {
        dispute_id: x.dispute_id,
        order_id: cur[0].order_id,
        merchant_id: cur[0].merchant_id,
        reason_code: cur[0].reason_code,
        due_at: cur[0].due_at,
      });
      return 1;
    });
  }
  return n;
}
