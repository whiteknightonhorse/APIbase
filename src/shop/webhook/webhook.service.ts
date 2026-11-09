import { createHash, createHmac, randomBytes } from 'node:crypto';
import { config } from '../../config';
import { encryptSecret } from '../../services/secret-crypto.service';
import type { ShopDeps } from '../merchant-lifecycle.service';
import { QuoteError } from '../quote.errors';
import { OUTBOX_TO_WEBHOOK, WEBHOOK_EVENTS } from './constants';
import { defaultResolver, resolvePublicTarget, WebhookUrlError, type HostResolver } from './ssrf';

const DOCS = '/integrator/docs#webhooks';
const MAX_ENDPOINTS = 5;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** F-6: the events a merchant can subscribe to (T-0747: defined in ./constants, dependency-free). */
export { WEBHOOK_EVENTS };

export const sha256hex = (s: string) => createHash('sha256').update(s).digest('hex');

/** `X-APIbase-Signature: t=<unix>,v1=HMAC-SHA256(secret, t + "." + body)` (F-6). */
export function signPayload(secret: string, t: number, body: string): string {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
}

const invalid = (message: string) =>
  new QuoteError(422, 'validation_failed', message, 'fix_request', { documentation_url: DOCS });
const notFound = () =>
  new QuoteError(404, 'not_found', 'webhook endpoint not found', 'fix_request');

export interface WebhookDeps extends ShopDeps {
  resolve?: HostResolver;
}

export interface WebhookSetResult {
  endpoint_id: string;
  url: string;
  events: string[];
  /** whsec_<32hex>, in this response only (a new endpoint, or `rotate_secret`). */
  secret?: string;
}

/** T-0740: who calls. A partner grant key (`grant_id`) sees only the endpoints it created; the owner's key (null) sees all. */
export interface EndpointScope {
  grant_id?: string | null;
}
/** SQL fragment: parameter n is the scope's grant_id (NULL for the owner = every endpoint). */
const scoped = (n: number) => `($${n}::uuid IS NULL OR grant_id = $${n}::uuid)`;

