import type { ShopTx } from './db';
import type { State } from './order-state';

/**
 * Tenant-isolated access to seller-owned shop_* tables (spec section 5 / 14).
 * Every function takes a `MerchantScoped` first argument -- there is no "global" read
 * of seller data here, and `merchant_id` is always in the WHERE clause.
 */
export interface MerchantScoped {
  readonly merchant_id: string;
}

export interface OrderRowOut {
  order_id: string;
  quote_id: string;
  merchant_id: string;
  state: State;
  total_usd: string;
  fee_usd: string;
  created_at: Date;
}

export async function getMerchant(
  db: ShopTx,
  scope: MerchantScoped,
): Promise<Record<string, unknown> | null> {
  const rows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM shop_merchants WHERE merchant_id = $1::uuid`,
    scope.merchant_id,
  );
  return rows[0] ?? null;
}

export interface OrderListRow extends OrderRowOut {
  confirm_due_at: Date | null;
  /** created_at with microseconds: the keyset cursor must not lose Postgres precision. */
  cursor_ts: string;
}

export async function listOrders(
  db: ShopTx,
  scope: MerchantScoped & {
    state?: State;
    since?: Date;
    after?: { cursor_ts: string; order_id: string };
    limit?: number;
  },
): Promise<OrderListRow[]> {
  return db.$queryRawUnsafe<OrderListRow[]>(
    `SELECT order_id, quote_id, merchant_id, state, total_usd::text AS total_usd,
            fee_usd::text AS fee_usd, created_at, confirm_due_at,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_ts
       FROM shop_orders
      WHERE merchant_id = $1::uuid AND ($2::text IS NULL OR state = $2)
        AND ($4::timestamptz IS NULL OR created_at >= $4::timestamptz)
        AND ($5::timestamptz IS NULL OR (created_at, order_id) < ($5::timestamptz, $6::uuid))
      ORDER BY created_at DESC, order_id DESC
      LIMIT $3::int`,
    scope.merchant_id,
    scope.state ?? null,
    Math.min(scope.limit ?? 50, 200),
    scope.since ?? null,
    scope.after?.cursor_ts ?? null,
    scope.after?.order_id ?? null,
  );
}

/** Lock this merchant's order row (FOR UPDATE); null for another tenant's order. */
export async function lockOrder(
  db: ShopTx,
  scope: MerchantScoped & { order_id: string },
): Promise<{ order_id: string; state: State } | null> {
  const rows = await db.$queryRawUnsafe<Array<{ order_id: string; state: State }>>(
    `SELECT order_id, state FROM shop_orders
      WHERE merchant_id = $1::uuid AND order_id = $2::uuid FOR UPDATE`,
    scope.merchant_id,
    scope.order_id,
  );
  return rows[0] ?? null;
}

export async function getOrder(
  db: ShopTx,
  scope: MerchantScoped & { order_id: string },
): Promise<OrderRowOut | null> {
  const rows = await db.$queryRawUnsafe<OrderRowOut[]>(
    `SELECT order_id, quote_id, merchant_id, state, total_usd::text AS total_usd,
            fee_usd::text AS fee_usd, created_at
       FROM shop_orders WHERE merchant_id = $1::uuid AND order_id = $2::uuid`,
    scope.merchant_id,
    scope.order_id,
  );
  return rows[0] ?? null;
}

export async function listProducts(
  db: ShopTx,
  scope: MerchantScoped & { limit?: number },
): Promise<Array<Record<string, unknown>>> {
  return db.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT product_id, merchant_id, sku, title, price_usd::text AS price_usd, available, reserved, is_test
       FROM shop_products WHERE merchant_id = $1::uuid ORDER BY created_at DESC LIMIT $2::int`,
    scope.merchant_id,
    Math.min(scope.limit ?? 50, 200),
  );
}

