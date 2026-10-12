import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { logger } from '../config/logger';
import { ensureRedisConnected } from '../services/redis.service';
import { review } from '../shop/catalog.service';
import type { ShopTx } from '../shop/db';
import type { ShopDeps } from '../shop/merchant-lifecycle.service';
import { defaultShopDeps } from '../shop/merchant-lifecycle.service';
import { moderateProduct } from '../shop/moderation/product-rules';

/**
 * F-13(1) layer 1 "on every catalog change": a change of the layer-1 rule files counts as a change
 * of every active product (T-0315 ruling). Runs hourly in the worker; does nothing unless the hash
 * of the four rule files differs from the stored one. A full pass restarts from scratch after a
 * failure (no cursor is stored); the hash is written only after the whole pass succeeded.
 */
const RULE_FILES = [
  'config/integrator/catalog-blocklist.json',
  'config/integrator/prohibited-categories.json',
  'config/integrator/catalog-confusables.json',
  'config/content-blocklist.json',
];
export const RULES_HASH_KEY = 'shop:moderation:rules_hash';
const BATCH = 500;

export function computeRulesHash(): string {
  const h = createHash('sha256');
  for (const f of RULE_FILES) h.update(readFileSync(resolve(__dirname, '../../', f)));
  return h.digest('hex');
}

export interface RulesHashStore {
  get(): Promise<string | null>;
  set(hash: string): Promise<void>;
}

export const redisHashStore: RulesHashStore = {
  get: async () => (await ensureRedisConnected()).get(RULES_HASH_KEY),
  set: async (hash) => void (await ensureRedisConnected()).set(RULES_HASH_KEY, hash),
};

interface Row {
  product_id: string;
  merchant_id: string;
  sku: string;
  title: string;
  description: string;
  category: string;
  moderation_status: 'ok' | 'flagged';
  tax_note: string | null;
  shipping_options: unknown;
  delivery_slots: unknown;
  stream: { content_ref?: unknown } | null;
}

const labels = (v: unknown): string[] =>
  Array.isArray(v)
    ? v
        .map((x) => (x as { label?: unknown } | null)?.label)
        .filter((l): l is string => typeof l === 'string')
    : [];

export interface RemoderateResult {
  skipped: boolean;
  scanned: number;
  rejected: number;
  flagged: number;
}

export async function run(
  d: ShopDeps = defaultShopDeps(),
  opts: { store?: RulesHashStore; batchSize?: number } = {},
): Promise<RemoderateResult> {
  const store = opts.store ?? redisHashStore;
  const batch = opts.batchSize ?? BATCH;
  const hash = computeRulesHash();
  const out: RemoderateResult = { skipped: true, scanned: 0, rejected: 0, flagged: 0 };
  if ((await store.get()) === hash) return out;
  out.skipped = false;

  let after = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const rows = await d.db.$queryRawUnsafe<Row[]>(
      `SELECT product_id, merchant_id, sku, title, description, category, moderation_status,
              tax_note, shipping_options, delivery_slots, stream
         FROM shop_products
        WHERE moderation_status IN ('ok', 'flagged') AND product_id > $1::uuid
        ORDER BY product_id LIMIT $2::int`,
      after,
      batch,
    );
    if (rows.length === 0) break;
    after = rows[rows.length - 1].product_id;
    const variants = await d.db.$queryRawUnsafe<
      Array<{ product_id: string; title: string; attributes: Record<string, unknown> | null }>
    >(
      `SELECT product_id, title, attributes FROM shop_product_variants WHERE product_id = ANY($1::uuid[])`,
      rows.map((r) => r.product_id),
    );
    const extra = new Map<string, string[]>();
    for (const v of variants) {
      const list = extra.get(v.product_id) ?? [];
      list.push(
        v.title,
        ...Object.entries(v.attributes ?? {})
          .flat()
          .filter((x): x is string => typeof x === 'string'),
      );
      extra.set(v.product_id, list);
    }

    await d.transaction(async (tx: ShopTx) => {
      const rejectedBy = new Map<
        string,
        Array<{ sku: string; category: string; sku_hash: string }>
      >();
      for (const r of rows) {
        const verdict = moderateProduct({
          sku: r.sku,
          title: r.title,
          description: r.description,
          category: r.category,
          extra_texts: [
            ...(extra.get(r.product_id) ?? []),
            ...labels(r.shipping_options),
            ...labels(r.delivery_slots),
            r.tax_note ?? '',
            typeof r.stream?.content_ref === 'string' ? r.stream.content_ref : '',
          ].filter(Boolean),
        });
        if (verdict.verdict === 'rejected') {
          await tx.$executeRawUnsafe(
            `UPDATE shop_products SET moderation_status = 'rejected', updated_at = now() WHERE product_id = $1::uuid`,
            r.product_id,
          );
          await review(
            tx,
            r.merchant_id,
            r.product_id,
            'reject',
            verdict.category,
            verdict.evidence_hash,
          );
          const list = rejectedBy.get(r.merchant_id) ?? [];
          list.push({
            sku: r.sku,
            category: verdict.category,
            sku_hash: createHash('sha256').update(r.sku).digest('hex'),
          });
          rejectedBy.set(r.merchant_id, list);
          out.rejected++;
        } else if (verdict.verdict === 'flagged' && r.moderation_status === 'ok') {
          await tx.$executeRawUnsafe(
            `UPDATE shop_products SET moderation_status = 'flagged', updated_at = now() WHERE product_id = $1::uuid`,
            r.product_id,
          );
          await review(tx, r.merchant_id, r.product_id, 'flag', r.category, verdict.evidence_hash);
          out.flagged++;
        }
        // ok -> ok, flagged -> flagged, flagged -> (rules clean): untouched; lifting is layer 3 / human.
      }
      // One event per merchant per batch: emitted in the batch's own transaction so a crash cannot lose it.
      for (const [merchant_id, rejected] of rejectedBy) {
        await tx.$executeRawUnsafe(
          `INSERT INTO outbox (event_type, payload) VALUES ($1, $2::jsonb)`,
          'shop.catalog.rejected',
          JSON.stringify({ merchant_id, rejected }),
        );
      }
    });
    out.scanned += rows.length;
  }

  await store.set(hash);
  logger.info(
    `catalog-remoderate: rules ${hash.slice(0, 8)}, scanned ${out.scanned}, rejected ${out.rejected}, flagged ${out.flagged}`,
  );
  return out;
}
