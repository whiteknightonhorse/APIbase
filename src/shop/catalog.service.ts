import { createHash } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config';
import { encryptSecret } from '../services/secret-crypto.service';
import { stripHtml } from '../utils/strip-html';
import { CatalogError } from './catalog.errors';
import { assertTermsAccepted } from './auth/terms.guard';
import { ShopAuthError } from './auth/errors';
import type { ShopTx } from './db';
import type { ShopDeps } from './merchant-lifecycle.service';
import { hasHiddenChars, moderateProduct, stripHidden } from './moderation/product-rules';

export const TEST_SKU = '__apibase_test';
export const TEST_PRICE_CENTS = 1;
export const MIN_PRICE_CENTS = 100;
export const MAX_ITEMS_PER_CALL = 500;
const DEFAULT_MAX_ORDER_USD = 10000;

const DOC_URL = '/docs/integrator#catalog';

/** `title`/`description`: hidden characters out, HTML out, THEN the length cap (§8.3 (1)). */
const clean = (max: number) =>
  z
    .string()
    .transform((s) => stripHtml(stripHidden(s)))
    .pipe(z.string().max(max));

/** Decimal(18,2) as a string, at most two fractional digits; `0.005` and `1e-7` do not parse. */
const money = z
  .union([z.number(), z.string()])
  .transform((v) => String(v))
  .pipe(
    z.string().regex(/^\d{1,13}(\.\d{1,2})?$/, 'price must be a decimal with at most 2 digits'),
  );

export const cents = (price: string): number => Math.round(Number(price) * 100);

/** Stream terms (UC-7 / F-9): the rate is per second, so it needs up to six fractional digits. */
export const MIN_STREAM_RATE_USD = 0.0001;
export const MIN_STREAM_DEPOSIT_USD = 1;
const micro = z
  .union([z.number(), z.string()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d{1,13}(\.\d{1,6})?$/, 'must be a decimal with at most 6 digits'));

const StreamSchema = z.object({
  rate_per_s_usd: micro,
  min_deposit_usd: micro,
  unit: z.literal('second'),
  /** Names the content source; the content itself is `fulfillment.instant.payload`. */
  content_ref: z.string().min(1).max(64),
});
export type StreamTerms = z.infer<typeof StreamSchema>;

/** Subscription terms (UC-9 / F-8): the item's `price_usd` is the price of ONE period. */
export const MAX_SUBSCRIPTION_PERIODS = 120;
export const SubscriptionSchema = z.object({
  period_unit: z.enum(['day', 'week', 'month']),
  period_count: z.number().int().min(1).max(1000),
  max_periods: z.number().int().min(1).max(MAX_SUBSCRIPTION_PERIODS).optional(),
  trial: z.literal('none').default('none'),
});
export type SubscriptionTerms = z.infer<typeof SubscriptionSchema>;

/** A stream item may omit `price_usd`: the price of a stream product IS its per-second rate. */
const fillStreamPrice = (raw: unknown): unknown => {
  const r = raw as {
    fulfillment_mode?: unknown;
    price_usd?: unknown;
    stream?: { rate_per_s_usd?: unknown };
  };
  if (r && typeof r === 'object' && r.fulfillment_mode === 'stream' && r.price_usd === undefined) {
    return { ...r, price_usd: r.stream?.rate_per_s_usd };
  }
  return raw;
};

const idText = z.string().min(1).max(64);

const VariantSchema = z.object({
  sku: z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/),
  title: clean(120).pipe(z.string().min(1)),
  price_usd: money.optional(),
  stock: z.number().int().min(0).nullable().optional(),
  attributes: z.record(z.string().max(200)).optional(),
});

/** UC-7 / F-9 stream item rules: the rate, the deposit, no test SKU, the content source. */
function streamIssues(
  p: {
    price_usd: string;
    is_test: boolean;
    stream?: StreamTerms;
    variants?: unknown[];
    fulfillment?: { instant?: unknown };
  },
  issue: (path: string, message: string) => void,
): void {
  if (p.is_test) issue('is_test', 'the test SKU cannot be a stream');
  if (!p.stream) {
    issue(
      'stream',
      'fulfillment_mode stream needs stream {rate_per_s_usd, min_deposit_usd, unit, content_ref}',
    );
    return;
  }
  const rate = Number(p.stream.rate_per_s_usd);
  if (!(rate >= MIN_STREAM_RATE_USD)) {
    issue('stream', `rate_per_s_usd must be at least ${MIN_STREAM_RATE_USD}`);
  }
  if (!(Number(p.stream.min_deposit_usd) >= MIN_STREAM_DEPOSIT_USD)) {
    issue('stream', `min_deposit_usd must be at least ${MIN_STREAM_DEPOSIT_USD}`);
  }
  if (Number(p.price_usd) !== rate) {
    issue(
      'price_usd',
      'a stream price is its per-second rate: omit price_usd or set it to rate_per_s_usd',
    );
  }
  if (p.variants?.length) issue('variants', 'a stream product has no variants');
  if (!p.fulfillment?.instant)
    issue('fulfillment', 'fulfillment_mode stream needs fulfillment.instant.payload (the content)');
}

