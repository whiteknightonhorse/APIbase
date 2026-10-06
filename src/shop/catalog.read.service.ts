import { CatalogError } from './catalog.errors';
import { merchantUnavailable, reasonBlocks } from './auth/terms.guard';
import type { ShopTx } from './db';
import type { EncryptionKey } from './merchant.service';
import { provekIfDeclared, type ProvekPublic, type ProvekStored } from './provek/provek.service';
import { cents } from './catalog.service';

export const SEARCH_MAX_LIMIT = 50;
export const SEARCH_DEFAULT_LIMIT = 20;

/** Public face of a merchant: `contact_email` and every other column are left out by construction. */
export interface MerchantCard {
  name: string;
  reputation: Record<string, unknown>;
  policy_summary: Record<string, unknown>;
  /** Only for a merchant that opted in to the Provek declaration. */
  provek?: ProvekPublic;
}

export interface SearchInput {
  merchant: string;
  query?: string;
  category?: string;
  max_price_usd?: number | string;
  limit?: number;
  cursor?: string;
}

export interface ProductSummary {
  sku: string;
  title: string;
  price_usd: string;
  availability: 'in_stock' | 'out_of_stock';
  requires_pii: string[];
  fulfillment_mode: 'instant' | 'merchant' | 'physical' | 'stream';
}

interface MerchantRow {
  merchant_id: string;
  name: string;
  status: string;
  status_reason: string | null;
  reputation: Record<string, unknown> | null;
  policy: Record<string, unknown> | null;
  encryption_key: EncryptionKey | null;
  provek: ProvekStored | null;
}

const notFound = (what: string) =>
  new CatalogError(404, 'not_found', `${what} not found`, 'use_different_tool', {
    documentation_url: '/docs/integrator#catalog',
  });

async function activeMerchant(db: ShopTx, slug: unknown): Promise<MerchantRow> {
  if (typeof slug !== 'string' || !/^[a-z0-9-]{3,40}$/.test(slug)) throw notFound('merchant');
  const rows = await db.$queryRawUnsafe<MerchantRow[]>(
    `SELECT merchant_id, name, status, status_reason, reputation, policy, encryption_key, provek
       FROM shop_merchants WHERE slug = $1`,
    slug,
  );
  if (!rows[0]) throw notFound('merchant');
  if (rows[0].status !== 'active' || reasonBlocks(rows[0].status_reason))
    throw merchantUnavailable();
  return rows[0];
}

const card = (m: MerchantRow): MerchantCard => ({
  name: m.name,
  reputation: m.reputation ?? {},
  policy_summary: m.policy ?? {},
  ...(provekIfDeclared(m.provek) ? { provek: provekIfDeclared(m.provek) } : {}),
});

const availability = (available: number | null, reserved: number) =>
  available === null || available - reserved > 0 ? 'in_stock' : 'out_of_stock';

function decodeCursor(c: string | undefined): { rank: string; id: string } | null {
  if (!c) return null;
  try {
    const v = JSON.parse(Buffer.from(c, 'base64url').toString('utf8')) as { r: string; p: string };
    if (typeof v.r === 'string' && /^[0-9.e+-]+$/i.test(v.r) && /^[0-9a-f-]{36}$/i.test(v.p)) {
      return { rank: v.r, id: v.p };
    }
  } catch {
    /* fall through */
  }
  throw new CatalogError(422, 'validation_failed', 'invalid cursor', 'fix_request');
}

/**
 * §6.1 shop.catalog.search: FTS over title+description, only `moderation_status='ok'` and never
 * the test SKU. Order and cursor are (rank DESC, product_id ASC).
 */
export async function searchCatalog(
  db: ShopTx,
  input: SearchInput,
): Promise<{ merchant: MerchantCard; products: ProductSummary[]; next_cursor?: string }> {
  const m = await activeMerchant(db, input.merchant);
  const limit = Math.min(
    Math.max(Math.trunc(Number(input.limit ?? SEARCH_DEFAULT_LIMIT)) || SEARCH_DEFAULT_LIMIT, 1),
    SEARCH_MAX_LIMIT,
  );
  const query = input.query?.trim() || null;
  let maxPrice: string | null = null;
  if (input.max_price_usd !== undefined && input.max_price_usd !== null) {
    const n = Number(input.max_price_usd);
    if (!Number.isFinite(n) || n < 0) {
      throw new CatalogError(422, 'validation_failed', 'max_price_usd must be >= 0', 'fix_request');
    }
    maxPrice = String(cents(String(n)) / 100);
  }
  const cur = decodeCursor(input.cursor);

  const rows = await db.$queryRawUnsafe<
    Array<
      ProductSummary & {
        rank: string;
        product_id: string;
        available: number | null;
        reserved: number;
      }
    >
  >(
    `SELECT * FROM (
       SELECT product_id, sku, title, price_usd::numeric(18,2)::text AS price_usd, available, reserved,
              requires_pii, fulfillment_mode,
              (CASE WHEN $2::text IS NULL THEN 0::real
                    ELSE ts_rank(search, plainto_tsquery('simple', $2)) END) AS rank
         FROM shop_products
        WHERE merchant_id = $1::uuid AND NOT is_test AND moderation_status = 'ok'
          AND fulfillment_mode <> 'stream'
          AND ($2::text IS NULL OR search @@ plainto_tsquery('simple', $2))
          AND ($3::text IS NULL OR category = $3)
          AND ($4::numeric IS NULL OR price_usd <= $4::numeric)
     ) s
      WHERE ($5::real IS NULL OR rank < $5::real OR (rank = $5::real AND product_id > $6::uuid))
      ORDER BY rank DESC, product_id ASC
      LIMIT $7::int`,
    m.merchant_id,
    query,
    input.category ?? null,
    maxPrice,
    cur?.rank ?? null,
    cur?.id ?? null,
    limit + 1,
  );
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    merchant: card(m),
    products: page.map((r) => ({
      sku: r.sku,
      title: r.title,
      price_usd: r.price_usd,
      availability: availability(r.available, r.reserved),
      requires_pii: r.requires_pii,
      fulfillment_mode: r.fulfillment_mode,
    })),
    ...(rows.length > limit && last
      ? {
          next_cursor: Buffer.from(
            JSON.stringify({ r: String(last.rank), p: last.product_id }),
          ).toString('base64url'),
        }
      : {}),
  };
}

