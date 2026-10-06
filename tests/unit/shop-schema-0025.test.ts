/**
 * T-INT-01 SC1-SC4, SC9, SC11: migration 0025 against a real (disposable) Postgres.
 * Run: TEST_DATABASE_URL=postgresql://... npx jest tests/unit/shop-schema-0025.test.ts
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  client,
  dbDescribe,
  migrate,
  mkMerchant,
  mkOrder,
  mkProduct,
  mkQuote,
} from './helpers/shop-db';

/** Added by the one wave-2 migration 0026_integrator_wave2 (T-INT-21). */
const TABLES_WAVE2 = [
  'shop_catalog_imports',
  'shop_disputes',
  'shop_fee_invoices',
  'shop_pii_envelopes',
];

const TABLES_5_1 = [
  'shop_acceptances',
  'shop_connect_events',
  'shop_fee_ledger',
  'shop_inventory_reservations',
  'shop_legal_docs',
  'shop_merchant_keys',
  'shop_merchants',
  'shop_moderation_reviews',
  'shop_order_events',
  'shop_orders',
  'shop_payments',
  'shop_product_variants',
  'shop_products',
  'shop_quotes',
  'shop_refunds',
  'shop_sanctioned_addresses',
  'shop_webhook_deliveries',
  'shop_webhook_endpoints',
];

// the 12 kinds of migration 0009 (snapshot) + the 12 new ones of spec section 12.2
const KINDS_0009 = [
  'AUTH_FAILED',
  'CREDENTIAL_EXPIRED',
  'PROVIDER_DOWN',
  'DEGRADED_QUALITY',
  'RATE_LIMITED',
  'QUOTA_LOW',
  'QUOTA_EXHAUSTED',
  'PAYMENT_REQUIRED',
  'API_CHANGED',
  'ENDPOINT_CHANGED',
  'EMAIL_NOTICE',
  'UNKNOWN',
];
const KINDS_NEW = [
  'CONNECT_FAILED',
  'WEBHOOK_FAILED',
  'MERCHANT_UNRESPONSIVE',
  'REFUND_OVERDUE',
  'DISPUTE_UNANSWERED',
  'CATALOG_REJECTED',
  'MODERATION_FLAG',
  'PAYOUT_WALLET_SANCTIONED',
  'PAYER_SANCTIONED',
  'PAYMENT_MISMATCH',
  'FEE_INVOICE_OVERDUE',
  'STOREFRONT_DOWN',
];

describe('0025 shape (no DB needed)', () => {
  const sql = readFileSync(
    join(__dirname, '../../prisma/migrations/0025_integrator_shop/migration.sql'),
    'utf8',
  );
  const sql0009 = readFileSync(
    join(__dirname, '../../prisma/migrations/0009_autopilot_schema/migration.sql'),
    'utf8',
  );
  it('the 0009 kind snapshot in this test equals the 0009 CHECK', () => {
    const m = /"incidents_kind_check" CHECK \("kind" IN \(([^)]*)\)/.exec(sql0009);
    const kinds = [...(m?.[1] ?? '').matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]);
    expect(kinds).toEqual(KINDS_0009);
  });
  it('0025 lists all 24 kinds in the replaced constraint', () => {
    const m = /ADD CONSTRAINT "incidents_kind_check" CHECK \("kind" IN \(([^)]*)\)/.exec(sql);
    const kinds = [...(m?.[1] ?? '').matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]);
    expect(kinds).toEqual([...KINDS_0009, ...KINDS_NEW]);
  });
  it('only incidents is altered among existing tables', () => {
    expect([...sql.matchAll(/ALTER TABLE "(\w+)"/g)].map((x) => x[1])).toEqual([
      'incidents',
      'incidents',
    ]);
  });
});

