import type { ShopTx } from '../db';
import { cents } from '../catalog.service';

export const PUBLIC_BASE = 'https://apibase.pro';
export const mcpUrl = (slug: string) => `${PUBLIC_BASE}/mcp/m/${slug}`;
export const REST_BASE = `${PUBLIC_BASE}/api/v1/shop`;
const SHOPS_PAGE_SIZE = 50;
const SLUG_RE = /^[a-z0-9-]{3,40}$/;
const CART_MAX_ITEMS = 50;
const CART_MAX_QTY = 999;

/**
 * Public face of a merchant (§6.3 / UC-19): `contact_email` and every payout / wallet column are
 * not selected anywhere in this file, so they cannot reach a rendered page by accident.
 */
export interface PublicShop {
  slug: string;
  name: string;
  category: string;
  site_url: string;
  domain_verified: boolean;
  reputation: Record<string, unknown>;
  policy: Record<string, unknown>;
}

export interface PublicProduct {
  sku: string;
  title: string;
  price_usd: string;
  availability: 'in_stock' | 'out_of_stock';
  requires_pii: string[];
  fulfillment_mode: 'instant' | 'merchant' | 'physical';
}

export interface PublicProductCard extends PublicProduct {
  description: string;
  category: string | null;
  images: string[];
  tax_included: boolean;
  tax_note: string | null;
  refund_policy: { refund_window_days: number | null; returns_accepted: boolean };
}

