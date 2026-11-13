/**
 * T-0826 (SOUKBASE-QUOTES-1113 ruling-1): the partner read of quote outcomes, for a store whose live
 * grant names `quotes:read`. Never in an answer: an IP, a user-agent beyond `client`, an e-mail, the
 * buyer token or identity, a payer or its hash, a payment header, signature or transaction hash, an
 * item title, the fee.
 */
import type { ShopTx } from '../db';
import { QuoteError } from '../quote.errors';
import { liveGrantFor, QUOTES_READ } from './grant.service';

const DOC = '/integrator/docs#partner-mode';
export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 200;
const TIE_CAP = 1000;
const REFUSAL_DAYS = 90;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
/** Microsecond-precision UTC text of a timestamptz column. */
const iso = (c: string) => `to_char(${c} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

const invalid = (field: string, message: string) =>
  new QuoteError(422, 'validation_failed', message, 'fix_request', {
    field,
    documentation_url: DOC,
  });

/** `limit`: absent = 100; a string of digits 1..200; anything else (arrays and objects included) is 422. */
export function parseLimit(v: unknown): number {
  if (v === undefined) return DEFAULT_LIMIT;
  if (typeof v !== 'string' || !/^\d{1,4}$/.test(v)) {
    throw invalid('limit', `limit must be an integer from 1 to ${MAX_LIMIT}`);
  }
  const n = Number(v);
  if (n < 1 || n > MAX_LIMIT)
    throw invalid('limit', `limit must be an integer from 1 to ${MAX_LIMIT}`);
  return n;
}

/** Date.parse rolls 2026-02-31 over instead of failing; Postgres then rejects the cast (500). Check the fields. */
function calendarValid(v: string): boolean {
  if (Number.isNaN(Date.parse(v))) return false;
  const y = Number(v.slice(0, 4));
  const mo = Number(v.slice(5, 7));
  const d = Number(v.slice(8, 10));
  const h = Number(v.slice(11, 13));
  const mi = Number(v.slice(14, 16));
  const sec = Number(v.slice(17, 19));
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || sec > 59) return false;
  const zone = /([+-])(\d{2}):(\d{2})$/.exec(v);
  if (zone && (Number(zone[2]) > 23 || Number(zone[3]) > 59)) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

/** An ISO 8601 timestamp with a zone; absent = null; anything else 422 naming the field. */
export function parseCursor(v: unknown, field: string): string | null {
  if (v === undefined) return null;
  if (typeof v !== 'string' || !ISO_RE.test(v) || !calendarValid(v)) {
    throw invalid(
      field,
      `${field} must be an ISO 8601 timestamp such as 2026-11-13T10:00:00.000000Z`,
    );
  }
  return v;
}

/** liveGrantFor, then the scope: a grant signed before quote outcomes were part of it is 403. */
async function readableMerchant(
  db: ShopTx,
  partner: { id: string; name: string },
  slug: unknown,
): Promise<string> {
  const g = await liveGrantFor(db, partner, slug);
  if (!g.scopes.includes(QUOTES_READ)) {
    throw new QuoteError(
      403,
      'grant_scope_missing',
      `${g.slug} allowed ${partner.name} before quote outcomes were part of the permission; send the seller a grant link`,
      'fix_request',
      { scope: QUOTES_READ, documentation_url: DOC },
    );
  }
  return g.merchant_id;
}

interface QuoteRow {
  quote_id: string;
  order_id: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
  is_test: boolean;
  items: unknown;
  total_usd: string;
  state: string;
  challenges: number | null;
  pay_attempts: number | null;
  last_error_code: string | null;
  last_error_at: string | null;
  paid_at: string | null;
  rail: string | null;
  order_state: string | null;
  read_at: string | null;
  client: string | null;
}

const QUOTES_SQL = `
  SELECT quote_id, order_id, created_at, updated_at, expires_at, is_test, items, total_usd, state,
         challenges, pay_attempts, last_error_code, last_error_at, paid_at, rail, order_state,
         read_at, client, updated_ts
    FROM (
      SELECT q.quote_id::text AS quote_id, o.order_id::text AS order_id,
             ${iso('q.created_at')} AS created_at,
             ${iso("GREATEST(q.created_at, o.updated_at, x.updated_at, CASE WHEN q.status = 'open' AND q.expires_at < now() THEN q.expires_at END)")} AS updated_at,
             GREATEST(q.created_at, o.updated_at, x.updated_at, CASE WHEN q.status = 'open' AND q.expires_at < now() THEN q.expires_at END) AS updated_ts,
             ${iso('q.expires_at')} AS expires_at, q.is_test, q.items, q.total_usd::text AS total_usd,
             CASE WHEN q.status = 'paid' THEN 'paid'
                  WHEN q.status = 'cancelled' THEN 'cancelled'
                  WHEN q.status = 'expired' OR (q.status = 'open' AND q.expires_at < now()) THEN 'expired'
                  ELSE 'open' END AS state,
             x.challenges, x.pay_attempts, x.last_error_code, ${iso('x.last_error_at')} AS last_error_at,
             ${iso('o.settled_at')} AS paid_at, o.rail, o.state AS order_state,
             ${iso('x.read_at')} AS read_at, x.client
        FROM shop_quotes q
        LEFT JOIN LATERAL (
          SELECT order_id, state, rail, settled_at, updated_at FROM shop_orders
           WHERE quote_id = q.quote_id
           ORDER BY (state NOT IN ('PAYMENT_FAILED', 'CANCELLED', 'EXPIRED')) DESC, created_at DESC
           LIMIT 1) o ON true
        LEFT JOIN shop_quote_outcomes x ON x.quote_id = q.quote_id
       WHERE q.merchant_id = $1::uuid) t`;

const shapeQuote = (r: QuoteRow & { updated_ts?: unknown }) => {
  const { updated_ts: _ts, items, ...rest } = r;
  return {
    ...rest,
    items: (Array.isArray(items) ? (items as Array<Record<string, unknown>>) : []).map((i) => ({
      sku: i.sku,
      qty: i.qty,
    })),
  };
};

/** GET .../quotes: quotes of the store ordered by updated_at then quote_id; a page never ends inside a tie. */
export async function partnerQuotes(
  db: ShopTx,
  partner: { id: string; name: string },
  slug: unknown,
  query: { updated_after?: unknown; limit?: unknown },
): Promise<{ quotes: unknown[]; next_updated_after: string | null }> {
  const merchant_id = await readableMerchant(db, partner, slug);
  const after = parseCursor(query.updated_after, 'updated_after');
  const limit = parseLimit(query.limit);
  type Row = QuoteRow & { updated_ts: Date };
  const rows = await db.$queryRawUnsafe<Row[]>(
    `${QUOTES_SQL} WHERE ($2::timestamptz IS NULL OR updated_ts > $2::timestamptz)
      ORDER BY updated_ts, quote_id LIMIT $3::int`,
    merchant_id,
    after,
    limit,
  );
  if (rows.length < limit) {
    return { quotes: rows.map(shapeQuote), next_updated_after: null };
  }
  const last = rows[rows.length - 1];
  const tie = await db.$queryRawUnsafe<Row[]>(
    `${QUOTES_SQL} WHERE updated_ts = $2::timestamptz AND quote_id > $3
      ORDER BY quote_id LIMIT ${TIE_CAP}`,
    merchant_id,
    last.updated_at,
    last.quote_id,
  );
  const all = [...rows, ...tie];
  return {
    quotes: all.map(shapeQuote),
    next_updated_after: all[all.length - 1].updated_at,
  };
}

/** GET .../quote-refusals: refusals of the last 90 days ordered by at then id; a page never ends inside a tie. */
export async function partnerQuoteRefusals(
  db: ShopTx,
  partner: { id: string; name: string },
  slug: unknown,
  query: { after?: unknown; limit?: unknown },
): Promise<{
  refusals: Array<{ at: string; error_code: string; skus: string[] }>;
  next_after: string | null;
}> {
  const merchant_id = await readableMerchant(db, partner, slug);
  const after = parseCursor(query.after, 'after');
  const limit = parseLimit(query.limit);
  type Row = { id: string; at: string; error_code: string; skus: string[] };
  const sel = `SELECT id::text AS id, ${iso('at')} AS at, error_code, skus FROM shop_quote_refusals
                WHERE merchant_id = $1::uuid AND at > now() - interval '${REFUSAL_DAYS} days'`;
  const rows = await db.$queryRawUnsafe<Row[]>(
    `${sel} AND ($2::timestamptz IS NULL OR at > $2::timestamptz) ORDER BY at, id LIMIT $3::int`,
    merchant_id,
    after,
    limit,
  );
  let all = rows;
  if (rows.length >= limit) {
    const last = rows[rows.length - 1];
    const tie = await db.$queryRawUnsafe<Row[]>(
      `${sel} AND at = $2::timestamptz AND id > $3::bigint ORDER BY id LIMIT ${TIE_CAP}`,
      merchant_id,
      last.at,
      last.id,
    );
    all = [...rows, ...tie];
  }
  return {
    refusals: all.map((r) => ({ at: r.at, error_code: r.error_code, skus: r.skus })),
    next_after: rows.length >= limit ? all[all.length - 1].at : null,
  };
}
