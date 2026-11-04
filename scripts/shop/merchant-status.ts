/**
 * T-0707: an operator lifts a merchant's `status_reason` (unresponsive | disputes) with an audit event.
 *
 *   DATABASE_URL=... npx tsx scripts/shop/merchant-status.ts --slug <slug>
 *       --clear-reason <unresponsive|disputes> --actor <name> --note "<text>"
 *
 * One transaction: `status_reason = NULL`, `status_reason_cleared_at = now()` (only while the merchant
 * still carries that reason), plus one outbox event `shop.merchant.reason_cleared`. After a lift the
 * two automatic flags count only orders settled after `status_reason_cleared_at`, so the lift holds.
 * Other reasons (fee, sanctions, ...) have their own lifecycles and are refused.
 * Exit 0 on a lift; exit 2 when the merchant does not carry that reason (current status printed).
 */
import type { ShopTx } from '../../src/shop/db';

export const LIFTABLE = ['unresponsive', 'disputes'] as const;

export interface StatusTx extends ShopTx {
  $transaction<T>(fn: (tx: ShopTx) => Promise<T>): Promise<T>;
}

export interface StatusResult {
  exitCode: 0 | 2;
  output: Record<string, unknown>;
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (['--slug', '--clear-reason', '--actor', '--note'].includes(a)) {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      out[a.slice(2)] = v;
    } else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

/** Throws on bad input; returns the exit code and the JSON-serialisable line. */
export async function run(argv: string[], db: StatusTx): Promise<StatusResult> {
  const args = parseArgs(argv);
  const slug = args.slug;
  const reason = args['clear-reason'];
  const actor = args.actor;
  const note = args.note;
  if (typeof slug !== 'string' || slug.trim() === '') throw new Error('--slug is required');
  if (typeof reason !== 'string' || !(LIFTABLE as readonly string[]).includes(reason))
    throw new Error(`--clear-reason must be one of: ${LIFTABLE.join(', ')}`);
  if (typeof actor !== 'string' || actor.trim() === '') throw new Error('--actor is required');
  if (typeof note !== 'string' || note.trim() === '') throw new Error('--note is required');

  return db.$transaction(async (tx): Promise<StatusResult> => {
    const rows = await tx.$queryRawUnsafe<Array<{ merchant_id: string; cleared_at: Date }>>(
      `UPDATE shop_merchants SET status_reason = NULL, status_reason_cleared_at = now()
        WHERE slug = $1 AND status_reason = $2
        RETURNING merchant_id, status_reason_cleared_at AS cleared_at`,
      slug,
      reason,
    );
    if (rows.length === 0) {
      const cur = await tx.$queryRawUnsafe<Array<{ status: string; status_reason: string | null }>>(
        `SELECT status, status_reason FROM shop_merchants WHERE slug = $1`,
        slug,
      );
      return {
        exitCode: 2,
        output: cur[0]
          ? { slug, status: cur[0].status, status_reason: cur[0].status_reason }
          : { slug, error: 'merchant not found' },
      };
    }
    const { merchant_id, cleared_at } = rows[0];
    const clearedIso = new Date(cleared_at).toISOString();
    await tx.$executeRawUnsafe(
      `INSERT INTO outbox (event_type, payload) VALUES ('shop.merchant.reason_cleared', $1::jsonb)`,
      JSON.stringify({ merchant_id, slug, reason, actor, note, cleared_at: clearedIso }),
    );
    return { exitCode: 0, output: { slug, old_reason: reason, cleared_at: clearedIso } };
  });
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const r = await run(process.argv.slice(2), prisma as unknown as StatusTx);
    console.log(JSON.stringify(r.output));
    process.exitCode = r.exitCode;
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
