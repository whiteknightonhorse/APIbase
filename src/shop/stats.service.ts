import { createHash } from 'node:crypto';
import type { ShopDeps } from './merchant-lifecycle.service';
import type { ShopTx } from './db';
import { loadFeeReceivables } from './fee-invoice.service';
import { QuoteError } from './quote.errors';

const DOCS = '/docs/integrator#merchant-stats';
const DAY_MS = 86_400_000;
const MAX_SPAN_DAYS = 366;
const DEFAULT_SPAN_DAYS = 30;
const CSV_ROW_LIMIT = 10_000;
export const STATS_CACHE_TTL_S = 60;

const invalid = (message: string) =>
  new QuoteError(422, 'validation_failed', message, 'fix_request', { documentation_url: DOCS });

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** The Redis calls used for the 60 s cache (ioredis satisfies it; tests inject a fake). */
interface CacheRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
}

async function cacheOf(deps: ShopDeps): Promise<CacheRedis | null> {
  if (deps.redis) return deps.redis as unknown as CacheRedis;
  try {
    const { ensureRedisConnected } = await import('../services/redis.service');
    return (await ensureRedisConnected()) as unknown as CacheRedis;
  } catch {
    return null;
  }
}

export interface StatsQuery {
  from?: unknown;
  to?: unknown;
  group?: unknown;
  format?: unknown;
}

interface Range {
  from: Date;
  to: Date;
  group: 'day' | 'week';
  format: 'json' | 'csv';
}

function parseQuery(q: StatsQuery, nowMs: number): Range {
  const date = (v: unknown, name: string): Date | undefined => {
    if (v === undefined || v === '') return undefined;
    const d = new Date(String(v));
    if (Number.isNaN(d.getTime())) throw invalid(`${name} must be an ISO 8601 date-time`);
    return d;
  };
  const to = date(q.to, 'to') ?? new Date(nowMs);
  const from = date(q.from, 'from') ?? new Date(to.getTime() - DEFAULT_SPAN_DAYS * DAY_MS);
  if (from.getTime() >= to.getTime()) throw invalid('from must be earlier than to');
  if (to.getTime() - from.getTime() > MAX_SPAN_DAYS * DAY_MS) {
    throw invalid(`the range is at most ${MAX_SPAN_DAYS} days`);
  }
  const group = q.group === undefined || q.group === '' ? 'day' : String(q.group);
  if (group !== 'day' && group !== 'week') throw invalid('group must be day or week');
  const format = q.format === undefined || q.format === '' ? 'json' : String(q.format);
  if (format !== 'json' && format !== 'csv') throw invalid('format must be json or csv');
  return { from, to, group, format };
}

/**
 * Paid = past PAYING (settled money), the `__apibase_test` SKU excluded (F-12: it never counts).
 * Every query below is scoped by `o.merchant_id = $1`: the merchant is the key's, never a parameter.
 */
const PAID_SQL = `
  shop_orders o JOIN shop_quotes q ON q.quote_id = o.quote_id
  WHERE o.merchant_id = $1::uuid AND NOT q.is_test
    AND o.state NOT IN ('QUOTED', 'EXPIRED', 'CANCELLED', 'PAYING', 'PAYMENT_FAILED')
    AND coalesce(o.settled_at, o.created_at) >= $2::timestamptz
    AND coalesce(o.settled_at, o.created_at) < $3::timestamptz`;

/** `Mozilla/5.0 (…) Chrome/1` -> `Mozilla`; `python-httpx/0.27` -> `python-httpx`. */
export function uaFamily(ua: string | null | undefined): string {
  const m = /^\s*([A-Za-z0-9._-]+)/.exec(ua ?? '');
  return m ? m[1].slice(0, 40) : 'unknown';
}

type Row = Record<string, unknown>;

export async function webhookHealth(
  db: ShopTx,
  merchant_id: string,
  from: Date,
  to: Date,
): Promise<{ deliveries: number; success_pct: number | null; p95_delivery_ms: number | null }> {
  const r = await db.$queryRawUnsafe<Array<{ total: number; ok: number; p95: number | null }>>(
    `SELECT count(*) FILTER (WHERE status_code IS NOT NULL)::int AS total,
            count(*) FILTER (WHERE status_code BETWEEN 200 AND 299)::int AS ok,
            (percentile_cont(0.95) WITHIN GROUP (
               ORDER BY extract(epoch FROM (delivered_at - created_at)) * 1000
             ) FILTER (WHERE delivered_at IS NOT NULL))::float8 AS p95
       FROM shop_webhook_deliveries
      WHERE merchant_id = $1::uuid AND created_at >= $2::timestamptz AND created_at < $3::timestamptz`,
    merchant_id,
    from.toISOString(),
    to.toISOString(),
  );
  const w = r[0] ?? { total: 0, ok: 0, p95: null };
  return {
    deliveries: w.total,
    success_pct: w.total > 0 ? Math.round((w.ok / w.total) * 1000) / 10 : null,
    p95_delivery_ms: w.p95 === null || w.p95 === undefined ? null : Math.round(w.p95),
  };
}

