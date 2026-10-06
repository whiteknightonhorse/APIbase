import { logger } from '../config/logger';
import { BREAKER_THRESHOLD, OUTBOX_TO_WEBHOOK, RETRY_DELAYS_MS } from '../shop/webhook/constants';

/** INT-09/11/12 events; shipped/delivered/dispute/refund.verified join with INT-22/23. */
const SHOP_WEBHOOK_EVENT_TYPES = [
  'shop.order.paid',
  'shop.order.confirmed',
  'shop.order.cancelled',
  'shop.refund.requested',
  'shop.catalog.rejected',
  'shop.merchant.key_rotated',
  'shop.merchant.keys_reissued',
  'shop.order.confirm_overdue',
  'shop.refund.overdue',
] as const;

/**
 * Outbox event processor (T-0259, ruling disputes/0259-outbox-swallows-money-events).
 *
 * Law: `outbox.processed` belongs to the OWNER of the event type. This worker
 * owns ONLY the types listed in HANDLED_EVENT_TYPES — it selects only those
 * rows (both in the poll query and in the lag/backlog query) and sets
 * `processed = true` only after a handler actually ran.
 *
 * Event types and owners:
 *   - cache_invalidate / TOOL_CONFIG_UPDATED → this worker (Redis cache purge)
 *   - form_submission                        → this worker (explicit ack/log only)
 *   - x402_settle_failed                     → scripts/x402-settle-leak-alerts.py
 *       (processed=true there means "paged")
 *   - mpp_refund_owed                        → scripts/mpp-refund-owed-alerts.py,
 *       closed only by scripts/mpp-refund-resolve.py. processed=false means
 *       "refund still owed" (standing operator decision 2026-09-01, see
 *       src/pipeline/stages/escrow-finalize.stage.ts). The worker must never
 *       touch these rows.
 *
 * Expected side effect: while a refund is open, partition-cleanup logs
 * `Skipping partition with unprocessed events` daily — that is normal, not an
 * incident.
 *
 * Invariant: outbox-worker failure does NOT affect API or Worker.
 */

export const HANDLED_EVENT_TYPES = [
  'cache_invalidate',
  'TOOL_CONFIG_UPDATED',
  'form_submission',
  // T-INT-14 (0259 §3 p.1): the third consumer — merchant webhooks. Only shop.* types; the money types
  // (mpp_refund_owed, x402_settle_failed) are NOT added and stay with their scripts.
  ...SHOP_WEBHOOK_EVENT_TYPES,
] as const;

export interface OutboxEvent {
  id: bigint;
  created_at: Date;
  event_type: string;
  payload: unknown;
}

interface RedisLike {
  status: string;
  connect(): Promise<unknown>;
  scan(
    cursor: string,
    match: 'MATCH',
    pattern: string,
    count: 'COUNT',
    n: number,
  ): Promise<[string, string[]]>;
  del(...keys: string[]): Promise<unknown>;
}

export interface ProcessorDeps {
  queryRaw: (sql: string, ...params: unknown[]) => Promise<unknown>;
  executeRaw: (sql: string, ...params: unknown[]) => Promise<unknown>;
  redis: () => RedisLike;
  log: Pick<typeof logger, 'info' | 'warn' | 'error'>;
}

export const SELECT_SQL = `SELECT id, created_at, event_type, payload
       FROM outbox
       WHERE processed = false AND event_type = ANY($2)
       ORDER BY created_at ASC
       LIMIT $1`;

export const LAG_SQL = `
      SELECT
        COALESCE(EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) * 1000, 0)::double precision AS lag_ms,
        COUNT(*) AS backlog_size
      FROM outbox
      WHERE processed = false AND event_type = ANY($1)
    `;

/** Returns true only when a handler ran; false = not ours, leave the row alone. */
export async function processEvent(event: OutboxEvent, deps: ProcessorDeps): Promise<boolean> {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const eventType = event.event_type;

  if (eventType === 'cache_invalidate' || eventType === 'TOOL_CONFIG_UPDATED') {
    const toolId = (payload.tool_id as string) || '';
    if (toolId) {
      const r = deps.redis();
      if (r.status === 'wait') {
        await r.connect();
      }
      const pattern = `cache:${toolId}:*`;
      let cursor = '0';
      do {
        const [nextCursor, keys] = await r.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await r.del(...keys);
        }
      } while (cursor !== '0');

      deps.log.info({ eventType, toolId }, 'Cache invalidated for tool');
    }
    return true;
  }

  if (eventType === 'form_submission') {
    // Explicit ack (no consumer yet). contact_email is PII — never logged.
    deps.log.info(
      {
        submission_id: payload.submission_id,
        company_name: payload.company_name,
        category: payload.category,
      },
      'Onboarding form submission recorded',
    );
    return true;
  }

  const webhookEvent = OUTBOX_TO_WEBHOOK[eventType];
  if (webhookEvent) {
    // One pending attempt-1 row per subscribed endpoint (idempotent on endpoint+outbox id+attempt).
    // A tripped breaker (>= BREAKER_THRESHOLD failures in a row) starts on the retry schedule, not now.
    const merchantId = typeof payload.merchant_id === 'string' ? payload.merchant_id : '';
    if (merchantId) {
      await deps.executeRaw(
        `INSERT INTO shop_webhook_deliveries
           (endpoint_id, merchant_id, event_type, outbox_id, attempt, status, payload, event_at, next_attempt_at)
         SELECT e.endpoint_id, e.merchant_id, $2::text, $1::bigint, 1, 'pending', $3::jsonb, $4::timestamptz,
                CASE WHEN e.failures_in_row >= $5::int THEN now() + ($6::int * interval '1 millisecond') ELSE now() END
           FROM shop_webhook_endpoints e
          WHERE e.merchant_id = $7::uuid AND e.status = 'active' AND $2::text = ANY(e.events)
         ON CONFLICT DO NOTHING`,
        event.id.toString(),
        webhookEvent,
        JSON.stringify(payload),
        event.created_at,
        BREAKER_THRESHOLD,
        RETRY_DELAYS_MS[0],
        merchantId,
      );
    }
    return true;
  }

  deps.log.warn({ eventType, eventId: event.id.toString() }, 'Unknown outbox event type');
  return false;
}

/** Processes one batch; returns how many events were actually handled. */
export async function processBatch(events: OutboxEvent[], deps: ProcessorDeps): Promise<number> {
  let handled = 0;
  for (const event of events) {
    try {
      if (!(await processEvent(event, deps))) continue;
    } catch (err) {
      deps.log.error(
        { err, eventId: event.id.toString(), eventType: event.event_type },
        'Failed to process outbox event',
      );
      continue;
    }

    await deps.executeRaw(
      `UPDATE outbox SET processed = true WHERE id = $1 AND created_at = $2`,
      event.id,
      event.created_at,
    );
    handled++;
  }
  return handled;
}
