import {
  HANDLED_EVENT_TYPES,
  LAG_SQL,
  SELECT_SQL,
  processBatch,
  processEvent,
  type OutboxEvent,
  type ProcessorDeps,
} from '../../src/outbox/processor';

function ev(event_type: string, payload: unknown = {}, id = 1n): OutboxEvent {
  return { id, created_at: new Date('2026-10-05T00:00:00Z'), event_type, payload };
}

function makeDeps() {
  const redis = {
    status: 'ready',
    connect: jest.fn(),
    scan: jest.fn().mockResolvedValue(['0', ['cache:t1:a', 'cache:t1:b']]),
    del: jest.fn().mockResolvedValue(2),
  };
  const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const deps = {
    queryRaw: jest.fn(),
    executeRaw: jest.fn().mockResolvedValue(1),
    redis: () => redis,
    log,
  } as unknown as ProcessorDeps & { executeRaw: jest.Mock; queryRaw: jest.Mock };
  return { deps, redis, log };
}

describe('outbox processor (T-0259)', () => {
  it('O1: cache_invalidate scans/deletes cache:<tool>:* then exactly one UPDATE processed=true', async () => {
    const { deps, redis } = makeDeps();
    const e = ev('cache_invalidate', { tool_id: 't1' });
    const n = await processBatch([e], deps);
    expect(n).toBe(1);
    expect(redis.scan).toHaveBeenCalledWith('0', 'MATCH', 'cache:t1:*', 'COUNT', 100);
    expect(redis.del).toHaveBeenCalledWith('cache:t1:a', 'cache:t1:b');
    expect(deps.executeRaw).toHaveBeenCalledTimes(1);
    const [sql, id, createdAt] = deps.executeRaw.mock.calls[0];
    expect(sql).toMatch(/UPDATE outbox SET processed = true/);
    expect(id).toBe(e.id);
    expect(createdAt).toBe(e.created_at);
  });

  it('O2: both the select SQL and the lag SQL filter by event_type; owned list has no money types', () => {
    expect(SELECT_SQL).toMatch(/event_type = ANY\(\$2\)/);
    expect(LAG_SQL).toMatch(/event_type = ANY\(\$1\)/);
    expect([...HANDLED_EVENT_TYPES]).toEqual([
      'cache_invalidate',
      'TOOL_CONFIG_UPDATED',
      'form_submission',
      // T-INT-14: the webhook consumer — shop.* only, never a money type
      'shop.order.paid',
      'shop.order.confirmed',
      'shop.order.cancelled',
      'shop.refund.requested',
      'shop.catalog.rejected',
      'shop.merchant.key_rotated',
      'shop.order.confirm_overdue',
      'shop.refund.overdue',
    ]);
    expect(HANDLED_EVENT_TYPES).not.toContain('mpp_refund_owed');
    expect(HANDLED_EVENT_TYPES).not.toContain('x402_settle_failed');
  });

  it('O3: unknown event type → false, no UPDATE, one warn', async () => {
    const { deps, log } = makeDeps();
    expect(await processEvent(ev('mpp_refund_owed'), deps)).toBe(false);
    expect(deps.executeRaw).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledTimes(1);
    // and through the batch path the row is never marked
    expect(await processBatch([ev('x402_settle_failed')], deps)).toBe(0);
    expect(deps.executeRaw).not.toHaveBeenCalled();
  });

  it('O4: a throwing handler is not marked processed and the loop continues', async () => {
    const { deps, redis } = makeDeps();
    redis.scan.mockRejectedValueOnce(new Error('redis down'));
    const bad = ev('cache_invalidate', { tool_id: 't1' }, 1n);
    const good = ev('cache_invalidate', { tool_id: 't2' }, 2n);
    const n = await processBatch([bad, good], deps);
    expect(n).toBe(1);
    expect(deps.executeRaw).toHaveBeenCalledTimes(1);
    expect(deps.executeRaw.mock.calls[0][1]).toBe(2n);
  });

  it('O5: form_submission → true, one UPDATE, contact_email never logged', async () => {
    const { deps, log } = makeDeps();
    const e = ev('form_submission', {
      submission_id: 's1',
      company_name: 'Acme',
      category: 'travel',
      contact_email: 'secret@example.com',
    });
    expect(await processBatch([e], deps)).toBe(1);
    expect(deps.executeRaw).toHaveBeenCalledTimes(1);
    expect(log.info).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.info.mock.calls[0])).not.toContain('secret@example.com');
    expect(JSON.stringify(log.info.mock.calls[0])).not.toContain('contact_email');
  });

  it('O6: batch result counts handled events, not batch length', async () => {
    const { deps, redis } = makeDeps();
    redis.scan.mockRejectedValueOnce(new Error('boom'));
    const n = await processBatch(
      [ev('cache_invalidate', { tool_id: 'a' }, 1n), ev('cache_invalidate', { tool_id: 'b' }, 2n)],
      deps,
    );
    expect(n).toBe(1);
  });
});
