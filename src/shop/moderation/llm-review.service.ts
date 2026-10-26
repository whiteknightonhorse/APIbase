import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ShopTx } from '../db';

/**
 * F-13 layer 3 (T-INT-33): the nightly LLM catalog review. The model call lives in the nightly runner
 * scripts/moderation/layer3_review.py (T-0569); this side lists merchants due and records a validated verdict. Registration,
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
    moderation_status: string;
  }>;
}

/**
 * Merchants (pending|active) that owe a layer-3 look. Oldest first. A merchant is due when either
 * (a) it has no `llm` merchant-scope review in the last 24 h and nothing reviewed since its
 * registration or latest catalog change, or (b) at least one of its listed products has no
 * llm/human product-scope review since that product's `updated_at`. A merchant with a human
 * merchant-scope review newer than its latest change is never due (a person already decided).
 */
export async function listPending(db: ShopTx): Promise<PendingMerchant[]> {
  const rows = await db.$queryRawUnsafe<Array<Omit<PendingMerchant, 'products'>>>(
    `SELECT m.merchant_id::text, m.name, m.category, m.country, m.site_url
       FROM shop_merchants m
      WHERE m.status IN ('pending', 'active')
        AND (
          (NOT EXISTS (SELECT 1 FROM shop_moderation_reviews r
                        WHERE r.merchant_id = m.merchant_id AND r.layer = 'llm' AND r.scope = 'merchant'
                          AND r.at > now() - interval '24 hours')
           AND COALESCE((SELECT max(r.at) FROM shop_moderation_reviews r
                          WHERE r.merchant_id = m.merchant_id AND r.layer = 'llm' AND r.scope = 'merchant'),
                        '-infinity'::timestamptz)
               < GREATEST(m.created_at, COALESCE((SELECT max(p.updated_at) FROM shop_products p
                                                   WHERE p.merchant_id = m.merchant_id), m.created_at)))
          OR EXISTS (SELECT 1 FROM shop_products p
                      WHERE p.merchant_id = m.merchant_id AND p.moderation_status <> 'rejected'
                        AND NOT EXISTS (SELECT 1 FROM shop_moderation_reviews r
                                         WHERE r.product_id = p.product_id AND r.scope = 'product'
                                           AND r.layer IN ('llm', 'human') AND r.at >= p.updated_at))
        )
        AND NOT EXISTS (SELECT 1 FROM shop_moderation_reviews r
                         WHERE r.merchant_id = m.merchant_id AND r.layer = 'human' AND r.scope = 'merchant'
                           AND r.at > GREATEST(m.created_at, COALESCE((SELECT max(p.updated_at) FROM shop_products p
                                                                        WHERE p.merchant_id = m.merchant_id), m.created_at)))
      ORDER BY m.created_at
      LIMIT ${PENDING_LIMIT}`,
  );
  const out: PendingMerchant[] = [];
  for (const m of rows) {
    // Items never looked at since their last change come first, so a catalog larger than the page
    // is covered over successive nights instead of re-reading the same ten.
    const products = await db.$queryRawUnsafe<PendingMerchant['products']>(
      `SELECT p.product_id::text, p.title, p.description, p.category, p.price_usd::text, p.moderation_status
         FROM shop_products p
         LEFT JOIN LATERAL (SELECT max(r.at) AS at FROM shop_moderation_reviews r
                             WHERE r.product_id = p.product_id AND r.scope = 'product'
                               AND r.layer IN ('llm', 'human') AND r.at >= p.updated_at) lr ON true
        WHERE p.merchant_id = $1::uuid AND p.moderation_status <> 'rejected'
        ORDER BY lr.at NULLS FIRST, p.updated_at DESC
        LIMIT ${PRODUCTS_PER_MERCHANT}`,
      m.merchant_id,
    );
    out.push({ ...m, products });
  }
  return out;
}

export interface VerdictInput {
  layer: 'llm' | 'human';
  merchantId: string;
  productId: string | null;
  verdict: ParsedVerdict;
  evidenceHash: string | null;
}

/**
 * The one write path for a layer-3 (llm) or human verdict: the review row plus its effect.
 * `flag` writes the row only (incident-engine opens MODERATION_FLAG). `reject` suspends the merchant
 * / rejects the product (engine opens CATALOG_REJECTED and queues the merchant mail, which names the
 * category and never the rules). Product `ok` releases `flagged` -> `ok` without touching
 * `updated_at` (that would put the merchant back in the queue); only a human lifts `rejected`.
 */
export async function applyVerdict(
  tx: ShopTx,
  a: VerdictInput,
): Promise<{ scope: 'merchant' | 'product'; verdict: string; category: string | null }> {
  const { layer, merchantId, productId: pid, verdict: parsed } = a;
  const scope = pid ? 'product' : 'merchant';

  const m = await tx.$queryRawUnsafe<Array<{ status: string }>>(
    `SELECT status FROM shop_merchants WHERE merchant_id = $1::uuid`,
    merchantId,
  );
  if (!m[0]) throw new LlmReviewError(404, 'not_found', 'merchant not found');
  if (pid) {
    const p = await tx.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM shop_products WHERE product_id = $1::uuid AND merchant_id = $2::uuid`,
      pid,
      merchantId,
    );
    if (p.length === 0) throw new LlmReviewError(404, 'not_found', 'product not found');
  }

  await tx.$executeRawUnsafe(
    `INSERT INTO shop_moderation_reviews (merchant_id, scope, product_id, layer, verdict, category, evidence_hash, content_hash)
     VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7,
             (SELECT content_hash FROM shop_products WHERE product_id = $3::uuid))`,
    merchantId,
    scope,
    pid,
    layer,
    parsed.verdict,
    parsed.category,
    a.evidenceHash,
  );

  if (parsed.verdict === 'reject') {
    if (pid) {
      await tx.$executeRawUnsafe(
        `UPDATE shop_products SET moderation_status = 'rejected', updated_at = now()
          WHERE product_id = $1::uuid AND merchant_id = $2::uuid`,
        pid,
        merchantId,
      );
    } else {
      await tx.$executeRawUnsafe(
        `UPDATE shop_merchants SET status = 'suspended', status_reason = $2
          WHERE merchant_id = $1::uuid AND status IN ('pending', 'active')`,
        merchantId,
        layer === 'human' ? 'catalog_rejected_human' : 'catalog_rejected_llm',
      );
    }
  } else if (parsed.verdict === 'ok' && pid) {
    await tx.$executeRawUnsafe(
      `UPDATE shop_products SET moderation_status = 'ok', updated_at = updated_at
        WHERE product_id = $1::uuid AND merchant_id = $2::uuid
          AND (moderation_status = 'flagged' OR ($3 AND moderation_status = 'rejected'))`,
      pid,
      merchantId,
      layer === 'human',
    );
  }
  return { scope, verdict: parsed.verdict, category: parsed.category };
}

/** Validates a layer-3 `/result` body and records it (layer `llm`). */
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

  return applyVerdict(tx, {
    layer: 'llm',
    merchantId: merchant_id,
    productId: typeof product_id === 'string' ? product_id : null,
    verdict: parsed,
    evidenceHash: typeof evidence_hash === 'string' ? evidence_hash.toLowerCase() : null,
  });
}
