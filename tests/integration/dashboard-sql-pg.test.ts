/**
 * T-0329: the dashboard provider aggregate must average execution_ledger.provider_latency_ms (the
 * column ledger.service.ts actually writes), not latency_ms (never written). Runs the real SQL in
 * getDashboardData() against a disposable Postgres (TEST_DATABASE_URL); only redis is stubbed.
 */
import { PrismaClient } from '@prisma/client';
import * as prismaService from '../../src/services/prisma.service';
import { TEST_DB_URL, dbDescribe, migrate } from '../unit/helpers/shop-db';

jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: jest.fn().mockRejectedValue(new Error('redis unavailable in this test')),
  getSharedRedis: jest.fn(),
}));

dbDescribe('dashboard SQL on real Postgres', () => {
  const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
  const provider = `t0329prov${Date.now().toString(36)}`;
  const toolId = `${provider}.probe`;

  beforeAll(async () => {
    migrate();
    // The init migration only creates today's and tomorrow's partitions; the 24h window can reach yesterday.
    await prisma.$executeRawUnsafe(`
      DO $$
      DECLARE d DATE := CURRENT_DATE - 1;
      BEGIN
        EXECUTE format(
          'CREATE TABLE IF NOT EXISTS execution_ledger_%s PARTITION OF execution_ledger FOR VALUES FROM (%L) TO (%L)',
          to_char(d, 'YYYY_MM_DD'), d, d + 1);
      END $$`);
    await prisma.$executeRawUnsafe(
      `INSERT INTO tools (tool_id, name, provider, category, namespace) VALUES ($1, 'probe', $2, 'test', $2)`,
      toolId,
      provider,
    );
    const agents = await prisma.$queryRawUnsafe<Array<{ agent_id: string }>>(
      `INSERT INTO agents (api_key_hash) VALUES (md5(random()::text) || md5(random()::text)) RETURNING agent_id`,
    );
    const agent = agents[0].agent_id;
    const ins = (hoursAgo: number, billing: string, latency: number | null, cache: string) =>
      prisma.$executeRawUnsafe(
        `INSERT INTO execution_ledger (agent_id, tool_id, status, billing_status, provider_latency_ms, cache_status, created_at)
         VALUES ($1::uuid, $2, 'success', $3, $4::int, $5, now() - ($6::int * interval '1 minute'))`,
        agent,
        toolId,
        billing,
        latency,
        cache,
        hoursAgo * 60,
      );
    await ins(1, 'PAID', 100, 'MISS');
    await ins(2, 'PAID', 300, 'MISS');
    await ins(0, 'FREE', null, 'HIT');
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM execution_ledger WHERE tool_id = $1`, toolId);
    await prisma.$executeRawUnsafe(`DELETE FROM tools WHERE tool_id = $1`, toolId);
    await prisma.$disconnect();
    const { shutdownPrisma } = await import('../../src/services/prisma.service');
    await shutdownPrisma();
  });

  it('real SQL: avg_latency_ms skips cache-hit NULLs, calls_24h and paid_calls_24h per billing_status', async () => {
    const { getPrisma } = prismaService;
    const { getDashboardData } = await import('../../src/services/dashboard.service');
    // Observe the raw aggregate rows (paid_calls_24h is not in the API payload) while still running the real query.
    const real = getPrisma();
    let raw: Array<{ provider: string; paid_calls_24h: bigint }> = [];
    const spy = jest.spyOn(prismaService, 'getPrisma').mockReturnValue(
      new Proxy(real, {
        get: (target, prop, recv) =>
          prop === '$queryRawUnsafe'
            ? async (...args: unknown[]) => {
                const rows = await (
                  target.$queryRawUnsafe as (...a: unknown[]) => Promise<typeof raw>
                )(...args);
                if (rows.some((r) => 'paid_calls_24h' in r)) raw = rows;
                return rows;
              }
            : Reflect.get(target, prop, recv),
      }),
    );
    const data = await getDashboardData();
    spy.mockRestore();

    const entry = data.providers.find((p) => p.provider === provider);
    expect(entry).toBeDefined();
    expect(entry!.avg_latency_ms).toBe(200);
    expect(entry!.calls_24h).toBe(3);
    expect(Number(raw.find((r) => r.provider === provider)!.paid_calls_24h)).toBe(2);
  });
});