/**
 * F-2 catalog item, shared with INT-32/43 imports. Static rules only; the per-merchant
 * `price_usd <= limits.max_order_usd` ceiling is applied by `upsertCatalog`.
 */
export const CatalogItemSchema = z.preprocess(
  fillStreamPrice,
  z
    .object({
      sku: z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/),
      title: clean(120).pipe(z.string().min(1)),
      description: clean(2000).default(''),
      price_usd: micro,
      is_test: z.boolean().default(false),
      currency_display: z.string().min(1).max(8).optional(),
      stock: z.number().int().min(0).nullable().optional(),
      fulfillment_mode: z.enum(['instant', 'merchant', 'physical', 'stream']).default('merchant'),
      stream: StreamSchema.optional(),
      subscription: SubscriptionSchema.optional(),
      fulfillment: z
        .object({ instant: z.object({ payload: z.string().min(1).max(20000) }).optional() })
        .optional(),
      tax_included: z.boolean().default(false),
      tax_note: clean(500).optional(),
      shipping_options: z
        .array(
          z.object({
            id: idText,
            label: clean(120),
            price_usd: money,
            eta_days: z.number().int().min(0).max(365).optional(),
            regions: z.array(z.string().min(1).max(32)).max(250).optional(),
          }),
        )
        .max(20)
        .default([]),
      delivery_slots: z
        .array(
          z.object({ id: idText, label: clean(120), starts_at: z.string().max(40).optional() }),
        )
        .max(50)
        .default([]),
      requires_pii: z
        .array(z.string().regex(/^[a-z_]{2,32}$/))
        .max(10)
        .default([]),
      refund_window_days: z.number().int().min(0).max(365).optional(),
      returns_accepted: z.boolean().default(false),
      category: z.string().min(1).max(64),
      images: z.array(z.string().url().max(2000).startsWith('https://')).max(10).default([]),
      variants: z.array(VariantSchema).max(100).optional(),
    })
    .superRefine((p, ctx) => {
      const issue = (path: string, message: string) =>
        ctx.addIssue({ code: 'custom', path: [path], message });
      const c = cents(p.price_usd);
      if (p.fulfillment_mode === 'stream') {
        streamIssues(p, issue);
      } else {
        if (!/^\d{1,13}(\.\d{1,2})?$/.test(p.price_usd)) {
          issue('price_usd', 'price must be a decimal with at most 2 digits');
        } else if (p.is_test !== (p.sku === TEST_SKU)) {
          issue(
            'is_test',
            `is_test is reserved for the single ${TEST_SKU} item (and ${TEST_SKU} must set it)`,
          );
        } else if (p.is_test && c !== TEST_PRICE_CENTS) {
          issue('price_usd', 'the test SKU costs exactly $0.01');
        } else if (!p.is_test && c < MIN_PRICE_CENTS) {
          issue('price_usd', 'price_usd must be at least $1.00');
        }
        if (p.stream) issue('stream', 'stream is only for fulfillment_mode stream');
      }
      if (p.subscription) {
        if (p.fulfillment_mode !== 'instant' && p.fulfillment_mode !== 'merchant') {
          issue('subscription', 'subscription is only for fulfillment_mode instant or merchant');
        }
        if (p.is_test) issue('is_test', 'the test SKU cannot be a subscription');
        if (p.variants?.length) issue('variants', 'a subscription product has no variants');
        if (p.stock !== undefined && p.stock !== null) {
          issue('stock', 'a subscription product has no stock count (stock must be null)');
        }
        if (p.requires_pii.length > 0) {
          issue('requires_pii', 'a subscription product cannot require buyer data');
        }
      }
      for (const v of p.variants ?? []) {
        if (v.price_usd !== undefined && cents(v.price_usd) < MIN_PRICE_CENTS && !p.is_test) {
          issue('variants', 'variant price must be at least $1.00');
        }
      }
      if (p.fulfillment_mode === 'instant' && !p.fulfillment?.instant) {
        issue('fulfillment', 'fulfillment_mode instant needs fulfillment.instant.payload');
      }
      if (
        p.fulfillment_mode !== 'instant' &&
        p.fulfillment_mode !== 'stream' &&
        p.fulfillment?.instant
      ) {
        issue('fulfillment', 'fulfillment.instant is only for fulfillment_mode instant or stream');
      }
    }),
);
export type CatalogItem = z.infer<typeof CatalogItemSchema>;