export interface ProductCard extends ProductSummary {
  description: string;
  currency_display: string | null;
  category: string | null;
  images: string[];
  tax_included: boolean;
  tax_note: string | null;
  shipping_options: unknown[];
  delivery_slots: unknown[];
  refund_policy: { refund_window_days: number | null; returns_accepted: boolean };
  variants: Array<{
    sku: string;
    title: string;
    price_usd: string | null;
    availability: string;
    attributes: unknown;
  }>;
  /** `fulfillment_mode = 'stream'` only (UC-7): the per-second terms and the one endpoint that sells them. */
  stream?: { rate_per_s_usd: string; min_deposit_usd: string; unit: 'second'; url: string };
  /** T-INT-41 (UC-9): present on a subscription item; `price_usd` is the price of one period. */
  subscription?: { period_unit: string; period_count: number; max_periods?: number; trial: 'none' };
}

/** §6.1 shop.catalog.get: full card; flagged/rejected products are 404; the test SKU is fetchable. */
export async function getProduct(
  db: ShopTx,
  input: { merchant: string; sku: string },
): Promise<
  ProductCard & { merchant: MerchantCard; merchant_encryption_key: EncryptionKey | null }
> {
  const m = await activeMerchant(db, input.merchant);
  const rows = await db.$queryRawUnsafe<
    Array<
      Omit<
        ProductCard,
        'availability' | 'refund_policy' | 'variants' | 'stream' | 'subscription'
      > & {
        product_id: string;
        price_raw: string;
        stream: { rate_per_s_usd: string; min_deposit_usd: string; unit: 'second' } | null;
        subscription: NonNullable<ProductCard['subscription']> | null;
        available: number | null;
        reserved: number;
        refund_window_days: number | null;
        returns_accepted: boolean;
      }
    >
  >(
    `SELECT product_id, sku, title, description, price_usd::numeric(18,2)::text AS price_usd,
            currency_display, available, reserved, fulfillment_mode, tax_included, tax_note,
            shipping_options, delivery_slots, requires_pii, refund_window_days, returns_accepted,
            category, images, stream, subscription, price_usd::text AS price_raw
       FROM shop_products
      WHERE merchant_id = $1::uuid AND sku = $2 AND moderation_status = 'ok'`,
    m.merchant_id,
    String(input.sku ?? ''),
  );
  const r = rows[0];
  if (!r) throw notFound('product');
  const variants = await db.$queryRawUnsafe<
    Array<{
      sku: string;
      title: string;
      price_usd: string | null;
      available: number | null;
      reserved: number;
      attributes: unknown;
    }>
  >(
    `SELECT sku, title, price_usd::numeric(18,2)::text AS price_usd, available, reserved, attributes
       FROM shop_product_variants WHERE merchant_id = $1::uuid AND product_id = $2::uuid ORDER BY sku`,
    m.merchant_id,
    r.product_id,
  );
  return {
    sku: r.sku,
    title: r.title,
    description: r.description,
    // A stream price is a per-second rate (0.0001): the cent-rounded column would read 0.00.
    price_usd: r.stream ? r.price_raw.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') : r.price_usd,
    currency_display: r.currency_display,
    availability: availability(r.available, r.reserved),
    fulfillment_mode: r.fulfillment_mode,
    requires_pii: r.requires_pii,
    category: r.category,
    images: r.images,
    tax_included: r.tax_included,
    tax_note: r.tax_note,
    shipping_options: r.shipping_options,
    delivery_slots: r.delivery_slots,
    refund_policy: {
      refund_window_days: r.refund_window_days,
      returns_accepted: r.returns_accepted,
    },
    variants: variants.map((v) => ({
      sku: v.sku,
      title: v.title,
      price_usd: v.price_usd,
      availability: availability(v.available, v.reserved),
      attributes: v.attributes,
    })),
    ...(r.stream
      ? {
          stream: {
            rate_per_s_usd: r.stream.rate_per_s_usd,
            min_deposit_usd: r.stream.min_deposit_usd,
            unit: r.stream.unit,
            url: `${(process.env.PUBLIC_BASE_URL || 'https://apibase.pro').replace(/\/+$/, '')}/api/v1/shop/m/${input.merchant}/stream/${r.sku}`,
          },
        }
      : {}),
    ...(r.subscription ? { subscription: r.subscription } : {}),
    merchant: card(m),
    merchant_encryption_key: m.encryption_key,
  };
}