async function compute(db: ShopTx, merchant_id: string, r: Range) {
  const args = [merchant_id, r.from.toISOString(), r.to.toISOString()];
  const [funnel, series, rails, agents, products, refunds, disputes, sla, webhooks, receivable] =
    await Promise.all([
      db.$queryRawUnsafe<Row[]>(
        `SELECT (SELECT count(*) FROM shop_quotes
                  WHERE merchant_id = $1::uuid AND NOT is_test
                    AND created_at >= $2::timestamptz AND created_at < $3::timestamptz)::int AS quotes,
                count(*)::int AS paid,
                count(*) FILTER (WHERE o.state = 'CLOSED')::int AS closed,
                coalesce(sum(o.total_usd), 0)::text AS gross,
                coalesce(sum(o.fee_usd), 0)::text AS fee,
                coalesce(sum(o.total_usd - o.fee_usd), 0)::text AS net,
                coalesce(avg(o.total_usd), 0)::text AS avg_order
           FROM ${PAID_SQL}`,
        ...args,
      ),
      db.$queryRawUnsafe<Row[]>(
        `SELECT to_char(date_trunc('${r.group}', coalesce(o.settled_at, o.created_at) AT TIME ZONE 'UTC'),
                        'YYYY-MM-DD') AS period,
                count(*)::int AS orders_paid,
                sum(o.total_usd)::text AS gross, sum(o.fee_usd)::text AS fee,
                sum(o.total_usd - o.fee_usd)::text AS net
           FROM ${PAID_SQL} GROUP BY 1 ORDER BY 1`,
        ...args,
      ),
      db.$queryRawUnsafe<Row[]>(
        `SELECT coalesce(o.rail, 'unknown') AS rail, count(*)::int AS orders_paid,
                sum(o.total_usd)::text AS gross, sum(o.fee_usd)::text AS fee
           FROM ${PAID_SQL} GROUP BY 1 ORDER BY 2 DESC`,
        ...args,
      ),
      db.$queryRawUnsafe<Row[]>(
        `SELECT e.payload->'buyer_agent'->>'client_name' AS client_name,
                e.payload->'buyer_agent'->>'client_version' AS client_version,
                e.payload->'buyer_agent'->>'user_agent' AS user_agent,
                e.payload->'buyer_agent'->>'wallet_hash_prefix' AS wallet_hash_prefix,
                count(*)::int AS orders_paid, sum(o.total_usd)::text AS gross
           FROM ${PAID_SQL.replace(
             'WHERE o.merchant_id',
             `LEFT JOIN LATERAL (SELECT payload FROM shop_order_events
                                  WHERE order_id = o.order_id AND to_state = 'PAID'
                                  ORDER BY seq LIMIT 1) e ON true
               WHERE o.merchant_id`,
           )}
          GROUP BY 1, 2, 3, 4 ORDER BY 5 DESC LIMIT 500`,
        ...args,
      ),
      db.$queryRawUnsafe<Row[]>(
        `SELECT it->>'sku' AS sku, max(it->>'title') AS title,
                sum((it->>'qty')::int)::int AS qty,
                sum((it->>'line_total_usd')::numeric)::text AS revenue_usd
           FROM ${PAID_SQL.replace('WHERE o.merchant_id', `, jsonb_array_elements(q.items) it WHERE o.merchant_id`)}
          GROUP BY 1 ORDER BY sum((it->>'line_total_usd')::numeric) DESC, 1 LIMIT 20`,
        ...args,
      ),
      db.$queryRawUnsafe<Row[]>(
        `SELECT count(*)::int AS requested,
                count(*) FILTER (WHERE rf.verified)::int AS verified,
                coalesce(sum(rf.verified_amount) FILTER (WHERE rf.verified), 0)::text AS verified_usd
           FROM shop_refunds rf JOIN shop_orders o ON o.order_id = rf.order_id
           JOIN shop_quotes q ON q.quote_id = o.quote_id
          WHERE o.merchant_id = $1::uuid AND NOT q.is_test
            AND rf.created_at >= $2::timestamptz AND rf.created_at < $3::timestamptz`,
        ...args,
      ),
      db.$queryRawUnsafe<Row[]>(
        `SELECT d.status, count(*)::int AS n
           FROM shop_disputes d JOIN shop_orders o ON o.order_id = d.order_id
           JOIN shop_quotes q ON q.quote_id = o.quote_id
          WHERE o.merchant_id = $1::uuid AND NOT q.is_test
            AND d.created_at >= $2::timestamptz AND d.created_at < $3::timestamptz
          GROUP BY 1`,
        ...args,
      ),
      db.$queryRawUnsafe<Row[]>(
        `SELECT count(*) FILTER (WHERE o.state = 'PAID' AND o.confirm_due_at < now())::int AS confirm,
                count(*) FILTER (WHERE o.state = 'CONFIRMED' AND o.ship_due_at < now())::int AS ship
           FROM shop_orders o JOIN shop_quotes q ON q.quote_id = o.quote_id
          WHERE o.merchant_id = $1::uuid AND NOT q.is_test AND o.state IN ('PAID', 'CONFIRMED')`,
        merchant_id,
      ),
      webhookHealth(db, merchant_id, r.from, r.to),
      loadFeeReceivables(db, merchant_id),
    ]);

  // Agents: same client + UA family + wallet prefix merge, whatever the exact UA string was.
  const merged = new Map<string, Row & { orders_paid: number; gross: number }>();
  for (const a of agents) {
    const row = {
      client_name: (a.client_name as string | null) ?? null,
      client_version: (a.client_version as string | null) ?? null,
      ua_family: uaFamily(a.user_agent as string | null),
      wallet_hash_prefix: (a.wallet_hash_prefix as string | null) ?? null,
    };
    const key = JSON.stringify(row);
    const m = merged.get(key) ?? { ...row, orders_paid: 0, gross: 0 };
    m.orders_paid += Number(a.orders_paid);
    m.gross += Number(a.gross);
    merged.set(key, m);
  }
  const f = funnel[0] ?? {};
  return {
    from: r.from.toISOString(),
    to: r.to.toISOString(),
    group: r.group,
    funnel: {
      quotes: f.quotes ?? 0,
      orders_paid: f.paid ?? 0,
      orders_closed: f.closed ?? 0,
    },
    gross_usd: f.gross ?? '0',
    fee_usd: f.fee ?? '0',
    net_usd: f.net ?? '0',
    avg_order_usd: f.avg_order ?? '0',
    series,
    refunds: refunds[0] ?? { requested: 0, verified: 0, verified_usd: '0' },
    disputes: Object.fromEntries(disputes.map((d) => [String(d.status), d.n])),
    top_products: products,
    by_rail: rails,
    by_agent: [...merged.values()]
      .sort((a, b) => b.orders_paid - a.orders_paid)
      .map((m) => ({ ...m, gross: m.gross.toFixed(6) })),
    webhook: webhooks,
    sla_overdue: sla[0] ?? { confirm: 0, ship: 0 },
    fee_receivable: receivable,
  };
}

