import type { ShopTx } from './db';

/**
 * Order state machine (spec section 5.3). TRANSITIONS is the single source of truth;
 * tests/unit/shop-order-state.test.ts proves it equals order-state.diagram.txt both ways.
 *
 * "Any of PAID…DELIVERED" in the diagram = PAID, CONFIRMED, FULFILLED, SHIPPED, DELIVERED
 * (ACTIVE_STATES). "continues the path" / "returns to the previous state" = back into that set.
 */
export type State =
  | 'QUOTED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'PAYING'
  | 'PAYMENT_FAILED'
  | 'PAID'
  | 'CONFIRMED'
  | 'FULFILLED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CLOSED'
  | 'REFUND_PENDING'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED'
  | 'DISPUTED';

export type Actor = 'buyer' | 'merchant' | 'system' | 'autopilot';

export const ALL_STATES: readonly State[] = [
  'QUOTED',
  'EXPIRED',
  'CANCELLED',
  'PAYING',
  'PAYMENT_FAILED',
  'PAID',
  'CONFIRMED',
  'FULFILLED',
  'SHIPPED',
  'DELIVERED',
  'CLOSED',
  'REFUND_PENDING',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
  'DISPUTED',
];

export const ACTIVE_STATES: readonly State[] = [
  'PAID',
  'CONFIRMED',
  'FULFILLED',
  'SHIPPED',
  'DELIVERED',
];

export const TRANSITIONS: Record<State, State[]> = {
  QUOTED: ['EXPIRED', 'CANCELLED', 'PAYING'],
  EXPIRED: [],
  CANCELLED: [],
  PAYING: ['PAYMENT_FAILED', 'PAID'],
  PAYMENT_FAILED: ['PAYING', 'PAID'],
  PAID: ['CONFIRMED', 'REFUND_PENDING', 'DISPUTED'],
  CONFIRMED: ['FULFILLED', 'SHIPPED', 'REFUND_PENDING', 'DISPUTED'],
  FULFILLED: ['CLOSED', 'REFUND_PENDING', 'DISPUTED'],
  SHIPPED: ['DELIVERED', 'REFUND_PENDING', 'DISPUTED'],
  DELIVERED: ['CLOSED', 'REFUND_PENDING', 'DISPUTED'],
  CLOSED: [],
  REFUND_PENDING: ['REFUNDED', 'PARTIALLY_REFUNDED'],
  REFUNDED: [],
  PARTIALLY_REFUNDED: ['PAID', 'CONFIRMED', 'FULFILLED', 'SHIPPED', 'DELIVERED'],
  DISPUTED: ['PAID', 'CONFIRMED', 'FULFILLED', 'SHIPPED', 'DELIVERED', 'REFUND_PENDING'],
};

export class OrderTransitionError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'OrderTransitionError';
  }
}

export interface TransitionMeta {
  actor: Actor;
  reason?: string;
  payload?: Record<string, unknown>;
}

export interface TransitionResult {
  from: State;
  to: State;
  seq: number;
}

interface OrderRow {
  state: State;
  quote_id: string;
  fulfillment_status: string;
}

const fail = (code: string, msg: string): never => {
  throw new OrderTransitionError(msg, code);
};

/**
 * Move an order to `to`. MUST be called inside a transaction (`tx`): the state UPDATE and
 * the shop_order_events INSERT commit or roll back together. The order row is locked
 * FOR UPDATE, so seq = max+1 cannot race.
 */
