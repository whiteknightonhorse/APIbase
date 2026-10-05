/**
 * T-INT-01 SC5 (diagram == TRANSITIONS, both ways) and SC6 (transition invariants, DB).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { TRANSITIONS, transition } from '../../src/shop/order-state';
import { parseDiagram } from './helpers/order-diagram-parser';
import { client, dbDescribe, migrate, mkMerchant, mkOrder, mkQuote } from './helpers/shop-db';

describe('SC5: order state table completeness', () => {
  const diagram = parseDiagram(
    readFileSync(join(__dirname, '../../src/shop/order-state.diagram.txt'), 'utf8'),
  );
  const table = new Set(
    Object.entries(TRANSITIONS).flatMap(([from, tos]) => tos.map((to) => `${from}->${to}`)),
  );

  it('every diagram transition is in TRANSITIONS', () => {
    expect([...diagram].filter((e) => !table.has(e))).toEqual([]);
  });
  it('every TRANSITIONS entry is in the diagram', () => {
    expect([...table].filter((e) => !diagram.has(e))).toEqual([]);
  });
  it('the parser actually read the diagram (non-trivial, sanity)', () => {
    expect(diagram.size).toBeGreaterThan(30);
    expect(diagram.has('PAYMENT_FAILED->PAYING')).toBe(true);
  });
  it('CLOSED is terminal in the table', () => {
    expect(TRANSITIONS.CLOSED).toEqual([]);
  });
});

dbDescribe('SC6: transition() invariants', () => {
  const db = client();
  beforeAll(() => migrate());
  afterAll(() => db.$disconnect());

  const run = (order: string, to: Parameters<typeof transition>[2]) =>
    db.$transaction((tx) => transition(tx, order, to, { actor: 'system', reason: 't' }));
  const events = (order: string) =>
    db.$queryRawUnsafe<Array<{ seq: number; from_state: string; to_state: string }>>(
      `SELECT seq, from_state, to_state FROM shop_order_events WHERE order_id = $1::uuid ORDER BY seq`,
      order,
    );
  const setup = async (state: string, quote?: { status?: string; expiresInS?: number }) => {
    const m = await mkMerchant(db);
    return mkOrder(db, m, await mkQuote(db, m, quote), state);
  };
  const confirmPayment = (order: string, status: string) =>
    db.$executeRawUnsafe(
      `INSERT INTO shop_payments (order_id, rail, nonce_or_challenge_id, payer, pay_to, amount_usd, chain_status)
       VALUES ($1::uuid, 'base', $2, '0xp', '0xm', 1, $3)`,
      order,
      `n-${order}-${status}`,
      status,
    );

  it('PAID without a confirmed payment -> throw; with a pending one -> throw; confirmed -> ok', async () => {
    const o = await setup('PAYING');
    await expect(run(o, 'PAID')).rejects.toThrow(/confirmed payment/);
    await confirmPayment(o, 'pending');
    await expect(run(o, 'PAID')).rejects.toThrow(/confirmed payment/);
    await db.$executeRawUnsafe(
      `UPDATE shop_payments SET chain_status = 'confirmed' WHERE order_id = $1::uuid`,
      o,
    );
    await expect(run(o, 'PAID')).resolves.toMatchObject({ from: 'PAYING', to: 'PAID', seq: 1 });
  });

  it('CLOSED -> anything throws', async () => {
    const o = await setup('CLOSED');
    await expect(run(o, 'PAID')).rejects.toThrow(/CLOSED/);
    await expect(run(o, 'QUOTED')).rejects.toThrow(/CLOSED/);
    expect(await events(o)).toHaveLength(0);
  });

  it('FULFILLED only once: second attempt throws (state no longer CONFIRMED / already fulfilled)', async () => {
    const o = await setup('CONFIRMED');
    await expect(run(o, 'FULFILLED')).resolves.toMatchObject({ seq: 1 });
    await expect(run(o, 'FULFILLED')).rejects.toThrow(/not allowed/);
    // even if the state were forced back to CONFIRMED, fulfillment_status blocks a second fulfilment
    await db.$executeRawUnsafe(
      `UPDATE shop_orders SET state = 'CONFIRMED' WHERE order_id = $1::uuid`,
      o,
    );
    await expect(run(o, 'FULFILLED')).rejects.toThrow(/already fulfilled/);
    expect(await events(o)).toHaveLength(1);
  });

  it('PAYMENT_FAILED -> PAYING needs an open, unexpired quote', async () => {
    const expiredStatus = await setup('PAYMENT_FAILED', { status: 'expired' });
    await expect(run(expiredStatus, 'PAYING')).rejects.toThrow(/no longer open/);
    const lapsed = await setup('PAYMENT_FAILED', { status: 'open', expiresInS: -5 });
    await expect(run(lapsed, 'PAYING')).rejects.toThrow(/no longer open/);
    const live = await setup('PAYMENT_FAILED', { status: 'open' });
    await expect(run(live, 'PAYING')).resolves.toMatchObject({
      from: 'PAYMENT_FAILED',
      to: 'PAYING',
    });
  });

  it('REFUNDED requires a verified refund', async () => {
    const o = await setup('REFUND_PENDING');
    await expect(run(o, 'REFUNDED')).rejects.toThrow(/verified refund/);
    await db.$executeRawUnsafe(
      `INSERT INTO shop_refunds (order_id, amount_usd, reason, requested_by, verified) VALUES ($1::uuid, 1, 'r', 'buyer', true)`,
      o,
    );
    await expect(run(o, 'REFUNDED')).resolves.toMatchObject({ to: 'REFUNDED' });
  });

  it('DISPUTED returns only to the state before the dispute', async () => {
    const o = await setup('CONFIRMED');
    await run(o, 'DISPUTED');
    await expect(run(o, 'SHIPPED')).rejects.toThrow(/may only return to CONFIRMED/);
    await expect(run(o, 'CONFIRMED')).resolves.toMatchObject({
      from: 'DISPUTED',
      to: 'CONFIRMED',
      seq: 2,
    });
  });

  it('each success = exactly one event with the right seq; rollback leaves no event and no state change', async () => {
    const o = await setup('QUOTED');
    await run(o, 'PAYING');
    await run(o, 'PAYMENT_FAILED');
    expect(await events(o)).toEqual([
      { seq: 1, from_state: 'QUOTED', to_state: 'PAYING' },
      { seq: 2, from_state: 'PAYING', to_state: 'PAYMENT_FAILED' },
    ]);
    await expect(
      db.$transaction(async (tx) => {
        await transition(tx, o, 'PAYING', { actor: 'buyer' });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await events(o)).toHaveLength(2);
    const st = await db.$queryRawUnsafe<Array<{ state: string }>>(
      `SELECT state FROM shop_orders WHERE order_id = $1::uuid`,
      o,
    );
    expect(st[0].state).toBe('PAYMENT_FAILED');
  });
});
