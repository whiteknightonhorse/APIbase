/** T-0321 P1: a registered job leaves a worker_job_runs row. Disposable Postgres via TEST_DATABASE_URL. */
import { PrismaClient } from '@prisma/client';
import { dbDescribe, migrate } from './helpers/shop-db';

let tick: () => void = () => {};
jest.mock('node-cron', () => ({
  __esModule: true,
  default: {
    schedule: jest.fn((_e: string, fn: () => void) => {
      tick = fn;
      return { stop: jest.fn() };
    }),
  },
}));

dbDescribe('worker_job_runs (real Postgres)', () => {
  beforeAll(() => migrate());

  it('P1: finished row has last_finished_at >= last_started_at', async () => {
    const { registerJob } = await import('../../src/worker/job-runner');
    registerJob({
      name: 'p1-job',
      cron: '* * * * *',
      expect_every_s: 60,
      run: async () => ({ n: 2 }),
    });
    tick();
    const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
    try {
      let rows: Array<{
        ok: boolean | null;
        ordered: boolean | null;
        n: string | null;
        total: number;
      }> = [];
      for (let i = 0; i < 50 && !rows[0]?.ordered; i++) {
        await new Promise((r) => setTimeout(r, 100));
        rows = await db.$queryRawUnsafe(
          `SELECT last_ok AS ok, (last_finished_at >= last_started_at) AS ordered,
                  last_result->>'n' AS n, runs_total::int AS total
           FROM worker_job_runs WHERE job = 'p1-job'`,
        );
      }
      expect(rows[0]).toMatchObject({ ok: true, ordered: true, n: '2' });
      expect(rows[0].total).toBe(1);
    } finally {
      await db.$executeRawUnsafe(`DELETE FROM worker_job_runs WHERE job = 'p1-job'`);
      await db.$disconnect();
    }
  });
});
