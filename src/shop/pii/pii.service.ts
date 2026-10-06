import { createHash } from 'node:crypto';
import type { ShopTx } from '../db';
import { QuoteError } from '../quote.errors';
import type { ShopDeps } from '../merchant-lifecycle.service';
import { PII_DOCS_URL, type PiiEnvelope, type PiiKind } from './envelope.schema';

/**
 * T-INT-21 (spec 10): the server side of buyer-data envelopes. There is NO decryption anywhere in
 * this file or the tree: a buyer's agent encrypts to the merchant's X25519 key, we store bytes and
 * hand the same bytes to the merchant. Nothing here logs an envelope, its base64 or its hash.
 */

export const PASSPORT_MAX_DAYS = 30;
export const PASSPORT_AFTER_DELIVERY_DAYS = 7;
export const ADDRESS_AFTER_CLOSED_DAYS = 30;

export interface MerchantEncryptionKey {
  kid: string;
  alg: string;
  pub: string;
  sig_by_wallet: string;
}

export interface PiiRefusal {
  code: 400 | 409 | 422;
  error: string;
  message: string;
  extra: Record<string, unknown>;
}

const sha256Hex = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const notFound = () => new QuoteError(404, 'not_found', 'order not found', 'use_different_tool');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadEncryptionKey(
  db: ShopTx,
  merchant_id: string,
): Promise<MerchantEncryptionKey | null> {
  const rows = await db.$queryRawUnsafe<Array<{ encryption_key: MerchantEncryptionKey | null }>>(
    `SELECT encryption_key FROM shop_merchants WHERE merchant_id = $1::uuid`,
    merchant_id,
  );
  return rows[0]?.encryption_key ?? null;
}

/**
 * Before the money is claimed (UC-2 / spec 6.4). Returns the refusal, or null when the envelopes
 * match what the quote requires and carry the merchant's CURRENT `kid`.
 *   extra kind -> 400, missing kind -> 422 pii_required (+ the key), old kid -> 409 merchant_key_rotated.
 * With no settlement presented only the shape was checked (the 402 challenge must stay reachable).
 */
export async function checkPiiForPay(
  db: ShopTx,
  quote: { merchant_id: string; requires_pii: string[] },
  envelopes: Map<PiiKind, PiiEnvelope>,
  settlementPresented: boolean,
): Promise<PiiRefusal | null> {
  const required = quote.requires_pii ?? [];
  if (!settlementPresented) return null;
  const extra = [...envelopes.keys()].filter((k) => !required.includes(k));
  if (extra.length > 0) {
    return {
      code: 400,
      error: 'pii_unexpected_kind',
      message: 'pii carries a kind this quote does not require',
      extra: { required, documentation_url: PII_DOCS_URL },
    };
  }
  if (required.length === 0) return null;
  const key = await loadEncryptionKey(db, quote.merchant_id);
  const missing = required.filter((k) => !envelopes.has(k as PiiKind));
  if (missing.length > 0) {
    return {
      code: 422,
      error: 'pii_required',
      message: 'this quote needs buyer data encrypted with the merchant key',
      extra: { required, merchant_encryption_key: key, documentation_url: PII_DOCS_URL },
    };
  }
  if (!key || [...envelopes.values()].some((e) => e.kid !== key.kid)) {
    return {
      code: 409,
      error: 'merchant_key_rotated',
      message: 'the merchant encryption key changed; the envelope uses an old kid',
      extra: {
        merchant_encryption_key: key,
        suggested_action: 're-encrypt and pay, or request a new quote',
        documentation_url: PII_DOCS_URL,
      },
    };
  }
  return null;
}

/**
 * In the SAME transaction as the PAYING transition. A retry after PAYMENT_FAILED replaces the row.
 * Passport: purge_after = created + 30 days; every other kind: NULL until the order is CLOSED.
 */
export async function storeEnvelopes(
  tx: ShopTx,
  order_id: string,
  envelopes: Map<PiiKind, PiiEnvelope>,
): Promise<void> {
  for (const [kind, e] of envelopes) {
    await tx.$executeRawUnsafe(
      `INSERT INTO shop_pii_envelopes (order_id, kind, kid, alg, ciphertext, sha256, purge_after)
       VALUES ($1::uuid, $2, $3, $4, $5, $6,
               CASE WHEN $2 = 'passport' THEN now() + ($7::int * interval '1 day') END)
       ON CONFLICT (order_id, kind) DO UPDATE
         SET kid = EXCLUDED.kid, alg = EXCLUDED.alg, ciphertext = EXCLUDED.ciphertext,
             sha256 = EXCLUDED.sha256, created_at = now(), purge_after = EXCLUDED.purge_after,
             delivered_to_merchant_at = NULL`,
      order_id,
      kind,
      e.kid,
      e.alg,
      e.ciphertext,
      sha256Hex(e.ciphertext),
      PASSPORT_MAX_DAYS,
    );
  }
}

