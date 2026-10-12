/**
 * T-0313: a human catalog verdict, written through the same code as the layer-3 (llm) review.
 *
 *   DATABASE_URL=... npx tsx scripts/shop/moderation-human.ts --merchant <uuid> [--product <uuid>]
 *       --verdict ok|reject:<slug> --note "<text>" [--apply]
 *
 * Without --apply nothing is written: the script prints what it would do. With --apply it inserts
 * one `shop_moderation_reviews` row (layer `human`, evidence_hash = sha256(note)) and applies the
 * effect: product reject -> `rejected`; merchant reject -> `suspended` (`catalog_rejected_human`);
 * product ok -> `flagged`/`rejected` -> `ok`; merchant ok -> the row only (the nightly queue skips
 * the merchant until its catalog changes). Output is one JSON line.
 */
import { createHash } from 'node:crypto';
import type { ShopTx } from '../../src/shop/db';
import { applyVerdict, parseVerdict } from '../../src/shop/moderation/llm-review.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface HumanTx extends ShopTx {
  $transaction<T>(fn: (tx: ShopTx) => Promise<T>): Promise<T>;
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (['--merchant', '--product', '--verdict', '--note'].includes(a)) {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      out[a.slice(2)] = v;
    } else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

/** Returns the JSON-serialisable result; throws on bad input. */
export async function run(argv: string[], db: HumanTx): Promise<Record<string, unknown>> {
  const args = parseArgs(argv);
  const merchant = args.merchant;
  const product = args.product;
  const note = args.note;
  if (typeof merchant !== 'string' || !UUID_RE.test(merchant))
    throw new Error('--merchant must be a uuid');
  if (product !== undefined && (typeof product !== 'string' || !UUID_RE.test(product)))
    throw new Error('--product must be a uuid');
  const verdict = parseVerdict(args.verdict);
  if (!verdict || verdict.verdict === 'flag')
    throw new Error('--verdict must be ok or reject:<category>');
  if (typeof note !== 'string' || note.trim() === '') throw new Error('--note is required');

  const plan = {
    layer: 'human',
    scope: product ? 'product' : 'merchant',
    merchant_id: merchant,
    product_id: product ?? null,
    verdict: verdict.verdict,
    category: verdict.category,
    evidence_hash: createHash('sha256').update(note).digest('hex'),
  };
  if (args.apply !== true) {
    const m = await db.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM shop_merchants WHERE merchant_id = $1::uuid`,
      merchant,
    );
    if (m.length === 0) throw new Error('merchant not found');
    if (product) {
      const p = await db.$queryRawUnsafe<unknown[]>(
        `SELECT 1 FROM shop_products WHERE product_id = $1::uuid AND merchant_id = $2::uuid`,
        product,
        merchant,
      );
      if (p.length === 0) throw new Error('product not found');
    }
    return { dry_run: true, would_apply: plan };
  }
  await db.$transaction((tx) =>
    applyVerdict(tx, {
      layer: 'human',
      merchantId: merchant,
      productId: product ?? null,
      verdict,
      evidenceHash: plan.evidence_hash,
    }),
  );
  return { dry_run: false, applied: plan };
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    console.log(JSON.stringify(await run(process.argv.slice(2), prisma as unknown as HumanTx)));
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
