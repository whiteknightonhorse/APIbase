/**
 * T-0339: execution_ledger is append-only. Real Postgres (TEST_DATABASE_URL, disposable): the
 * migration's trigger rejects DELETE and any UPDATE of an immutable column, and still allows the
 * four production UPDATE statements, copied verbatim from reconciliation.job.ts and escrow.service.ts.
 */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { TEST_DB_URL, dbDescribe, migrate } from '../unit/helpers/shop-db';

dbDescribe('execution_ledger immutability trigger (real Postgres)', () => {
  const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
  const tag = `t0339${Date.now().toString(36)}`;
  const toolId = `${tag}.probe`;
  let agentId: string;

  async function insertRow(status: string, billing: string, ageSeconds = 0) {
    const executionId = randomUUID();
    // Millisecond precision like the app's JS Date, so `created_at = $2` in the escrow statements matches.
    const createdAt = new Date(Math.floor(Date.now() / 1000) * 1000 - ageSeconds * 1000);
    await prisma.$executeRawUnsafe(
      `INSERT INTO execution_ledger (execution_id, agent_id, tool_id, status, billing_status, cost_usd, payer, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, 0.01, '0xpayer', $6, $6)`,
      executionId,
      agentId,
      toolId,
      status,
      billing,
      createdAt,
    );
    return { executionId, createdAt };
  }

  const state = async (executionId: string) =>
    (
      await prisma.$queryRawUnsafe<
        Array<{ status: string; billing_status: string; cost_usd: string }>
      >(
        `SELECT status, billing_status, cost_usd::text FROM execution_ledger WHERE execution_id = $1::uuid`,
        executionId,
      )
    )[0];

  beforeAll(async () => {
    migrate();
    await prisma.$executeRawUnsafe(
      `INSERT INTO tools (tool_id, name, provider, category, namespace) VALUES ($1, 'probe', $2, 'test', $2)`,
      toolId,
      tag,
    );
    const agents = await prisma.$queryRawUnsafe<Array<{ agent_id: string }>>(
      `INSERT INTO agents (api_key_hash) VALUES (md5(random()::text) || md5(random()::text)) RETURNING agent_id`,
    );
    agentId = agents[0].agent_id;
  });

  afterAll(async () => {
    // The trigger forbids DELETE by design; the test DB cleanup disables it inside one transaction.
    await prisma.$transaction([
      prisma.$executeRawUnsafe(
        `ALTER TABLE execution_ledger DISABLE TRIGGER execution_ledger_immutable`,
      ),
      prisma.$executeRawUnsafe(`DELETE FROM execution_ledger WHERE tool_id = $1`, toolId),
      prisma.$executeRawUnsafe(
        `ALTER TABLE execution_ledger ENABLE TRIGGER execution_ledger_immutable`,
      ),
      prisma.$executeRawUnsafe(`DELETE FROM tools WHERE tool_id = $1`, toolId),
    ]);
    await prisma.$disconnect();
  });

  it('trigger is listed on the table', async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ tgname: string }>>(
      `SELECT tgname FROM pg_trigger WHERE tgrelid = 'execution_ledger'::regclass AND NOT tgisinternal`,
    );
    expect(rows.map((r) => r.tgname)).toContain('execution_ledger_immutable');
  });

  it('DELETE is rejected', async () => {
    const { executionId } = await insertRow('success', 'PAID');
    await expect(
      prisma.$executeRawUnsafe(
        `DELETE FROM execution_ledger WHERE execution_id = $1::uuid`,
        executionId,
      ),
    ).rejects.toThrow(/append-only/);
    expect((await state(executionId)).status).toBe('success');
  });

  it.each([
    ['cost_usd', `cost_usd = 99`],
    ['payer', `payer = '0xother'`],
    ['tool_id', `tool_id = 'x'`],
    ['created_at', `created_at = created_at + interval '1 second'`],
    ['agent_id', `agent_id = gen_random_uuid()`],
  ])('UPDATE of %s is rejected', async (_col, setClause) => {
    const { executionId } = await insertRow('success', 'PAID');
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE execution_ledger SET ${setClause} WHERE execution_id = $1::uuid`,
        executionId,
      ),
    ).rejects.toThrow();
    expect((await state(executionId)).cost_usd).toBe('0.01000000');
  });

  it('reconciliation.job.ts:36 stall-timeout UPDATE verbatim is allowed', async () => {
    const { executionId } = await insertRow('pending', 'RESERVED', 120);
    const rows = await prisma.$queryRawUnsafe<Array<{ agent_id: string }>>(`
        WITH stalled AS (
          UPDATE execution_ledger
            SET status = 'timeout',
                billing_status = 'REFUNDED',
                updated_at = NOW()
            WHERE (status = 'pending' AND created_at < NOW() - INTERVAL '60 seconds'
                   AND billing_status = 'RESERVED')
               OR (status = 'running' AND updated_at < NOW() - INTERVAL '120 seconds'
                   AND billing_status = 'RESERVED')
            RETURNING agent_id, cost_usd::numeric AS cost_usd
        )
        SELECT agent_id, SUM(cost_usd)::double precision AS cost_usd
        FROM stalled
        GROUP BY agent_id
      `);
    expect(rows.length).toBeGreaterThan(0);
    expect(await state(executionId)).toMatchObject({
      status: 'timeout',
      billing_status: 'REFUNDED',
    });
  });

  it('reconciliation.job.ts:65 re-finalize UPDATE verbatim is allowed', async () => {
    const { executionId } = await insertRow('provider_success', 'RESERVED', 120);
    const n = await prisma.$executeRawUnsafe(`
        UPDATE execution_ledger
          SET status = 'success',
              billing_status = 'PAID',
              updated_at = NOW()
          WHERE status = 'provider_success'
            AND updated_at < NOW() - INTERVAL '30 seconds'
            AND billing_status != 'PAID'
      `);
    expect(n).toBeGreaterThan(0);
    expect(await state(executionId)).toMatchObject({ status: 'success', billing_status: 'PAID' });
  });

  it('escrow.service.ts:152 finalize UPDATE verbatim is allowed', async () => {
    const { executionId, createdAt } = await insertRow('pending', 'RESERVED');
    const n = await prisma.$executeRawUnsafe(
      `UPDATE execution_ledger
     SET status = $4,
         billing_status = 'PAID',
         provider_called = true,
         provider_latency_ms = $3,
         payload_status = $5,
         moderation_rule_id = $6,
         moderation_category = $7,
         moderation_appeal_id = $8::uuid,
         upstream_cost_usd = $9,
         updated_at = NOW()
     WHERE execution_id = $1::uuid
       AND created_at = $2
       AND billing_status != 'PAID'`,
      executionId,
      createdAt,
      42,
      'blocked',
      'BLOCKED',
      'rule-1',
      'cat-1',
      randomUUID(),
      0.002,
    );
    expect(n).toBe(1);
    expect(await state(executionId)).toMatchObject({ status: 'blocked', billing_status: 'PAID' });
  });

  it('escrow.service.ts:214 refund UPDATE verbatim is allowed', async () => {
    const { executionId, createdAt } = await insertRow('pending', 'RESERVED');
    const n = await prisma.$executeRawUnsafe(
      `UPDATE execution_ledger
       SET status = 'failed',
           billing_status = 'REFUNDED',
           provider_called = true,
           payload_status = 'FAILED',
           updated_at = NOW()
       WHERE execution_id = $1::uuid
         AND created_at = $2
         AND billing_status = 'RESERVED'`,
      executionId,
      createdAt,
    );
    expect(n).toBe(1);
    expect(await state(executionId)).toMatchObject({
      status: 'failed',
      billing_status: 'REFUNDED',
    });
  });
});
