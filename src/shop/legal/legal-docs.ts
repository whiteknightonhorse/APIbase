import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ShopTx } from '../db';

/** The four documents a merchant accepts (§11.1); terms/privacy are static pages, not registry docs here. */
export const LEGAL_DOC_IDS = ['merchant-agreement', 'aup', 'dpa', 'refund-framework'] as const;
export type LegalDocId = (typeof LEGAL_DOC_IDS)[number];

// Same runtime-read pattern as shop/moderation/countries.ts (tsc rootDir is src/).
export const LEGAL_DIR = resolve(__dirname, '../../../static/legal');
export const LEGAL_PUBLISHED_FILE = resolve(
  __dirname,
  '../../../config/integrator/legal-published.json',
);

/** Draft until the operator's committed `legal-published.json {published_at, by}` exists (07 V2). */
export function isLegalPublished(file: string = LEGAL_PUBLISHED_FILE): {
  published: boolean;
  published_at?: string;
} {
  if (!existsSync(file)) return { published: false };
  try {
    const j = JSON.parse(readFileSync(file, 'utf-8'));
    if (!!j && typeof j.published_at === 'string' && typeof j.by === 'string') {
      return { published: true, published_at: j.published_at };
    }
  } catch {
    // unreadable or invalid JSON counts as not published
  }
  return { published: false };
}

const HEADER_RE =
  /^<!-- version: ([0-9][0-9A-Za-z.]*); effective_from: (\d{4}-\d{2}-\d{2}); status: [^>]*-->(?:\r?\n|$)/;

export interface LegalFile {
  doc_id: LegalDocId;
  version: string;
  sha256: string;
  url: string;
  effective_from: string;
  body_md: string;
}

export const isLegalDocId = (s: string): s is LegalDocId =>
  (LEGAL_DOC_IDS as readonly string[]).includes(s);

/** Reads one `.md`; the hash is over the exact file bytes (token `{{INTEGRATOR_FEE_PCT}}` unsubstituted). */
export function readLegalFile(doc_id: LegalDocId, dir: string = LEGAL_DIR): LegalFile {
  const raw = readFileSync(resolve(dir, `${doc_id}.md`));
  const body_md = raw.toString('utf-8');
  const m = HEADER_RE.exec(body_md);
  if (!m) throw new Error(`legal doc ${doc_id}: first line must be the version header`);
  return {
    doc_id,
    version: m[1],
    sha256: createHash('sha256').update(raw).digest('hex'),
    url: `/legal/${doc_id}`,
    effective_from: new Date(`${m[2]}T00:00:00Z`).toISOString(),
    body_md,
  };
}

export const readAllLegalFiles = (dir: string = LEGAL_DIR): LegalFile[] =>
  LEGAL_DOC_IDS.map((id) => readLegalFile(id, dir));

export class LegalEffectiveFromError extends Error {
  constructor(
    readonly doc_id: string,
    readonly version: string,
  ) {
    super(
      `legal doc ${doc_id} v${version}: effective_from must be strictly later than every registered version`,
    );
    this.name = 'LegalEffectiveFromError';
  }
}

export class LegalDocChangedError extends Error {
  constructor(
    readonly doc_id: string,
    readonly version: string,
  ) {
    super(`legal doc ${doc_id} v${version}: text changed without a version change`);
    this.name = 'LegalDocChangedError';
  }
}

/**
 * Upsert the registry (append-only: a new version adds a row, old rows stay). A file whose
 * (doc_id, version) is already registered with a different sha256 is a silent edit of a
 * document merchants may have accepted — refuse (startup error).
 */
export async function syncLegalDocs(db: ShopTx, dir: string = LEGAL_DIR): Promise<LegalFile[]> {
  const files = readAllLegalFiles(dir);
  for (const f of files) {
    const rows = await db.$queryRawUnsafe<Array<{ sha256: string }>>(
      `SELECT sha256 FROM shop_legal_docs WHERE doc_id = $1 AND version = $2`,
      f.doc_id,
      f.version,
    );
    if (rows.length > 0) {
      if (rows[0].sha256.trim() !== f.sha256) throw new LegalDocChangedError(f.doc_id, f.version);
      continue;
    }
    // A later version must carry a strictly later effective_from (a tie makes "current" depend on
    // the version tie-break only); a same-day re-release needs the next day's date.
    const latest = await db.$queryRawUnsafe<Array<{ max_from: Date | string | null }>>(
      `SELECT max(effective_from) AS max_from FROM shop_legal_docs WHERE doc_id = $1`,
      f.doc_id,
    );
    const maxFrom = latest[0]?.max_from;
    if (maxFrom && Date.parse(f.effective_from) <= new Date(maxFrom).getTime()) {
      throw new LegalEffectiveFromError(f.doc_id, f.version);
    }
    await db.$executeRawUnsafe(
      `INSERT INTO shop_legal_docs (doc_id, version, sha256, url, effective_from, body_md)
       VALUES ($1, $2, $3, $4, $5::timestamptz, $6)`,
      f.doc_id,
      f.version,
      f.sha256,
      f.url,
      f.effective_from,
      f.body_md,
    );
  }
  return files;
}

export interface LegalIndexEntry {
  doc_id: string;
  version: string;
  sha256: string;
  url: string;
  effective_from: string;
}

/**
 * The one "current version" query: latest (effective_from <= now) row per doc_id; a tie on
 * effective_from resolves to the higher version. Every selector (index.json, terms guard) uses it.
 */
export async function latestLegalRows(
  db: ShopTx,
  ids: readonly string[],
  now: number = Date.now(),
): Promise<LegalIndexEntry[]> {
  const rows = await db.$queryRawUnsafe<
    Array<{
      doc_id: string;
      version: string;
      sha256: string;
      url: string;
      effective_from: Date | string;
    }>
  >(
    `SELECT DISTINCT ON (doc_id) doc_id, version, sha256, url, effective_from
       FROM shop_legal_docs
      WHERE doc_id = ANY($1::text[]) AND effective_from <= $2::timestamptz
      ORDER BY doc_id, effective_from DESC, version DESC`,
    [...ids],
    new Date(now).toISOString(),
  );
  return rows.map((r) => ({
    doc_id: r.doc_id,
    version: r.version,
    sha256: r.sha256.trim(),
    url: r.url,
    effective_from: new Date(r.effective_from).toISOString(),
  }));
}

/** Latest effective version of each of the four documents, in LEGAL_DOC_IDS order. */
export async function legalIndex(db: ShopTx, now: number = Date.now()): Promise<LegalIndexEntry[]> {
  const rows = await latestLegalRows(db, LEGAL_DOC_IDS, now);
  return LEGAL_DOC_IDS.flatMap((id) => rows.filter((x) => x.doc_id === id));
}