export async function transition(
  tx: ShopTx,
  order_id: string,
  to: State,
  meta: TransitionMeta,
): Promise<TransitionResult> {
  const rows = await tx.$queryRawUnsafe<OrderRow[]>(
    `SELECT state, quote_id, fulfillment_status FROM shop_orders WHERE order_id = $1::uuid FOR UPDATE`,
    order_id,
  );
  const order = rows[0];
  if (!order) return fail('ORDER_NOT_FOUND', `order ${order_id} not found`);
  const from = order.state;

  if (from === 'CLOSED') return fail('TERMINAL', `order ${order_id} is CLOSED (terminal)`);
  if (!(TRANSITIONS[from] ?? []).includes(to)) {
    return fail('ILLEGAL_TRANSITION', `${from} -> ${to} is not allowed`);
  }

  if (to === 'PAID') {
    const paid = await tx.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM shop_payments WHERE order_id = $1::uuid AND chain_status = 'confirmed' LIMIT 1`,
      order_id,
    );
    if (paid.length === 0)
      return fail('PAYMENT_NOT_CONFIRMED', `PAID requires a confirmed payment`);
  }

  if (from === 'PAYMENT_FAILED' && to === 'PAYING') {
    const open = await tx.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM shop_quotes WHERE quote_id = $1::uuid AND status = 'open' AND expires_at > now()`,
      order.quote_id,
    );
    if (open.length === 0)
      return fail('QUOTE_NOT_OPEN', `quote is no longer open: PAYMENT_FAILED -> PAYING refused`);
  }

  if (to === 'FULFILLED' && from === 'CONFIRMED' && order.fulfillment_status === 'fulfilled') {
    return fail('ALREADY_FULFILLED', `order ${order_id} was already fulfilled`);
  }

  if (to === 'REFUNDED' || to === 'PARTIALLY_REFUNDED') {
    const verified = await tx.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM shop_refunds WHERE order_id = $1::uuid AND verified = true LIMIT 1`,
      order_id,
    );
    if (verified.length === 0)
      return fail('REFUND_NOT_VERIFIED', `${to} requires a verified refund`);
  }

  if (from === 'DISPUTED' && to !== 'REFUND_PENDING') {
    // resolved_* returns to the state the order was in before the dispute
    const prior = await tx.$queryRawUnsafe<Array<{ from_state: string | null }>>(
      `SELECT from_state FROM shop_order_events
        WHERE order_id = $1::uuid AND to_state = 'DISPUTED' ORDER BY seq DESC LIMIT 1`,
      order_id,
    );
    if (prior[0]?.from_state && prior[0].from_state !== to) {
      return fail(
        'NOT_PRIOR_STATE',
        `DISPUTED may only return to ${prior[0].from_state}, not ${to}`,
      );
    }
  }

  const seqRows = await tx.$queryRawUnsafe<Array<{ next: number }>>(
    `SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM shop_order_events WHERE order_id = $1::uuid`,
    order_id,
  );
  const seq = Number(seqRows[0]?.next ?? 1);

  await tx.$executeRawUnsafe(
    `UPDATE shop_orders
        SET state = $2,
            fulfillment_status = CASE WHEN $2 = 'FULFILLED' THEN 'fulfilled' ELSE fulfillment_status END,
            updated_at = now()
      WHERE order_id = $1::uuid`,
    order_id,
    to,
  );
  await tx.$executeRawUnsafe(
    `INSERT INTO shop_order_events (order_id, seq, from_state, to_state, actor, reason, payload)
     VALUES ($1::uuid, $2::int, $3, $4, $5, $6, $7::jsonb)`,
    order_id,
    seq,
    from,
    to,
    meta.actor,
    meta.reason ?? null,
    JSON.stringify(meta.payload ?? {}),
  );
  return { from, to, seq };
}

/**
 * Creation of an order: the automaton (§5.3) starts at QUOTED, so the row and its first event
 * (`null -> QUOTED`, seq 1) are written together. Call inside the quote transaction.
 */
export async function createQuotedOrder(
  tx: ShopTx,
  o: {
    quote_id: string;
    merchant_id: string;
    total_usd: string;
    fee_usd: string;
    actor?: Actor;
  },
): Promise<string> {
  const rows = await tx.$queryRawUnsafe<Array<{ order_id: string }>>(
    `INSERT INTO shop_orders (quote_id, merchant_id, state, total_usd, fee_usd)
     VALUES ($1::uuid, $2::uuid, 'QUOTED', $3::numeric, $4::numeric) RETURNING order_id`,
    o.quote_id,
    o.merchant_id,
    o.total_usd,
    o.fee_usd,
  );
  const order_id = rows[0].order_id;
  await tx.$executeRawUnsafe(
    `INSERT INTO shop_order_events (order_id, seq, from_state, to_state, actor, reason, payload)
     VALUES ($1::uuid, 1, NULL, 'QUOTED', $2, NULL, '{}'::jsonb)`,
    order_id,
    o.actor ?? 'buyer',
  );
  return order_id;
}
