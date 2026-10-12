/**
 * T-0338 item 2: with BILLING_NO_CHARGE_ON_INPUT_REJECTED=true an x402 call whose upstream rejected
 * the input (provider_input_rejected) is released -- no settle call -- and the execution_ledger row is
 * NOT_CHARGED. Flag off = unchanged (no settle, no ledger row, MPP refund-owed untouched).
 * Real Postgres (TEST_DATABASE_URL, disposable); the facilitator settle is mocked.
 */
import { randomUUID } from 'node:crypto';
import { runPipeline, PIPELINE_STAGES } from '../../src/pipeline/pipeline';
import { createPipelineContext, ok, err } from '../../src/pipeline/types';
import { client, dbDescribe, migrate } from './helpers/shop-db';

const mockDb: { c?: ReturnType<typeof client> } = {};
jest.mock('../../src/services/prisma.service', () => ({ getPrisma: () => mockDb.c }));
jest.mock('../../src/config/index', () => ({
  config: {
    X402_NETWORK: 'base',
    X402_PAYMENT_ADDRESS: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
    X402_FACILITATOR_URL: 'https://facilitator.example',
    X402_FACILITATOR_MODE: 'local',
    X402_OPERATOR_PRIVATE_KEY: '0x00',
    X402_BASE_RPC_URL: 'https://base.example',
    X402_BASE_SEPOLIA_RPC_URL: 'https://sepolia.example',
    X402_OPERATOR_MIN_ETH_BALANCE: 0.01,
  },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/services/x402-server.service', () => ({
  getSharedResourceServer: () => ({}),
}));
jest.mock('../../src/adapters/registry', () => ({ resolveAdapter: jest.fn() }));
const mockSettle = jest.fn();
jest.mock('../../src/pipeline/stages/x402-settle', () => ({
  settleX402: (...a: unknown[]) => mockSettle(...a),
}));
jest.mock('../../src/services/redis.service', () => ({}));
jest.mock('../../src/services/cache.service', () => ({ releaseLock: async () => undefined }));

const E = process['env'];
const FLAG = 'BILLING_NO_CHARGE_ON_INPUT_REJECTED';

dbDescribe('T-0338 no charge on provider_input_rejected', () => {
  const prisma = client();
  mockDb.c = prisma;
  const toolId = `t0338.fixture.${Date.now().toString(36)}`;
  let agentId: string;

  beforeAll(async () => {
    migrate();
    agentId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO agents (agent_id, api_key_hash) VALUES ($1::uuid, $2)`,
      agentId,
      agentId.replace(/-/g, '').padEnd(64, '0'),
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO tools (tool_id, name, provider, category, namespace, status_source, status_reason, status_changed_at)
       VALUES ($1, $1, 't0338', 'test', 't0338', 'manual', 'test fixture', now())`,
      toolId,
    );
  });
  afterAll(() => prisma.$disconnect());
  beforeEach(() => {
    mockSettle.mockReset();
    delete E[FLAG];
  });

  /** Every stage passes except PROVIDER_CALL, which fails like a rejected-input upstream (422). */
  function stubStages(inputRejected: boolean) {
    for (const s of PIPELINE_STAGES) {
      if (s.name === 'ESCROW_FINALIZE' || s.name === 'LEDGER_WRITE') continue;
      jest.spyOn(s, 'execute').mockImplementation(async (c) => {
        if (s.name !== 'PROVIDER_CALL') return ok(c);
        c.providerCalled = true;
        c.providerInputRejected = inputRejected;
        return err({ code: 422, error: 'provider_input_rejected', message: 'bad input' });
      });
    }
  }
  afterEach(() => jest.restoreAllMocks());

  function x402Ctx() {
    const ctx = createPipelineContext('r-t0338', 'POST', '/mcp', {}, {});
    Object.assign(ctx, {
      toolId,
      agentId,
      executionId: randomUUID(),
      x402Paid: true,
      x402PaymentHeader: 'hdr',
      x402Payer: '0xPAYER',
      toolPrice: 0.02,
    });
    return ctx;
  }
  const ledgerRows = (id: string) =>
    prisma.$queryRawUnsafe<Array<Record<string, string>>>(
      `SELECT billing_status, status, cost_usd::text AS cost_usd, payer FROM execution_ledger WHERE execution_id = $1::uuid`,
      id,
    );

  it('flag on: x402 422 -> no settle call, ledger NOT_CHARGED / provider_input_rejected / cost 0', async () => {
    E[FLAG] = 'true';
    stubStages(true);
    const ctx = x402Ctx();
    const r = await runPipeline(ctx);
    expect(!r.ok && r.error.code).toBe(422);
    expect(mockSettle).not.toHaveBeenCalled();
    expect(await ledgerRows(ctx.executionId!)).toEqual([
      {
        billing_status: 'NOT_CHARGED',
        status: 'provider_input_rejected',
        cost_usd: '0.00000000',
        payer: '0xPAYER',
      },
    ]);
  });

  it('flag off: unchanged -- no settle, no ledger row', async () => {
    stubStages(true);
    const ctx = x402Ctx();
    await runPipeline(ctx);
    expect(mockSettle).not.toHaveBeenCalled();
    expect(await ledgerRows(ctx.executionId!)).toEqual([]);
  });

  it('flag on but the failure is not an input rejection (502): unchanged', async () => {
    E[FLAG] = 'true';
    stubStages(false);
    const ctx = x402Ctx();
    await runPipeline(ctx);
    expect(mockSettle).not.toHaveBeenCalled();
    expect(await ledgerRows(ctx.executionId!)).toEqual([]);
  });
});