export interface CatalogItemError {
  index: number;
  sku: string | null;
  status: 422;
  error_code: 'validation_failed';
  message: string;
}

export interface CatalogReport {
  upserted: number;
  flagged: Array<{ sku: string; reason: string }>;
  rejected: Array<{ sku: string; reason: string; category: string; status: 422 }>;
  errors: CatalogItemError[];
  terms_update_pending?: { docs: unknown[] };
}

export type CatalogDeps = Pick<ShopDeps, 'db' | 'transaction' | 'now'>;

export interface CatalogOpts {
  /** Server key for `fulfillment_payload_encrypted`; defaults to ENCRYPTION_KEY. */
  encryptionKey?: string;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

const validation = (message: string) =>
  new CatalogError(422, 'validation_failed', message, 'fix_request', {
    documentation_url: DOC_URL,
  });

interface MerchantGate {
  merchant_id: string;
  status: string;
  status_reason: string | null;
  limits: { max_order_usd?: number } | null;
}

async function gate(db: ShopTx, merchant_id: string, now?: () => number) {
  const rows = await db.$queryRawUnsafe<MerchantGate[]>(
    `SELECT merchant_id, status, status_reason, limits FROM shop_merchants WHERE merchant_id = $1::uuid`,
    merchant_id,
  );
  if (!rows[0]) throw new ShopAuthError(401, 'unknown merchant');
  const banner = await assertTermsAccepted(db, rows[0], now?.() ?? Date.now());
  return { merchant: rows[0], banner };
}

function encKey(opts: CatalogOpts): string {
  const k = opts.encryptionKey ?? config.ENCRYPTION_KEY;
  if (!k || k.length < 32)
    throw new ShopAuthError(503, 'encryption key unavailable', 'retry shortly');
  return k;
}

const issueText = (e: z.ZodError) =>
  e.issues.map((i) => `${i.path.join('.') || 'item'}: ${i.message}`).join('; ');

async function review(
  tx: ShopTx,
  merchant_id: string,
  product_id: string | null,
  verdict: 'pass' | 'flag' | 'reject',
  category: string | null,
  evidence_hash: string,
) {
  await tx.$executeRawUnsafe(
    `INSERT INTO shop_moderation_reviews (merchant_id, scope, product_id, layer, verdict, category, evidence_hash)
     VALUES ($1::uuid, 'product', $2::uuid, 'rules', $3, $4, $5)`,
    merchant_id,
    product_id,
    verdict,
    category,
    evidence_hash,
  );
}

/**
 * UC-11 / §6.2: idempotent by (merchant_id, sku). Order per item: zod (F-2) -> price ceiling ->
 * duplicate-in-batch -> `moderateProduct` (category, keywords/content-filter, injections) -> write.
 * Bad items are reported per item; the rest of the batch is applied.
 */
export async function upsertCatalog(
  d: CatalogDeps,
  merchant_id: string,
  items: unknown,
  opts: CatalogOpts = {},
): Promise<CatalogReport> {
  if (!Array.isArray(items) || items.length === 0)
    throw validation('items must be a non-empty array');
  if (items.length > MAX_ITEMS_PER_CALL) {
    throw validation(`at most ${MAX_ITEMS_PER_CALL} items per call`);
  }
  const { merchant, banner } = await gate(d.db, merchant_id, d.now);
  const maxOrder = Number(merchant.limits?.max_order_usd ?? DEFAULT_MAX_ORDER_USD);

  const report: CatalogReport = { upserted: 0, flagged: [], rejected: [], errors: [], ...banner };
  const seen = new Set<string>();
  const key = items.some((i) => (i as { fulfillment?: unknown })?.fulfillment) ? encKey(opts) : '';

  await d.transaction(async (tx) => {
    let rejectedAny = false;
    for (let index = 0; index < items.length; index++) {
      const raw = items[index] as Record<string, unknown> | null;
      const rawSku = typeof raw?.sku === 'string' ? raw.sku : null;
      const bad = (message: string) =>
        report.errors.push({
          index,
          sku: rawSku,
          status: 422,
          error_code: 'validation_failed',
          message,
        });

      const parsed = CatalogItemSchema.safeParse(raw);
      if (!parsed.success) {
        bad(issueText(parsed.error));
        continue;
      }
      const p = parsed.data;
      // The order ceiling bounds what a buyer commits at once: a stream's is its minimum deposit.
      const ceilingUsd = p.stream ? Number(p.stream.min_deposit_usd) : Number(p.price_usd);
      if (!p.is_test && Math.round(ceilingUsd * 100) > maxOrder * 100) {
        bad(
          p.stream
            ? `stream.min_deposit_usd: above the merchant limit max_order_usd (${maxOrder})`
            : `price_usd: above the merchant limit max_order_usd (${maxOrder})`,
        );
        continue;
      }
      if (seen.has(p.sku)) {
        bad('sku: duplicated inside the batch');
        continue;
      }
      seen.add(p.sku);

      const hidden =
        (typeof raw?.title === 'string' && hasHiddenChars(raw.title)) ||
        (typeof raw?.description === 'string' && hasHiddenChars(raw.description));
      const verdict = moderateProduct({
        sku: p.sku,
        title: p.title,
        description: p.description,
        category: p.category,
        hidden_chars: hidden,
      });

      if (verdict.verdict === 'rejected') {
        rejectedAny = true;
        // A listed product that now fails the rules leaves the shelf.
        const prev = await tx.$queryRawUnsafe<Array<{ product_id: string }>>(
          `UPDATE shop_products SET moderation_status = 'rejected', updated_at = now()
            WHERE merchant_id = $1::uuid AND sku = $2 RETURNING product_id`,
          merchant_id,
          p.sku,
        );
        await review(
          tx,
          merchant_id,
          prev[0]?.product_id ?? null,
          'reject',
          verdict.category,
          verdict.evidence_hash,
        );
        report.rejected.push({
          sku: p.sku,
          reason: verdict.reason,
          category: verdict.category,
          status: 422,
        });
        continue;
      }

      const payload = p.fulfillment?.instant?.payload;
      const rows = await tx.$queryRawUnsafe<Array<{ product_id: string }>>(
        `INSERT INTO shop_products
           (merchant_id, sku, title, description, price_usd, is_test, currency_display, available,
            fulfillment_mode, fulfillment_payload_encrypted, tax_included, tax_note, shipping_options,
            delivery_slots, requires_pii, refund_window_days, returns_accepted, category, images,
            moderation_status, stream, subscription)
         VALUES ($1::uuid, $2, $3, $4, $5::numeric, $6, $7, $8::int, $9, $10, $11, $12, $13::jsonb,
                 $14::jsonb, $15::text[], $16::int, $17, $18, $19::text[], $20, $21::jsonb, $22::jsonb)
         ON CONFLICT (merchant_id, sku) DO UPDATE SET
           title = EXCLUDED.title, description = EXCLUDED.description, price_usd = EXCLUDED.price_usd,
           is_test = EXCLUDED.is_test, currency_display = EXCLUDED.currency_display,
           available = EXCLUDED.available, fulfillment_mode = EXCLUDED.fulfillment_mode,
           fulfillment_payload_encrypted = EXCLUDED.fulfillment_payload_encrypted,
           tax_included = EXCLUDED.tax_included, tax_note = EXCLUDED.tax_note,
           shipping_options = EXCLUDED.shipping_options, delivery_slots = EXCLUDED.delivery_slots,
           requires_pii = EXCLUDED.requires_pii, refund_window_days = EXCLUDED.refund_window_days,
           returns_accepted = EXCLUDED.returns_accepted, category = EXCLUDED.category,
           images = EXCLUDED.images, moderation_status = EXCLUDED.moderation_status,
           stream = EXCLUDED.stream, subscription = EXCLUDED.subscription, updated_at = now()
         RETURNING product_id`,
        merchant_id,
        p.sku,
        p.title,
        p.description,
        p.price_usd,
        p.is_test,
        p.currency_display ?? null,
        p.stock ?? null,
        p.fulfillment_mode,
        payload ? encryptSecret(payload, key) : null,
        p.tax_included,
        p.tax_note ?? null,
        JSON.stringify(p.shipping_options),
        JSON.stringify(p.delivery_slots),
        p.requires_pii,
        p.refund_window_days ?? null,
        p.returns_accepted,
        p.category,
        p.images,
        verdict.verdict === 'flagged' ? 'flagged' : 'ok',
        p.stream ? JSON.stringify(p.stream) : null,
        p.subscription ? JSON.stringify(p.subscription) : null,
      );
      const product_id = rows[0].product_id;

      if (p.variants) {
        for (const v of p.variants) {
          await tx.$executeRawUnsafe(
            `INSERT INTO shop_product_variants (product_id, merchant_id, sku, title, price_usd, available, attributes)
             VALUES ($1::uuid, $2::uuid, $3, $4, $5::numeric, $6::int, $7::jsonb)
             ON CONFLICT (product_id, sku) DO UPDATE SET title = EXCLUDED.title,
               price_usd = EXCLUDED.price_usd, available = EXCLUDED.available, attributes = EXCLUDED.attributes`,
            product_id,
            merchant_id,
            v.sku,
            v.title,
            v.price_usd ?? null,
            v.stock ?? null,
            JSON.stringify(v.attributes ?? {}),
          );
        }
        await tx.$executeRawUnsafe(
          `DELETE FROM shop_product_variants WHERE product_id = $1::uuid AND NOT (sku = ANY($2::text[]))`,
          product_id,
          p.variants.map((v) => v.sku),
        );
      }

      await review(
        tx,
        merchant_id,
        product_id,
        verdict.verdict === 'flagged' ? 'flag' : 'pass',
        p.category,
        verdict.evidence_hash,
      );
      if (verdict.verdict === 'flagged')
        report.flagged.push({ sku: p.sku, reason: verdict.reason });
      report.upserted++;
    }
    if (rejectedAny) {
      await tx.$executeRawUnsafe(
        `INSERT INTO outbox (event_type, payload) VALUES ($1, $2::jsonb)`,
        'shop.catalog.rejected',
        JSON.stringify({
          merchant_id,
          rejected: report.rejected.map((r) => ({
            sku: r.sku,
            category: r.category,
            sku_hash: sha(r.sku),
          })),
        }),
      );
    }
  });
  return report;
}

/**
 * §6.2 catalog_delete. A sku with an open, unexpired quote cannot go: the whole call is refused
 * with 409 + `extra.quote_ids` (quotes reference products by `items[].sku` or by a reservation).
 */
export async function deleteCatalog(
  d: CatalogDeps,
  merchant_id: string,
  skus: unknown,
): Promise<{ deleted: number; not_found: string[]; terms_update_pending?: { docs: unknown[] } }> {
  if (!Array.isArray(skus) || skus.length === 0 || skus.length > MAX_ITEMS_PER_CALL) {
    throw validation(`skus must be an array of 1..${MAX_ITEMS_PER_CALL} items`);
  }
  if (!skus.every((s) => typeof s === 'string' && s.length > 0 && s.length <= 64)) {
    throw validation('skus must be non-empty strings');
  }
  const list = [...new Set(skus as string[])];
  const { banner } = await gate(d.db, merchant_id, d.now);

  return d.transaction(async (tx) => {
    const found = await tx.$queryRawUnsafe<Array<{ product_id: string; sku: string }>>(
      `SELECT product_id, sku FROM shop_products
        WHERE merchant_id = $1::uuid AND sku = ANY($2::text[]) FOR UPDATE`,
      merchant_id,
      list,
    );
    const open = await tx.$queryRawUnsafe<Array<{ quote_id: string }>>(
      `SELECT DISTINCT q.quote_id
         FROM shop_quotes q
        WHERE q.merchant_id = $1::uuid AND q.status = 'open' AND q.expires_at > now()
          AND (
            EXISTS (SELECT 1 FROM jsonb_array_elements(
                      CASE WHEN jsonb_typeof(q.items) = 'array' THEN q.items ELSE '[]'::jsonb END) it
                     WHERE it->>'sku' = ANY($2::text[]))
            OR EXISTS (SELECT 1 FROM shop_inventory_reservations r
                        WHERE r.quote_id = q.quote_id AND r.product_id = ANY($3::uuid[]))
          )`,
      merchant_id,
      list,
      found.map((f) => f.product_id),
    );
    if (open.length > 0) {
      throw new CatalogError(
        409,
        'conflict',
        'a sku has an open quote; delete it after the quote expires',
        'retry_after_delay',
        { documentation_url: DOC_URL, quote_ids: open.map((o) => o.quote_id) },
      );
    }
    const deleted = await tx.$queryRawUnsafe<unknown[]>(
      `DELETE FROM shop_products WHERE merchant_id = $1::uuid AND sku = ANY($2::text[]) RETURNING product_id`,
      merchant_id,
      list,
    );
    const have = new Set(found.map((f) => f.sku));
    return {
      deleted: deleted.length,
      not_found: list.filter((s) => !have.has(s)),
      ...banner,
    };
  });
}