const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const CSV_HEAD = [
  'order_id',
  'created_at',
  'settled_at',
  'state',
  'rail',
  'total_usd',
  'fee_usd',
  'net_usd',
  'tx_hash',
  'payer_wallet_hash_prefix',
] as const;

async function computeCsv(db: ShopTx, merchant_id: string, r: Range): Promise<string> {
  const rows = await db.$queryRawUnsafe<Row[]>(
    `SELECT o.order_id, o.created_at, o.settled_at, o.state, o.rail,
            o.total_usd::text AS total_usd, o.fee_usd::text AS fee_usd,
            (o.total_usd - o.fee_usd)::text AS net_usd, o.tx_hash, o.payer_wallet
       FROM ${PAID_SQL} ORDER BY coalesce(o.settled_at, o.created_at), o.order_id
      LIMIT ${CSV_ROW_LIMIT}`,
    merchant_id,
    r.from.toISOString(),
    r.to.toISOString(),
  );
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v);
  const lines = rows.map((o) =>
    [
      o.order_id,
      iso(o.created_at),
      iso(o.settled_at),
      o.state,
      o.rail,
      o.total_usd,
      o.fee_usd,
      o.net_usd,
      o.tx_hash,
      // F-12: never the full address, only the 8-char hash prefix (same as the by-agent cut)
      o.payer_wallet ? sha(String(o.payer_wallet)).slice(0, 8) : '',
    ]
      .map(csvCell)
      .join(','),
  );
  return `${[CSV_HEAD.join(','), ...lines].join('\n')}\n`;
}

/**
 * F-12 / §6.3 `GET /merchants/me/stats`: the merchant's own aggregates, cached 60 s in Redis (key by
 * merchant + request parameters; cross-tenant is impossible because the merchant is part of the key
 * and of every WHERE). `format=csv` -> `{csv}` instead of the JSON document.
 */
export async function getMerchantStats(
  deps: ShopDeps,
  merchant_id: string,
  q: StatsQuery,
): Promise<{ csv: string } | Awaited<ReturnType<typeof compute>>> {
  const now = (deps.now ?? Date.now)();
  const range = parseQuery(q, now);
  const key = `shop:stats:${merchant_id}:${sha(
    JSON.stringify([q.from ?? null, q.to ?? null, range.group, range.format]),
  )}`;
  const cache = await cacheOf(deps);
  if (cache) {
    try {
      const hit = await cache.get(key);
      if (hit) return JSON.parse(hit);
    } catch {
      /* cache is best effort */
    }
  }
  const out =
    range.format === 'csv'
      ? { csv: await computeCsv(deps.db, merchant_id, range) }
      : await compute(deps.db, merchant_id, range);
  if (cache) {
    try {
      await cache.set(key, JSON.stringify(out), 'EX', STATS_CACHE_TTL_S);
    } catch {
      /* cache is best effort */
    }
  }
  return out;
}