export async function getProduct(
  db: ShopTx,
  scope: MerchantScoped & { product_id: string },
): Promise<Record<string, unknown> | null> {
  const rows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM shop_products WHERE merchant_id = $1::uuid AND product_id = $2::uuid`,
    scope.merchant_id,
    scope.product_id,
  );
  return rows[0] ?? null;
}

export interface ReserveInput {
  product_id: string;
  variant_id?: string;
  qty: number;
  quote_id: string;
  expires_at: Date;
}

/**
 * UC-16: hold `qty` for a quote. The availability check IS the UPDATE's WHERE clause
 * (`available - reserved >= q`), so two concurrent callers for the last unit cannot both
 * win -- no read-then-write in code. Untracked stock (available IS NULL) always reserves.
 * Run inside a transaction so the reservation row and the counter commit together.
 * Returns false (nothing written) when stock is insufficient or the product is not this merchant's.
 */
export async function reserveStock(
  db: ShopTx,
  scope: MerchantScoped,
  input: ReserveInput,
): Promise<boolean> {
  if (!Number.isInteger(input.qty) || input.qty <= 0)
    throw new Error('reserveStock: qty must be a positive integer');
  const table = input.variant_id ? 'shop_product_variants' : 'shop_products';
  const key = input.variant_id ? 'variant_id' : 'product_id';
  const id = input.variant_id ?? input.product_id;
  const affected = await db.$executeRawUnsafe(
    `UPDATE ${table} SET reserved = reserved + $3::int
      WHERE ${key} = $2::uuid AND merchant_id = $1::uuid
        AND ("available" IS NULL OR "available" - reserved >= $3::int)`,
    scope.merchant_id,
    id,
    input.qty,
  );
  if (affected === 0) return false;
  await db.$executeRawUnsafe(
    `INSERT INTO shop_inventory_reservations (merchant_id, product_id, variant_id, qty, quote_id, expires_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::int, $5::uuid, $6::timestamptz)`,
    scope.merchant_id,
    input.product_id,
    input.variant_id ?? null,
    input.qty,
    input.quote_id,
    input.expires_at,
  );
  return true;
}

async function takeReservations(
  db: ShopTx,
  scope: MerchantScoped,
  quote_id: string,
): Promise<Array<{ product_id: string; variant_id: string | null; qty: number }>> {
  return db.$queryRawUnsafe(
    `DELETE FROM shop_inventory_reservations WHERE merchant_id = $1::uuid AND quote_id = $2::uuid
     RETURNING product_id, variant_id, qty`,
    scope.merchant_id,
    quote_id,
  );
}

/** Quote expired/cancelled: give the held units back. Returns how many reservation rows were released. */
export async function releaseReservation(
  db: ShopTx,
  scope: MerchantScoped,
  quote_id: string,
): Promise<number> {
  const held = await takeReservations(db, scope, quote_id);
  for (const r of held) {
    await adjust(db, scope, r, false);
  }
  return held.length;
}

/** Quote paid: reservation becomes a sale (reserved and available both drop by qty). */
export async function convertReservation(
  db: ShopTx,
  scope: MerchantScoped,
  quote_id: string,
): Promise<number> {
  const held = await takeReservations(db, scope, quote_id);
  for (const r of held) {
    await adjust(db, scope, r, true);
  }
  return held.length;
}

async function adjust(
  db: ShopTx,
  scope: MerchantScoped,
  r: { product_id: string; variant_id: string | null; qty: number },
  sold: boolean,
): Promise<void> {
  const table = r.variant_id ? 'shop_product_variants' : 'shop_products';
  const key = r.variant_id ? 'variant_id' : 'product_id';
  await db.$executeRawUnsafe(
    `UPDATE ${table}
        SET reserved = reserved - $3::int,
            "available" = CASE WHEN $4::boolean AND "available" IS NOT NULL THEN "available" - $3::int ELSE "available" END
      WHERE ${key} = $2::uuid AND merchant_id = $1::uuid`,
    scope.merchant_id,
    r.variant_id ?? r.product_id,
    r.qty,
    sold,
  );
}