export interface WireEnvelope {
  kind: string;
  kid: string;
  alg: string;
  ciphertext_b64: string;
  sha256: string;
}

/** What the merchant receives (webhook `order.paid` and GET .../pii): the stored bytes, nothing else. */
export async function loadWireEnvelopes(db: ShopTx, order_id: string): Promise<WireEnvelope[]> {
  const rows = await db.$queryRawUnsafe<
    Array<{ kind: string; kid: string; alg: string; ciphertext: Buffer; sha256: string }>
  >(
    `SELECT kind, kid, alg, ciphertext, sha256 FROM shop_pii_envelopes
      WHERE order_id = $1::uuid ORDER BY kind`,
    order_id,
  );
  return rows.map((r) => ({
    kind: r.kind,
    kid: r.kid,
    alg: r.alg,
    ciphertext_b64: Buffer.from(r.ciphertext).toString('base64'),
    sha256: r.sha256,
  }));
}

/** Buyer / orders_list view: kinds and hashes, never the ciphertext. Null when the order has none. */
export async function loadPiiSummary(
  db: ShopTx,
  order_id: string,
): Promise<{ kinds: string[]; sha256: Record<string, string> } | null> {
  const rows = await db.$queryRawUnsafe<Array<{ kind: string; sha256: string }>>(
    `SELECT kind, sha256 FROM shop_pii_envelopes WHERE order_id = $1::uuid ORDER BY kind`,
    order_id,
  );
  if (rows.length === 0) return null;
  return {
    kinds: rows.map((r) => r.kind),
    sha256: Object.fromEntries(rows.map((r) => [r.kind, r.sha256])),
  };
}

const queueMail = (
  tx: ShopTx,
  merchant_id: string,
  order_id: string,
  template: 'pii_delivered' | 'pii_undeliverable',
) =>
  tx.$executeRawUnsafe(
    `INSERT INTO email_events (msg_id, received_at, from_domain, class, action_required, summary,
                               direction, status, kind, merchant_id, template)
     VALUES ($1, now(), 'apibase.pro', 'UNMATCHED', FALSE, NULL, 'out', 'queued', $2, $3::uuid, $2)
     ON CONFLICT (msg_id) DO NOTHING`,
    `out:pii:${order_id}:${template}`,
    template,
    merchant_id,
  );

/**
 * First 2xx webhook delivery or first GET: delivered_to_merchant_at is set once (never overwritten),
 * the passport's purge_after becomes min(purge_after, delivered + 7 days) and the merchant gets the
 * "storage is temporary, keep your own copy" mail. Returns whether this call was the first.
 */
export async function markDelivered(
  tx: ShopTx,
  merchant_id: string,
  order_id: string,
  at: Date = new Date(),
): Promise<boolean> {
  const first = await tx.$executeRawUnsafe(
    `UPDATE shop_pii_envelopes SET delivered_to_merchant_at = $2::timestamptz
      WHERE order_id = $1::uuid AND delivered_to_merchant_at IS NULL`,
    order_id,
    at,
  );
  if (first === 0) return false;
  await tx.$executeRawUnsafe(
    `UPDATE shop_pii_envelopes
        SET purge_after = LEAST(COALESCE(purge_after, 'infinity'::timestamptz),
                                delivered_to_merchant_at + ($2::int * interval '1 day'))
      WHERE order_id = $1::uuid AND kind = 'passport'`,
    order_id,
    PASSPORT_AFTER_DELIVERY_DAYS,
  );
  await queueMail(tx, merchant_id, order_id, 'pii_delivered');
  return true;
}