/** §6.2 shop.merchant.webhook_set / §6.3 PUT /merchants/me/webhooks. The merchant is the key's. */
export async function setWebhook(
  d: WebhookDeps,
  merchant_id: string,
  input: { url?: unknown; events?: unknown; endpoint_id?: unknown; rotate_secret?: unknown },
  scope: EndpointScope = {},
): Promise<WebhookSetResult> {
  const grant_id = scope.grant_id ?? null;
  const events = input.events;
  if (
    !Array.isArray(events) ||
    events.length === 0 ||
    !events.every((e) => (WEBHOOK_EVENTS as readonly string[]).includes(e as string))
  ) {
    throw invalid(`events must be a non-empty subset of: ${WEBHOOK_EVENTS.join(', ')}`);
  }
  const uniqEvents = [...new Set(events as string[])];

  let endpoint_id: string | null = null;
  if (input.endpoint_id !== undefined && input.endpoint_id !== null) {
    if (typeof input.endpoint_id !== 'string' || !UUID_RE.test(input.endpoint_id)) throw notFound();
    const own = await d.db.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM shop_webhook_endpoints
        WHERE endpoint_id = $1::uuid AND merchant_id = $2::uuid AND status <> 'deleted' AND ${scoped(3)}`,
      input.endpoint_id,
      merchant_id,
      grant_id,
    );
    if (own.length === 0) throw notFound();
    endpoint_id = input.endpoint_id;
  }

  let target;
  try {
    target = await resolvePublicTarget(input.url, d.resolve ?? defaultResolver);
  } catch (err) {
    if (err instanceof WebhookUrlError) throw invalid(err.message);
    throw err;
  }
  const url = target.url.href;

  const newSecret = () => `whsec_${randomBytes(16).toString('hex')}`;
  if (endpoint_id) {
    const secret = input.rotate_secret === true ? newSecret() : undefined;
    await d.db.$executeRawUnsafe(
      `UPDATE shop_webhook_endpoints
          SET url = $3, events = $4::text[], status = 'active', failures_in_row = 0,
              secret_hash = COALESCE($5, secret_hash), secret_enc = COALESCE($6, secret_enc)
        WHERE endpoint_id = $1::uuid AND merchant_id = $2::uuid AND ${scoped(7)}`,
      endpoint_id,
      merchant_id,
      url,
      uniqEvents,
      secret ? sha256hex(secret) : null,
      secret ? encryptSecret(secret, config.ENCRYPTION_KEY) : null,
      grant_id,
    );
    return { endpoint_id, url, events: uniqEvents, ...(secret ? { secret } : {}) };
  }

  const count = await d.db.$queryRawUnsafe<Array<{ c: number }>>(
    `SELECT count(*)::int AS c FROM shop_webhook_endpoints WHERE merchant_id = $1::uuid AND status <> 'deleted'`,
    merchant_id,
  );
  if ((count[0]?.c ?? 0) >= MAX_ENDPOINTS) {
    throw invalid(
      `at most ${MAX_ENDPOINTS} webhook endpoints per merchant; update one with endpoint_id`,
    );
  }
  const secret = newSecret();
  const rows = await d.db.$queryRawUnsafe<Array<{ endpoint_id: string }>>(
    `INSERT INTO shop_webhook_endpoints (merchant_id, url, secret_hash, secret_enc, events, grant_id)
     VALUES ($1::uuid, $2, $3, $4, $5::text[], $6::uuid) RETURNING endpoint_id`,
    merchant_id,
    url,
    sha256hex(secret),
    encryptSecret(secret, config.ENCRYPTION_KEY),
    uniqEvents,
    grant_id,
  );
  return { endpoint_id: rows[0].endpoint_id, url, events: uniqEvents, secret };
}

export interface WebhookListItem {
  endpoint_id: string;
  url: string;
  events: string[];
  status: string;
  failures_in_row: number;
  created_at: string;
  /** T-0740: the partner whose grant created the endpoint, null for the merchant's own. */
  partner: string | null;
}

/** shop.merchant.webhook_list / GET /merchants/me/webhooks: the key's endpoints, never a secret. */
export async function listWebhooks(
  d: ShopDeps,
  merchant_id: string,
  scope: EndpointScope = {},
): Promise<{ endpoints: WebhookListItem[] }> {
  const rows = await d.db.$queryRawUnsafe<
    Array<Omit<WebhookListItem, 'created_at'> & { created_at: Date }>
  >(
    `SELECT e.endpoint_id::text AS endpoint_id, e.url, e.events, e.status,
            e.failures_in_row::int AS failures_in_row, e.created_at, g.partner_id AS partner
       FROM shop_webhook_endpoints e
       LEFT JOIN shop_partner_grants g ON g.grant_id = e.grant_id
      WHERE e.merchant_id = $1::uuid AND e.status <> 'deleted'
        AND ($2::uuid IS NULL OR e.grant_id = $2::uuid)
      ORDER BY e.created_at, e.endpoint_id`,
    merchant_id,
    scope.grant_id ?? null,
  );
  return {
    endpoints: rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() })),
  };
}

/** shop.merchant.webhook_delete / DELETE /merchants/me/webhooks/:endpoint_id. Another merchant's id is 404. */
export async function deleteWebhook(
  d: ShopDeps,
  merchant_id: string,
  endpoint_id: unknown,
  scope: EndpointScope = {},
): Promise<{ endpoint_id: string; deleted: true }> {
  if (typeof endpoint_id !== 'string' || !UUID_RE.test(endpoint_id)) throw notFound();
  const n = await d.db.$executeRawUnsafe(
    `UPDATE shop_webhook_endpoints SET status = 'deleted'
      WHERE endpoint_id = $1::uuid AND merchant_id = $2::uuid AND status <> 'deleted' AND ${scoped(3)}`,
    endpoint_id,
    merchant_id,
    scope.grant_id ?? null,
  );
  if (n === 0) throw notFound();
  return { endpoint_id, deleted: true };
}

export interface PulledEvent {
  id: string;
  event: string;
  created_at: Date;
  data: unknown;
}

/** §6.3 GET /merchants/me/events?since=<cursor>: the merchant's own outbox events, cursor = outbox.id. */
export async function listEvents(
  d: ShopDeps,
  merchant_id: string,
  q: { since?: unknown; limit?: unknown },
): Promise<{ events: PulledEvent[]; next_cursor: string }> {
  const sinceRaw = q.since === undefined || q.since === '' ? '0' : String(q.since);
  if (!/^\d{1,18}$/.test(sinceRaw))
    throw invalid('since must be a cursor returned by this endpoint');
  const limit = Math.min(Math.max(Number(q.limit) || 100, 1), 500);
  const types = Object.keys(OUTBOX_TO_WEBHOOK);
  const rows = await d.db.$queryRawUnsafe<
    Array<{ id: bigint; event_type: string; created_at: Date; payload: unknown }>
  >(
    `SELECT id, event_type, created_at, payload FROM outbox
      WHERE id > $1::bigint AND event_type = ANY($2::text[]) AND payload->>'merchant_id' = $3
      ORDER BY id ASC LIMIT $4::int`,
    sinceRaw,
    types,
    merchant_id,
    limit,
  );
  const events = rows.map((r) => ({
    id: r.id.toString(),
    event: OUTBOX_TO_WEBHOOK[r.event_type],
    created_at: r.created_at,
    data: r.payload,
  }));
  return { events, next_cursor: events.length ? events[events.length - 1].id : sinceRaw };
}
