import { logger } from '../../config/logger';
import { ShopAuthError } from '../auth/errors';
import { ShopGateError } from '../auth/terms.guard';
import { CatalogError } from '../catalog.errors';
import { MAX_ITEMS_PER_CALL, upsertCatalog, type CatalogReport } from '../catalog.service';
import type { ShopDeps } from '../merchant-lifecycle.service';
import { defaultResolver, resolvePublicTarget, WebhookUrlError } from '../webhook/ssrf';
import { fetchFeed, FeedError, MAX_FEED_BYTES, type FetchDeps } from './feed-fetch';
import { parseCsv, parseGmc, parseShopify, type Parsed } from './parsers';

const IMPORT_SOURCES = ['csv', 'gmc', 'shopify'] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];
/** UC-11: one import per merchant per 10 minutes. */
const IMPORT_COOLDOWN_S = 600;
/** The stored report lists at most this many rejected rows; `rejected_count` is exact. */
const MAX_REPORTED_REJECTS = 1000;
const SHOPIFY_PAGE = 250;
const SHOPIFY_MAX_PAGES = 20;
const STALE_RUNNING_S = 900;
const DOC_URL = '/docs/integrator#catalog';

export interface ImportReport {
  import_job_id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  total: number;
  upserted: number;
  rejected: Array<{ sku: string; reason: string }>;
  rejected_count: number;
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

const bad = (message: string) =>
  new CatalogError(400, 'invalid_import_source', message, 'fix_request', {
    documentation_url: DOC_URL,
  });

export type CreateDeps = Pick<FetchDeps, 'resolve'>;

/** POST /merchants/me/catalog/import: validate, enforce the 10-minute limit, queue the job. */
export async function createImport(
  d: ShopDeps,
  merchant_id: string,
  input: unknown,
  deps: CreateDeps = {},
): Promise<{ import_job_id: string; status: 'queued' }> {
  const i = (input ?? {}) as Record<string, unknown>;
  const source = i.source as ImportSource;
  if (!IMPORT_SOURCES.includes(source)) throw bad('source must be one of csv, gmc, shopify');
  const defaultCategory = i.category === undefined ? null : i.category;
  if (
    defaultCategory !== null &&
    (typeof defaultCategory !== 'string' || defaultCategory.length > 64)
  ) {
    throw bad('category must be a string of at most 64 characters');
  }
  let url: string | null = null;
  let body: string | null = null;
  if (source === 'csv' && i.url === undefined) {
    if (typeof i.body !== 'string' || i.body.trim() === '') throw bad('csv needs a body or a url');
    if (Buffer.byteLength(i.body) > MAX_FEED_BYTES) throw bad('body is larger than 10 MB');
    body = i.body;
  } else {
    if (typeof i.url !== 'string') throw bad(`${source} needs a url`);
    if (i.body !== undefined) throw bad('give either url or body, not both');
    try {
      await resolvePublicTarget(i.url, deps.resolve ?? defaultResolver);
    } catch (err) {
      if (err instanceof WebhookUrlError) throw bad(err.message);
      throw err;
    }
    url = i.url;
  }

  return d.transaction(async (tx) => {
    // The lock makes check-then-insert atomic per merchant.
    await tx.$executeRawUnsafe(
      `SELECT pg_advisory_xact_lock(hashtext('catalog-import:' || $1))`,
      merchant_id,
    );
    const recent = await tx.$queryRawUnsafe<Array<{ wait_s: number }>>(
      `SELECT ceil(extract(epoch FROM (max(created_at) + ($2::int * interval '1 second') - now())))::int AS wait_s
         FROM shop_catalog_imports
        WHERE merchant_id = $1::uuid AND created_at > now() - ($2::int * interval '1 second')
       HAVING count(*) > 0`,
      merchant_id,
      IMPORT_COOLDOWN_S,
    );
    if (recent.length > 0) {
      throw new ShopAuthError(
        429,
        `one catalog import per ${IMPORT_COOLDOWN_S / 60} minutes; try again in ${recent[0].wait_s} s`,
        'retry_after_delay',
      );
    }
    const rows = await tx.$queryRawUnsafe<Array<{ import_job_id: string }>>(
      `INSERT INTO shop_catalog_imports (merchant_id, source, url, body, default_category)
       VALUES ($1::uuid, $2, $3, $4, $5) RETURNING import_job_id`,
      merchant_id,
      source,
      url,
      body,
      defaultCategory,
    );
    return { import_job_id: rows[0].import_job_id, status: 'queued' as const };
  });
}

/** GET /merchants/me/catalog/import/:id (only the owner's job is visible). */
export async function getImport(
  d: ShopDeps,
  merchant_id: string,
  import_job_id: string,
): Promise<ImportReport> {
  const found = /^[0-9a-f-]{36}$/i.test(import_job_id)
    ? await d.db.$queryRawUnsafe<
        Array<
          Omit<ImportReport, 'created_at' | 'finished_at'> & {
            created_at: Date;
            finished_at: Date | null;
          }
        >
      >(
        `SELECT import_job_id, status, total, upserted, rejected, rejected_count, error, created_at, finished_at
           FROM shop_catalog_imports WHERE import_job_id = $1::uuid AND merchant_id = $2::uuid`,
        import_job_id,
        merchant_id,
      )
    : [];
  if (!found[0]) throw new CatalogError(404, 'not_found', 'no such import', 'fix_request');
  const r = found[0];
  return {
    ...r,
    created_at: r.created_at.toISOString(),
    finished_at: r.finished_at ? r.finished_at.toISOString() : null,
  };
}

interface Job {
  import_job_id: string;
  merchant_id: string;
  source: ImportSource;
  url: string | null;
  body: string | null;
  default_category: string | null;
}

export interface RunDeps extends FetchDeps {
  upsert?: (merchant_id: string, items: unknown[]) => Promise<CatalogReport>;
}

async function load(job: Job, deps: FetchDeps): Promise<Parsed> {
  const cat = job.default_category ?? undefined;
  if (job.body !== null) return parseCsv(job.body, cat);
  const url = job.url as string;
  if (job.source === 'shopify') {
    const base = new URL(url);
    const pages: unknown[] = [];
    let budget = MAX_FEED_BYTES;
    for (let page = 1; page <= SHOPIFY_MAX_PAGES; page++) {
      const u = /products\.json$/.test(base.pathname)
        ? new URL(base)
        : new URL('/products.json', base);
      u.searchParams.set('limit', String(SHOPIFY_PAGE));
      u.searchParams.set('page', String(page));
      const buf = await fetchFeed(u.toString(), deps, budget);
      budget -= buf.length;
      let json: { products?: unknown[] };
      try {
        json = JSON.parse(buf.toString('utf8'));
      } catch {
        throw new FeedError('Shopify response is not JSON');
      }
      pages.push(json);
      if (!Array.isArray(json.products) || json.products.length < SHOPIFY_PAGE) break;
    }
    return parseShopify(pages, cat);
  }
  const buf = await fetchFeed(url, deps);
  const text = buf.toString('utf8');
  return job.source === 'gmc' ? parseGmc(text, cat) : parseCsv(text, cat);
}

/** Batches of at most 500 go through the INT-06 `upsertCatalog` (layer-1 moderation included). */
async function execute(d: ShopDeps, job: Job, deps: RunDeps) {
  const parsed = await load(job, deps);
  const upsert = deps.upsert ?? ((m, items) => upsertCatalog(d, m, items));
  const rejected = [...parsed.rejected];
  let upserted = 0;
  for (let at = 0; at < parsed.items.length; at += MAX_ITEMS_PER_CALL) {
    const batch = parsed.items.slice(at, at + MAX_ITEMS_PER_CALL);
    const r = await upsert(job.merchant_id, batch);
    upserted += r.upserted;
    for (const x of r.rejected) rejected.push({ sku: x.sku, reason: x.reason });
    for (const e of r.errors) {
      rejected.push({ sku: e.sku ?? `item ${at + e.index + 1}`, reason: e.message });
    }
  }
  return { total: parsed.items.length + parsed.rejected.length, upserted, rejected };
}

const SAFE_ERRORS = [FeedError, WebhookUrlError, CatalogError, ShopGateError, ShopAuthError];

export async function runImportJob(d: ShopDeps, job: Job, deps: RunDeps = {}): Promise<void> {
  try {
    const r = await execute(d, job, deps);
    await d.db.$executeRawUnsafe(
      `UPDATE shop_catalog_imports SET status = 'done', total = $2, upserted = $3, rejected = $4::jsonb,
              rejected_count = $5, body = NULL, finished_at = now()
        WHERE import_job_id = $1::uuid`,
      job.import_job_id,
      r.total,
      r.upserted,
      JSON.stringify(r.rejected.slice(0, MAX_REPORTED_REJECTS)),
      r.rejected.length,
    );
  } catch (err) {
    const known = SAFE_ERRORS.some((c) => err instanceof c);
    if (!known) logger.error({ err, job: 'shop-catalog-import' }, 'catalog import failed');
    await d.db.$executeRawUnsafe(
      `UPDATE shop_catalog_imports SET status = 'failed', error = $2, body = NULL, finished_at = now()
        WHERE import_job_id = $1::uuid`,
      job.import_job_id,
      known ? (err as Error).message.slice(0, 500) : 'internal error',
    );
  }
}

/** Worker tick: fail jobs a dead worker left `running`, then claim and run the queued ones. */
export async function runShopCatalogImport(
  d: ShopDeps,
  deps: RunDeps = {},
  limit = 5,
): Promise<number> {
  await d.db.$executeRawUnsafe(
    `UPDATE shop_catalog_imports SET status = 'failed', error = 'worker interrupted', body = NULL, finished_at = now()
      WHERE status = 'running' AND started_at < now() - ($1::int * interval '1 second')`,
    STALE_RUNNING_S,
  );
  const jobs = await d.db.$queryRawUnsafe<Job[]>(
    `UPDATE shop_catalog_imports SET status = 'running', started_at = now()
      WHERE import_job_id IN (
        SELECT import_job_id FROM shop_catalog_imports WHERE status = 'queued'
         ORDER BY created_at LIMIT $1::int FOR UPDATE SKIP LOCKED)
      RETURNING import_job_id, merchant_id, source, url, body, default_category`,
    limit,
  );
  for (const job of jobs) await runImportJob(d, job, deps);
  return jobs.length;
}