/** `GET /merchants/me/orders/:id/pii`: another merchant's order is a 404 (the merchant_id guard). */
export async function merchantEnvelopes(
  d: ShopDeps,
  merchant_id: string,
  order_id: string,
): Promise<{ order_id: string; envelopes: WireEnvelope[] }> {
  if (!UUID_RE.test(order_id)) throw notFound();
  return d.transaction(async (tx) => {
    const own = await tx.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM shop_orders WHERE order_id = $1::uuid AND merchant_id = $2::uuid`,
      order_id,
      merchant_id,
    );
    if (own.length === 0) throw notFound();
    const envelopes = await loadWireEnvelopes(tx, order_id);
    if (envelopes.length > 0) {
      await markDelivered(tx, merchant_id, order_id, new Date((d.now ?? Date.now)()));
    }
    return { order_id, envelopes };
  });
}

async function appendEvent(
  tx: ShopTx,
  order_id: string,
  state: string,
  reason: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await tx.$executeRawUnsafe(
    `INSERT INTO shop_order_events (order_id, seq, from_state, to_state, actor, reason, payload)
     SELECT $1::uuid, COALESCE(MAX(seq), 0) + 1, $2, $2, 'system', $3, $4::jsonb
       FROM shop_order_events WHERE order_id = $1::uuid`,
    order_id,
    state,
    reason,
    JSON.stringify(payload),
  );
}

/**
 * Key rotation (spec 10.2 item 4): old envelopes are NOT re-encrypted. Those still undelivered and
 * sealed to a retired kid can never be opened with the new key -> one `pii.undeliverable` event
 * and one mail per order.
 */
export async function flagUndeliverable(
  tx: ShopTx,
  merchant_id: string,
  newKid: string,
): Promise<number> {
  const rows = await tx.$queryRawUnsafe<Array<{ order_id: string; state: string }>>(
    `SELECT DISTINCT o.order_id, o.state
       FROM shop_pii_envelopes e JOIN shop_orders o ON o.order_id = e.order_id
      WHERE o.merchant_id = $1::uuid AND e.kid <> $2 AND e.delivered_to_merchant_at IS NULL`,
    merchant_id,
    newKid,
  );
  for (const r of rows) {
    await appendEvent(tx, r.order_id, r.state, 'pii.undeliverable', {});
    await queueMail(tx, merchant_id, r.order_id, 'pii_undeliverable');
  }
  return rows.length;
}

/**
 * shop-sla-sweeper step (spec 10.3). Passport: the FIRST of purge_after, delivered + 7 days,
 * created + 30 days, or the order in DELIVERED|CANCELLED|REFUNDED|PAYMENT_FAILED. Any other kind
 * (address, phone, company): CLOSED + 30 days. Physical DELETE + one `pii.purged` event per row.
 */
export async function purgePii(d: ShopDeps, now: Date): Promise<number> {
  await d.db.$executeRawUnsafe(
    `UPDATE shop_pii_envelopes e
        SET purge_after = c.closed_at + ($1::int * interval '1 day')
       FROM (SELECT order_id, min(at) AS closed_at FROM shop_order_events
              WHERE to_state = 'CLOSED' GROUP BY order_id) c
      WHERE c.order_id = e.order_id AND e.kind <> 'passport' AND e.purge_after IS NULL`,
    ADDRESS_AFTER_CLOSED_DAYS,
  );
  const due = await d.db.$queryRawUnsafe<Array<{ envelope_id: string }>>(
    `SELECT e.envelope_id FROM shop_pii_envelopes e JOIN shop_orders o ON o.order_id = e.order_id
      WHERE e.purge_after < $1::timestamptz
         OR (e.kind = 'passport' AND (
               e.created_at + ($2::int * interval '1 day') < $1::timestamptz
            OR e.delivered_to_merchant_at + ($3::int * interval '1 day') < $1::timestamptz
            OR o.state IN ('DELIVERED', 'CANCELLED', 'REFUNDED', 'PAYMENT_FAILED')))
      LIMIT 500`,
    now,
    PASSPORT_MAX_DAYS,
    PASSPORT_AFTER_DELIVERY_DAYS,
  );
  let n = 0;
  for (const r of due) {
    n += await d.transaction(async (tx) => {
      const gone = await tx.$queryRawUnsafe<Array<{ order_id: string; kind: string }>>(
        `DELETE FROM shop_pii_envelopes WHERE envelope_id = $1::uuid RETURNING order_id, kind`,
        r.envelope_id,
      );
      if (gone.length === 0) return 0;
      const o = await tx.$queryRawUnsafe<Array<{ state: string }>>(
        `SELECT state FROM shop_orders WHERE order_id = $1::uuid`,
        gone[0].order_id,
      );
      await appendEvent(tx, gone[0].order_id, o[0]?.state ?? 'PAID', 'pii.purged', {
        kind: gone[0].kind,
      });
      return 1;
    });
  }
  return n;
}

/** orders_list: kinds + hashes per order for one page, in one query. */
export async function loadPiiSummaries(
  db: ShopTx,
  order_ids: string[],
): Promise<Map<string, { kinds: string[]; sha256: Record<string, string> }>> {
  const out = new Map<string, { kinds: string[]; sha256: Record<string, string> }>();
  if (order_ids.length === 0) return out;
  const rows = await db.$queryRawUnsafe<Array<{ order_id: string; kind: string; sha256: string }>>(
    `SELECT order_id::text AS order_id, kind, sha256 FROM shop_pii_envelopes
      WHERE order_id = ANY($1::uuid[]) ORDER BY kind`,
    order_ids,
  );
  for (const r of rows) {
    const cur = out.get(r.order_id) ?? { kinds: [], sha256: {} };
    cur.kinds.push(r.kind);
    cur.sha256[r.kind] = r.sha256;
    out.set(r.order_id, cur);
  }
  return out;
}
