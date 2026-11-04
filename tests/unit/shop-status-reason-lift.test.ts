/**
 * T-0707: an operator lift of status_reason unresponsive|disputes holds. After the lift the two automatic
 * flags count only orders settled after `status_reason_cleared_at`. Real Postgres (TEST_DATABASE_URL).
 */
import { randomUUID } from 'node:crypto';
import { runShopSlaSweeper } from '../../src/jobs/shop-sla-sweeper.job';
import { refreshReputations } from '../../src/shop/reputation.service';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';
import { run as runStatus, type StatusTx } from '../../scripts/shop/merchant-status';
import { client, dbDescribe, migrate, mkMerchant } from './helpers/shop-db';

jest.mock('../../src/config/index', () => ({
  config: { ENCRYPTION_KEY: 'k'.repeat(40), X402_NETWORK: 'base' },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

type Row = Record<string, any>;
const H = 3_600_000;
const PAYER = '0x00000000000000000000000000000000000a11ce';

dbDescribe('T-0707 operator lift of status_reason', () => {
  const prisma = client();
  const deps: ShopDeps = {
    db: prisma as never,
    transaction: (fn) => prisma.$transaction((tx) => fn(tx as never)),
    redis: { incr: async () => 1, expire: async () => 1 } as never,
  };
  const q = (sql: string, ...v: unknown[]) => prisma.$queryRawUnsafe<Row[]>(sql, ...v);
  const x = (sql: string, ...v: unknown[]) => prisma.$executeRawUnsafe(sql, ...v);
  let n = 0;
  const tag = () => `${Date.now().toString(36)}s${n++}`;
  const past = (hours: number) => new Date(Date.now() - hours * H).toISOString();
  const lift = (slug: string, reason: string) =>
    runStatus(
      ['--slug', slug, '--clear-reason', reason, '--actor', 'op-test', '--note', 'drill lift'],
      prisma as unknown as StatusTx,
    );

  beforeAll(() => migrate());
  afterAll(() => prisma.$disconnect());

  async function merchant() {
    const m = await mkMerchant(prisma, tag());
    await x(`UPDATE shop_merchants SET status = 'active' WHERE merchant_id = $1::uuid`, m);
    const slug = (await q(`SELECT slug FROM shop_merchants WHERE merchant_id = $1::uuid`, m))[0]
      .slug;
    return { m, slug: slug as string };
  }
  /** An order settled `settledAgo` ago (negative = after now); `lateDue` makes it PAID and overdue. */
  async function order(m: string, state: string, settledAgo: string, lateDue = false) {
    const quote = (
      await q(
        `INSERT INTO shop_quotes (merchant_id, buyer_identity, items, subtotal, total_usd, expires_at, status)
         VALUES ($1::uuid, 'agent:none', '[]'::jsonb, 5, 5, now() + interval '10 minutes', 'paid')
         RETURNING quote_id`,
        m,
      )
    )[0].quote_id;
    return (
      await q(
        `INSERT INTO shop_orders (quote_id, merchant_id, state, total_usd, payer_wallet, settled_at, confirm_due_at)
         VALUES ($1::uuid, $2::uuid, $3, 5, $4, now() - $5::interval, $6::timestamptz) RETURNING order_id`,
        quote,
        m,
        state,
        PAYER,
        settledAgo,
        lateDue ? past(1) : null,
      )
    )[0].order_id as string;
  }
  const reasonOf = async (m: string) =>
    (await q(`SELECT status_reason FROM shop_merchants WHERE merchant_id = $1::uuid`, m))[0]
      .status_reason;
  const suspendedEvents = async (m: string) =>
    Number(
      (
        await q(
          `SELECT count(*)::int AS c FROM outbox
            WHERE event_type = 'shop.merchant.disputes_suspended' AND payload->>'merchant_id' = $1`,
          m,
        )
      )[0].c,
    );
  const dispute = (orderId: string) =>
    x(
      `INSERT INTO shop_disputes (order_id, opened_by, reason_code, status)
       VALUES ($1::uuid, 'agent:drill', 'agent_error', 'expired')`,
      orderId,
    );

  it('T1: unresponsive; lift; a fourth late order alone does not re-flag; three new late orders do', async () => {
    const { m, slug } = await merchant();
    for (let i = 0; i < 3; i++) await order(m, 'PAID', `${50 + i} hours`, true);
    await runShopSlaSweeper(deps);
    expect(await reasonOf(m)).toBe('unresponsive');

    const r = await lift(slug, 'unresponsive');
    expect(r.exitCode).toBe(0);
    expect(await reasonOf(m)).toBeNull();

    await order(m, 'PAID', '-1 hour', true);
    await runShopSlaSweeper(deps);
    expect(await reasonOf(m)).toBeNull();

    await order(m, 'PAID', '-2 hours', true);
    await order(m, 'PAID', '-3 hours', true);
    await runShopSlaSweeper(deps);
    expect(await reasonOf(m)).toBe('unresponsive');
  });

  it('T2: disputes (one expired agent_error dispute over 10 closed); lift; no re-flag; new window re-flags', async () => {
    const { m, slug } = await merchant();
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) ids.push(await order(m, 'CLOSED', `${10 + i} days`));
    await dispute(ids[0]);
    const t0 = new Date();
    await refreshReputations(deps, t0);
    expect(await reasonOf(m)).toBe('disputes');
    expect(await suspendedEvents(m)).toBe(1);

    expect((await lift(slug, 'disputes')).exitCode).toBe(0);
    const t1 = new Date(t0.getTime() + 2 * H);
    await refreshReputations(deps, t1);
    expect(await reasonOf(m)).toBeNull();
    expect(await suspendedEvents(m)).toBe(1);
    // the published reputation stays all-time
    const rep = (
      await q(`SELECT reputation FROM shop_merchants WHERE merchant_id = $1::uuid`, m)
    )[0].reputation;
    expect(rep.dispute_rate).toBe(0.1);
    expect(rep.orders_closed).toBe(10);

    const fresh: string[] = [];
    for (let i = 0; i < 10; i++) fresh.push(await order(m, 'CLOSED', `-${1 + i} minutes`));
    await dispute(fresh[0]);
    await refreshReputations(deps, new Date(t0.getTime() + 4 * H));
    expect(await reasonOf(m)).toBe('disputes');
    expect(await suspendedEvents(m)).toBe(2);
  });

  it('T3: the script refuses other reasons and exits 2 on a merchant without that reason', async () => {
    const { m, slug } = await merchant();
    await x(
      `UPDATE shop_merchants SET status_reason = 'fee_overdue_suspended' WHERE merchant_id = $1::uuid`,
      m,
    );
    await expect(lift(slug, 'fee_overdue_suspended')).rejects.toThrow(/--clear-reason/);
    const none = await lift(slug, 'disputes');
    expect(none.exitCode).toBe(2);
    expect(none.output).toMatchObject({
      slug,
      status: 'active',
      status_reason: 'fee_overdue_suspended',
    });
    expect(await reasonOf(m)).toBe('fee_overdue_suspended');
    const missing = await lift(`nope-${randomUUID()}`, 'disputes');
    expect(missing.exitCode).toBe(2);
  });

  it('T4: the audit event is written once, with actor and note', async () => {
    const { m, slug } = await merchant();
    await x(`UPDATE shop_merchants SET status_reason = 'disputes' WHERE merchant_id = $1::uuid`, m);
    const r = await lift(slug, 'disputes');
    expect(r.output).toMatchObject({ slug, old_reason: 'disputes' });
    expect(Object.keys(r.output).sort()).toEqual(['cleared_at', 'old_reason', 'slug']);
    expect((await lift(slug, 'disputes')).exitCode).toBe(2);
    const ev = await q(
      `SELECT payload FROM outbox WHERE event_type = 'shop.merchant.reason_cleared'
          AND payload->>'merchant_id' = $1`,
      m,
    );
    expect(ev).toHaveLength(1);
    expect(ev[0].payload).toMatchObject({
      merchant_id: m,
      slug,
      reason: 'disputes',
      actor: 'op-test',
      note: 'drill lift',
    });
    expect(typeof ev[0].payload.cleared_at).toBe('string');
  });
});
