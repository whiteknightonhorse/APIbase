/**
 * T-0536: read-only report of live products whose title or description states a currency amount
 * that differs from `price_usd` (the same rule as the `price_claim_mismatch` catalog gate).
 *
 *   DATABASE_URL=... npx tsx scripts/shop/report-price-claims.ts [--slug <slug>]
 *
 * Writes nothing and edits no merchant text. Output is one JSON line:
 * `{ count, items: [{ slug, sku, field, claimed, price_usd, title }] }`.
 */
import type { ShopTx } from '../../src/shop/db';
import { findPriceClaimMismatch } from '../../src/shop/moderation/price-claims';

export interface ClaimRow {
  slug: string;
  sku: string;
  title: string;
  description: string | null;
  price_usd: string;
}

export async function run(argv: string[], db: ShopTx): Promise<Record<string, unknown>> {
  let slug: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--slug') {
      const v = argv[++i];
      if (v === undefined) throw new Error('--slug needs a value');
      slug = v;
    } else throw new Error(`unknown argument: ${argv[i]}`);
  }
  const rows = await db.$queryRawUnsafe<ClaimRow[]>(
    `SELECT m.slug, p.sku, p.title, p.description, p.price_usd::text AS price_usd
       FROM shop_products p JOIN shop_merchants m USING (merchant_id)
      WHERE m.status = 'active' AND p.moderation_status = 'ok' AND NOT p.is_test
        AND ($1::text IS NULL OR m.slug = $1)
      ORDER BY m.slug, p.sku`,
    slug,
  );
  const items = [];
  for (const r of rows) {
    const c = findPriceClaimMismatch(r.title, r.description, r.price_usd);
    if (c) {
      items.push({
        slug: r.slug,
        sku: r.sku,
        field: c.field,
        claimed: c.claimed,
        price_usd: r.price_usd,
        title: r.title,
      });
    }
  }
  return { count: items.length, items };
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    console.log(JSON.stringify(await run(process.argv.slice(2), prisma as unknown as ShopTx)));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e: unknown) => {
    console.error(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    process.exit(1);
  });
}