/** Thrown for every non-servable merchant: `gone` (deactivated / suspended) is a 410, the rest a 404. */
export class StorefrontError extends Error {
  constructor(
    readonly status: 400 | 404 | 410,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface ShopRow extends PublicShop {
  merchant_id: string;
  status: string;
  status_reason: string | null;
}

const availability = (available: number | null, reserved: number) =>
  available === null || available - reserved > 0 ? 'in_stock' : 'out_of_stock';

const SHOP_COLS = `merchant_id, slug, name, category, site_url, domain_verified, status,
                   status_reason, reputation, policy`;

const strip = (r: ShopRow): PublicShop => ({
  slug: r.slug,
  name: r.name,
  category: r.category,
  site_url: r.site_url,
  domain_verified: r.domain_verified,
  reputation: r.reputation ?? {},
  policy: r.policy ?? {},
});

/** active -> row; deactivated/suspended -> 410; pending/unknown -> 404. */
export async function loadShop(
  db: ShopTx,
  slug: unknown,
): Promise<{ merchant_id: string; shop: PublicShop }> {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    throw new StorefrontError(404, 'not_found', 'shop not found');
  }
  const rows = await db.$queryRawUnsafe<ShopRow[]>(
    `SELECT ${SHOP_COLS} FROM shop_merchants WHERE slug = $1`,
    slug,
  );
  const r = rows[0];
  if (!r || r.status === 'pending') throw new StorefrontError(404, 'not_found', 'shop not found');
  if (r.status !== 'active') {
    throw new StorefrontError(410, 'gone', 'this shop is no longer available');
  }
  return { merchant_id: r.merchant_id, shop: strip(r) };
}

export async function listShops(
  db: ShopTx,
  page: number,
): Promise<{ shops: PublicShop[]; page: number; page_size: number; total: number }> {
  const p = Math.max(1, Math.trunc(page) || 1);
  const [rows, total] = await Promise.all([
    db.$queryRawUnsafe<ShopRow[]>(
      `SELECT ${SHOP_COLS} FROM shop_merchants WHERE status = 'active'
        ORDER BY slug LIMIT $1::int OFFSET $2::int`,
      SHOPS_PAGE_SIZE,
      (p - 1) * SHOPS_PAGE_SIZE,
    ),
    db.$queryRawUnsafe<Array<{ n: number | bigint }>>(
      `SELECT count(*)::int AS n FROM shop_merchants WHERE status = 'active'`,
    ),
  ]);
  return {
    shops: rows.map(strip),
    page: p,
    page_size: SHOPS_PAGE_SIZE,
    total: Number(total[0]?.n ?? 0),
  };
}

/** §6.1 products[]: no test SKU, no flagged/rejected; always scoped to ONE merchant_id (§9.1). */
export async function listProducts(
  db: ShopTx,
  merchant_id: string,
  limit = 100,
): Promise<PublicProduct[]> {
  const rows = await db.$queryRawUnsafe<
    Array<PublicProduct & { available: number | null; reserved: number }>
  >(
    `SELECT sku, title, price_usd::numeric(18,2)::text AS price_usd, available, reserved,
            requires_pii, fulfillment_mode
       FROM shop_products
      WHERE merchant_id = $1::uuid AND NOT is_test AND moderation_status = 'ok'
      ORDER BY sku LIMIT $2::int`,
    merchant_id,
    limit,
  );
  return rows.map((r) => ({
    sku: r.sku,
    title: r.title,
    price_usd: r.price_usd,
    availability: availability(r.available, r.reserved),
    requires_pii: r.requires_pii,
    fulfillment_mode: r.fulfillment_mode,
  }));
}

export async function getProductCard(
  db: ShopTx,
  merchant_id: string,
  sku: string,
): Promise<PublicProductCard> {
  const rows = await db.$queryRawUnsafe<
    Array<
      Omit<PublicProductCard, 'availability' | 'refund_policy'> & {
        available: number | null;
        reserved: number;
        refund_window_days: number | null;
        returns_accepted: boolean;
      }
    >
  >(
    `SELECT sku, title, description, price_usd::numeric(18,2)::text AS price_usd, available,
            reserved, fulfillment_mode, requires_pii, category, images, tax_included, tax_note,
            refund_window_days, returns_accepted
       FROM shop_products
      WHERE merchant_id = $1::uuid AND sku = $2 AND NOT is_test AND moderation_status = 'ok'`,
    merchant_id,
    sku,
  );
  const r = rows[0];
  if (!r) throw new StorefrontError(404, 'not_found', 'product not found');
  return {
    sku: r.sku,
    title: r.title,
    description: r.description,
    price_usd: r.price_usd,
    availability: availability(r.available, r.reserved),
    fulfillment_mode: r.fulfillment_mode,
    requires_pii: r.requires_pii,
    category: r.category,
    images: r.images,
    tax_included: r.tax_included,
    tax_note: r.tax_note,
    refund_policy: {
      refund_window_days: r.refund_window_days,
      returns_accepted: r.returns_accepted,
    },
  };
}

export interface CartLine {
  sku: string;
  title: string;
  qty: number;
  unit_price_usd: string;
  line_total_usd: string;
}

const usd = (c: number) => (c / 100).toFixed(2);

/** `items=sku:qty,…` -> validated lines priced from the SERVER's catalog; the URL carries no prices. */
export async function priceCart(
  db: ShopTx,
  merchant_id: string,
  raw: unknown,
): Promise<{ lines: CartLine[]; total_usd: string }> {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new StorefrontError(400, 'validation_failed', 'items=sku:qty,… is required');
  }
  const parts = raw.split(',');
  if (parts.length > CART_MAX_ITEMS) {
    throw new StorefrontError(400, 'validation_failed', `at most ${CART_MAX_ITEMS} items`);
  }
  const wanted = new Map<string, number>();
  for (const part of parts) {
    const m = /^([A-Za-z0-9._-]{1,64}):(\d{1,3})$/.exec(part.trim());
    const qty = m ? Number(m[2]) : 0;
    if (!m || qty < 1 || qty > CART_MAX_QTY) {
      throw new StorefrontError(
        400,
        'validation_failed',
        `invalid item "${part.slice(0, 80)}": use sku:qty with qty 1..${CART_MAX_QTY}`,
      );
    }
    if (wanted.has(m[1])) {
      throw new StorefrontError(400, 'validation_failed', `duplicate sku "${m[1]}"`);
    }
    wanted.set(m[1], qty);
  }
  const rows = await db.$queryRawUnsafe<Array<{ sku: string; title: string; price_usd: string }>>(
    `SELECT sku, title, price_usd::numeric(18,2)::text AS price_usd
       FROM shop_products
      WHERE merchant_id = $1::uuid AND NOT is_test AND moderation_status = 'ok'
        AND sku = ANY($2::text[])`,
    merchant_id,
    [...wanted.keys()],
  );
  const bySku = new Map(rows.map((r) => [r.sku, r]));
  let total = 0;
  const lines: CartLine[] = [];
  for (const [sku, qty] of wanted) {
    const p = bySku.get(sku);
    if (!p) throw new StorefrontError(404, 'not_found', `unknown sku "${sku}"`);
    const line = cents(p.price_usd) * qty;
    total += line;
    lines.push({
      sku,
      title: p.title,
      qty,
      unit_price_usd: p.price_usd,
      line_total_usd: usd(line),
    });
  }
  return { lines, total_usd: usd(total) };
}
