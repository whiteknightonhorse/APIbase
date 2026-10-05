import { execSync } from 'child_process';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

/**
 * Test-DB gate for the Integrator shop suites: set TEST_DATABASE_URL to a DISPOSABLE
 * Postgres (never prod). Without it the DB suites are skipped (CI has no Postgres).
 * `prisma migrate deploy` is run against it once per process (idempotent).
 */
export const TEST_DB_URL = process.env.TEST_DATABASE_URL;
export const dbDescribe: jest.Describe = TEST_DB_URL ? describe : describe.skip;

let deployed = false;
export function migrate(): void {
  if (deployed || !TEST_DB_URL) return;
  execSync('npx prisma migrate deploy', {
    cwd: join(__dirname, '../../..'),
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'pipe',
  });
  deployed = true;
}

export function client(): PrismaClient {
  return new PrismaClient({ datasourceUrl: TEST_DB_URL });
}

let n = 0;
const uniq = () => `${Date.now().toString(36)}${(n++).toString(36)}`;

export async function mkMerchant(db: PrismaClient, tag = uniq()): Promise<string> {
  const rows = await db.$queryRawUnsafe<Array<{ merchant_id: string }>>(
    `INSERT INTO shop_merchants (slug, name, category, country, wallet_address, payout_wallet_base,
        payout_wallet_tempo, contact_email, site_url)
     VALUES ($1, 'm', 'c', 'US', $2, '0xb', '0xt', 'a@b.c', 'https://x.example') RETURNING merchant_id`,
    `m-${tag}`,
    `0x${tag}`,
  );
  return rows[0].merchant_id;
}

export async function mkQuote(
  db: PrismaClient,
  merchant_id: string,
  opts: { status?: string; expiresInS?: number } = {},
): Promise<string> {
  const rows = await db.$queryRawUnsafe<Array<{ quote_id: string }>>(
    `INSERT INTO shop_quotes (merchant_id, items, subtotal, total_usd, expires_at, status)
     VALUES ($1::uuid, '[]'::jsonb, 1, 1, now() + ($2::int * interval '1 second'), $3) RETURNING quote_id`,
    merchant_id,
    opts.expiresInS ?? 600,
    opts.status ?? 'open',
  );
  return rows[0].quote_id;
}

export async function mkOrder(
  db: PrismaClient,
  merchant_id: string,
  quote_id: string,
  state = 'QUOTED',
): Promise<string> {
  const rows = await db.$queryRawUnsafe<Array<{ order_id: string }>>(
    `INSERT INTO shop_orders (quote_id, merchant_id, state, total_usd) VALUES ($1::uuid, $2::uuid, $3, 1)
     RETURNING order_id`,
    quote_id,
    merchant_id,
    state,
  );
  return rows[0].order_id;
}

export async function mkProduct(
  db: PrismaClient,
  merchant_id: string,
  opts: { sku?: string; available?: number | null; is_test?: boolean } = {},
): Promise<string> {
  const rows = await db.$queryRawUnsafe<Array<{ product_id: string }>>(
    `INSERT INTO shop_products (merchant_id, sku, title, price_usd, available, is_test)
     VALUES ($1::uuid, $2, 'T', 5, $3::int, $4) RETURNING product_id`,
    merchant_id,
    opts.sku ?? `sku-${uniq()}`,
    opts.available === undefined ? 10 : opts.available,
    opts.is_test ?? false,
  );
  return rows[0].product_id;
}
