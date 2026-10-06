import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ShopTx } from '../db';

/**
 * F-13 layer 3 (T-INT-33): the nightly LLM catalog review. The model call lives in the private
 * orchestra tree; this side only lists what is due and records a validated verdict. Registration,
 * `check` and quotes never read these rows, so a paused or dead orchestra leaves merchants `active`.
 */

interface CategoriesFile {
  prohibited: Array<{ slug: string }>;
}

const PROHIBITED: ReadonlySet<string> = new Set(
  (
    JSON.parse(
      readFileSync(
        resolve(__dirname, '../../../config/integrator/prohibited-categories.json'),
        'utf-8',
      ),
    ) as CategoriesFile
  ).prohibited.map((p) => p.slug),
);

export class LlmReviewError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface ResultInput {
  merchant_id?: unknown;
  product_id?: unknown;
  verdict?: unknown;
  category?: unknown;
  evidence_hash?: unknown;
}

export interface ParsedVerdict {
  verdict: 'ok' | 'flag' | 'reject';
  category: string | null;
}

/** Strict `ok|flag:<cat>|reject:<cat>`; `cat` must be a prohibited-category slug. */
export function parseVerdict(raw: unknown): ParsedVerdict | null {
  if (typeof raw !== 'string') return null;
  if (raw === 'ok') return { verdict: 'ok', category: null };
  const m = /^(flag|reject):([a-z0-9-]+)$/.exec(raw);
  if (!m || !PROHIBITED.has(m[2])) return null;
  return { verdict: m[1] as 'flag' | 'reject', category: m[2] };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH_RE = /^[0-9a-f]{64}$/i;
const bad = (message: string) => new LlmReviewError(400, 'invalid_request', message);

export const PENDING_LIMIT = 20;
export const PRODUCTS_PER_MERCHANT = 10;

export interface PendingMerchant {
  merchant_id: string;
  name: string;
  category: string;
  country: string;
  site_url: string;
  products: Array<{
    product_id: string;
    title: string;
    description: string;
    category: string | null;
    price_usd: string;
  }>;
}

/**
 * Merchants (pending|active) with no `llm` merchant-scope review in the last 24 h and nothing
 * reviewed since their registration or latest catalog change. Oldest first.
 */
export async function listPending(db: ShopTx): Promise<PendingMerchant[]> {
  const rows = await db.$queryRawUnsafe<Array<Omit<PendingMerchant, 'products'>>>(
    `SELECT m.merchant_id::text, m.name, m.category, m.country, m.site_url
       FROM shop_merchants m
      WHERE m.status IN ('pending', 'active')
        AND NOT EXISTS (SELECT 1 FROM shop_moderation_reviews r
                         WHERE r.merchant_id = m.merchant_id AND r.layer = 'llm' AND r.scope = 'merchant'
                           AND r.at > now() - interval '24 hours')
        AND COALESCE((SELECT max(r.at) FROM shop_moderation_reviews r
                       WHERE r.merchant_id = m.merchant_id AND r.layer = 'llm' AND r.scope = 'merchant'),
                     '-infinity'::timestamptz)
            < GREATEST(m.created_at, COALESCE((SELECT max(p.updated_at) FROM shop_products p
                                                WHERE p.merchant_id = m.merchant_id), m.created_at))
      ORDER BY m.created_at
      LIMIT ${PENDING_LIMIT}`,
  );
  const out: PendingMerchant[] = [];
  for (const m of rows) {
    const products = await db.$queryRawUnsafe<PendingMerchant['products']>(
      `SELECT product_id::text, title, description, category, price_usd::text
         FROM shop_products
        WHERE merchant_id = $1::uuid AND moderation_status <> 'rejected'
        ORDER BY updated_at DESC
        LIMIT ${PRODUCTS_PER_MERCHANT}`,
      m.merchant_id,
    );
    out.push({ ...m, products });
  }
  return out;
}

/**
 * Records one layer-3 verdict. `flag` writes the review row only (incident-engine opens
 * MODERATION_FLAG); `reject` suspends the merchant / rejects the product (engine opens
 * CATALOG_REJECTED and queues the merchant mail, which names the category and never the rules).
 */
export async function recordResult(
  tx: ShopTx,
  input: ResultInput,
): Promise<{ scope: 'merchant' | 'product'; verdict: string; category: string | null }> {
  const parsed = parseVerdict(input.verdict);
  if (!parsed) throw bad('verdict must be ok, flag:<category> or reject:<category>');
  const { merchant_id, product_id, evidence_hash } = input;
  if (typeof merchant_id !== 'string' || !UUID_RE.test(merchant_id))
    throw bad('merchant_id must be a uuid');
  if (product_id !== undefined && product_id !== null) {
    if (typeof product_id !== 'string' || !UUID_RE.test(product_id))
      throw bad('product_id must be a uuid');
  }
  if (evidence_hash !== undefined && evidence_hash !== null) {
    if (typeof evidence_hash !== 'string' || !HASH_RE.test(evidence_hash))
      throw bad('evidence_hash must be a sha-256 hex digest');
  }
  if (input.category !== undefined && input.category !== null && input.category !== parsed.category)
    throw bad('category does not match the verdict');

  const pid = typeof product_id === 'string' ? product_id : null;
  const scope = pid ? 'product' : 'merchant';

  const m = await tx.$queryRawUnsafe<Array<{ status: string }>>(
    `SELECT status FROM shop_merchants WHERE merchant_id = $1::uuid`,
    merchant_id,
  );
  if (!m[0]) throw new LlmReviewError(404, 'not_found', 'merchant not found');
  if (pid) {
    const p = await tx.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM shop_products WHERE product_id = $1::uuid AND merchant_id = $2::uuid`,
      pid,
      merchant_id,
    );
    if (p.length === 0) throw new LlmReviewError(404, 'not_found', 'product not found');
  }

  await tx.$executeRawUnsafe(
    `INSERT INTO shop_moderation_reviews (merchant_id, scope, product_id, layer, verdict, category, evidence_hash)
     VALUES ($1::uuid, $2, $3::uuid, 'llm', $4, $5, $6)`,
    merchant_id,
    scope,
    pid,
    parsed.verdict,
    parsed.category,
    typeof evidence_hash === 'string' ? evidence_hash.toLowerCase() : null,
  );

  if (parsed.verdict === 'reject') {
    if (pid) {
      await tx.$executeRawUnsafe(
        `UPDATE shop_products SET moderation_status = 'rejected', updated_at = now()
          WHERE product_id = $1::uuid AND merchant_id = $2::uuid`,
        pid,
        merchant_id,
      );
    } else {
      await tx.$executeRawUnsafe(
        `UPDATE shop_merchants SET status = 'suspended', status_reason = 'catalog_rejected_llm'
          WHERE merchant_id = $1::uuid AND status IN ('pending', 'active')`,
        merchant_id,
      );
    }
  }
  return { scope, verdict: parsed.verdict, category: parsed.category };
}
