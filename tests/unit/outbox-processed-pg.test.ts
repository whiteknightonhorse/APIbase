/**
 * T-0305 OP1-OP2: outbox rows inserted with DEFAULT now() keep microseconds in created_at; processBatch
 * must still flip processed=true on them. Real Postgres (TEST_DATABASE_URL, disposable); redis is a mock.
 */
import {
  HANDLED_EVENT_TYPES,
  SELECT_SQL,
  processBatch,
  type OutboxEvent,
} from '../../src/outbox/processor';
import type { ProcessorDeps } from '../../src/outbox/processor';
import { PrismaClient } from '@prisma/client';
import { TEST_DB_URL, dbDescribe, migrate, mkMerchant } from './helpers/shop-db';

dbDescribe('outbox processed flag on microsecond created_at', () => {
  // Not client(): it pins DATABASE_URL at describe time, which makes migrate()'s own guard refuse.
  const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
  const redis = { status: 'ready', connect: jest.fn(), scan: jest.fn(), del: jest.fn() };
  const deps: ProcessorDeps = {
    queryRaw: (sql, ...params) => prisma.$queryRawUnsafe(sql, ...params),
    executeRaw: (sql, ...params) => prisma.$executeRawUnsafe(sql, ...params),
    redis: () => redis,
    log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  };
  const owned = [...HANDLED_EVENT_TYPES];

  beforeAll(() => migrate());
  afterAll(() => prisma.$disconnect());

  async function insertMicrosecondRow(merchantId: string): Promise<bigint> {
    for (let i = 0; i < 20; i++) {
      const rows = await prisma.$queryRawUnsafe<Array<{ id: bigint; micro: number }>>(
        `INSERT INTO outbox (event_type, payload) VALUES ('shop.order.paid', $1::jsonb)
         RETURNING id, (EXTRACT(MICROSECONDS FROM created_at)::bigint % 1000)::int AS micro`,
        JSON.stringify({ merchant_id: merchantId }),
      );
      if (rows[0].micro !== 0) return rows[0].id;
      await prisma.$executeRawUnsafe(`DELETE FROM outbox WHERE id = $1`, rows[0].id);
    }
    throw new Error('could not get a sub-millisecond created_at');
  }

  it('OP1: DEFAULT now() row is marked processed and delivered once', async () => {
    const merchantId = await mkMerchant(prisma);
    const eps = await prisma.$queryRawUnsafe<Array<{ endpoint_id: string }>>(
      `INSERT INTO shop_webhook_endpoints (merchant_id, url, secret_hash, events)
       VALUES ($1::uuid, 'https://hook.example/x', 'h', ARRAY['order.paid']) RETURNING endpoint_id`,
      merchantId,
    );
    const id = await insertMicrosecondRow(merchantId);

    const events = (await deps.queryRaw(SELECT_SQL, 100, owned)) as OutboxEvent[];
    const mine = events.filter((e) => e.id === id);
    expect(mine).toHaveLength(1);
    expect(await processBatch(mine, deps)).toBe(1);

    const row = await prisma.$queryRawUnsafe<Array<{ processed: boolean }>>(
      `SELECT processed FROM outbox WHERE id = $1`,
      id,
    );
    expect(row[0].processed).toBe(true);
    const del = await prisma.$queryRawUnsafe<Array<{ c: number }>>(
      `SELECT count(*)::int AS c FROM shop_webhook_deliveries WHERE outbox_id = $1 AND endpoint_id = $2::uuid`,
      id,
      eps[0].endpoint_id,
    );
    expect(del[0].c).toBe(1);
  });

  it('OP2: second poll returns nothing for the row and creates no new deliveries', async () => {
    const merchantId = await mkMerchant(prisma);
    await prisma.$queryRawUnsafe(
      `INSERT INTO shop_webhook_endpoints (merchant_id, url, secret_hash, events)
       VALUES ($1::uuid, 'https://hook.example/y', 'h', ARRAY['order.paid'])`,
      merchantId,
    );
    const id = await insertMicrosecondRow(merchantId);
    const first = ((await deps.queryRaw(SELECT_SQL, 100, owned)) as OutboxEvent[]).filter(
      (e) => e.id === id,
    );
    await processBatch(first, deps);

    const again = ((await deps.queryRaw(SELECT_SQL, 100, owned)) as OutboxEvent[]).filter(
      (e) => e.id === id,
    );
    expect(again).toHaveLength(0);
    await processBatch(again, deps);
    const del = await prisma.$queryRawUnsafe<Array<{ c: number }>>(
      `SELECT count(*)::int AS c FROM shop_webhook_deliveries WHERE outbox_id = $1`,
      id,
    );
    expect(del[0].c).toBe(1);
  });
});