dbDescribe('0025 on a migrated database', () => {
  const db = client();
  beforeAll(() => migrate());
  afterAll(() => db.$disconnect());

  it('SC1: the 18 section-5.1 tables exist, list == snapshot (+ the wave-2 tables of 0026 and 0032)', async () => {
    const rows = await db.$queryRawUnsafe<Array<{ tablename: string }>>(
      `SELECT c.relname AS tablename FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND c.relname LIKE 'shop\\_%'
          AND NOT c.relispartition ORDER BY 1`,
    );
    expect(rows.map((r) => r.tablename)).toEqual([...TABLES_5_1, ...TABLES_WAVE2].sort());
    expect(TABLES_5_1).toHaveLength(18);
  });

  it('SC2: partial unique index on shop_orders(quote_id)', async () => {
    const m = await mkMerchant(db);
    const q = await mkQuote(db, m);
    const first = await mkOrder(db, m, q, 'QUOTED');
    await expect(mkOrder(db, m, q, 'PAYING')).rejects.toThrow(/23505/);
    await db.$executeRawUnsafe(
      `UPDATE shop_orders SET state = 'PAYMENT_FAILED' WHERE order_id = $1::uuid`,
      first,
    );
    await expect(mkOrder(db, m, q, 'PAYING')).resolves.toBeDefined(); // slot freed
  });

  it('SC3: one is_test per merchant; same sku across merchants ok', async () => {
    const a = await mkMerchant(db);
    const b = await mkMerchant(db);
    await mkProduct(db, a, { sku: '__apibase_test', is_test: true });
    await expect(mkProduct(db, a, { sku: 'other', is_test: true })).rejects.toThrow(/23505/);
    await expect(mkProduct(db, b, { sku: '__apibase_test', is_test: true })).resolves.toBeDefined();
    await mkProduct(db, a, { sku: 'dup' });
    await expect(mkProduct(db, a, { sku: 'dup' })).rejects.toThrow(/23505/);
    await expect(mkProduct(db, b, { sku: 'dup' })).resolves.toBeDefined();
  });

  const insertKind = (kind: string) =>
    db.$executeRawUnsafe(
      `INSERT INTO incidents (dedup_key, provider, kind, severity, state, detected_by, evidence)
       VALUES ($1, 'merchant:x', $2, 'SEV3', 'OPEN', 'manual', '{}'::jsonb)`,
      `${kind}:merchant:x:${Math.random()}`,
      kind,
    );

  it('SC4: new kind passes after 0025, junk kind is rejected, the 12 old kinds still pass', async () => {
    await expect(insertKind('CONNECT_FAILED')).resolves.toBe(1);
    await expect(insertKind('NOT_A_KIND')).rejects.toThrow(/incidents_kind_check/);
    for (const k of KINDS_0009) await expect(insertKind(k)).resolves.toBe(1);
    for (const k of KINDS_NEW) await expect(insertKind(k)).resolves.toBe(1);
  });

  it('SC9: shop_acceptances is append-only', async () => {
    const m = await mkMerchant(db);
    await db.$executeRawUnsafe(
      `INSERT INTO shop_acceptances (merchant_id, doc_id, version, sha256, method, signer, signature, message)
       VALUES ($1::uuid, 'terms', '1', repeat('a',64), 'wallet_signature', '0x1', '0xsig', 'msg')`,
      m,
    );
    await expect(
      db.$executeRawUnsafe(
        `UPDATE shop_acceptances SET signer = 'x' WHERE merchant_id = $1::uuid`,
        m,
      ),
    ).rejects.toThrow(/append-only/);
    await expect(
      db.$executeRawUnsafe(`DELETE FROM shop_acceptances WHERE merchant_id = $1::uuid`, m),
    ).rejects.toThrow(/append-only/);
  });

  it('SC11: an event dated in a future month lands in a pre-created monthly partition (no default partition)', async () => {
    const m = await mkMerchant(db);
    const o = await mkOrder(db, m, await mkQuote(db, m));
    await db.$executeRawUnsafe(
      `INSERT INTO shop_order_events (order_id, seq, to_state, actor, at)
       VALUES ($1::uuid, 1, 'QUOTED', 'system', date_trunc('month', now()) + interval '2 months 3 days')`,
      o,
    );
    const rows = await db.$queryRawUnsafe<Array<{ part: string }>>(
      `SELECT tableoid::regclass::text AS part FROM shop_order_events WHERE order_id = $1::uuid`,
      o,
    );
    expect(rows[0].part).toMatch(/^shop_order_events_\d{4}_\d{2}$/);
    const def = await db.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
        WHERE i.inhparent = 'shop_order_events'::regclass AND pg_get_expr(c.relpartbound, c.oid) = 'DEFAULT'`,
    );
    expect(def).toHaveLength(0);
  });
});
