import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
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

/** Latest effective version of each of the four documents, in LEGAL_DOC_IDS order. */
export async function legalIndex(db: ShopTx, now: number = Date.now()): Promise<LegalIndexEntry[]> {
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
    [...LEGAL_DOC_IDS],
    new Date(now).toISOString(),
  );
  return LEGAL_DOC_IDS.flatMap((id) => {
    const r = rows.find((x) => x.doc_id === id);
    return r
      ? [
          {
            doc_id: r.doc_id,
            version: r.version,
            sha256: r.sha256.trim(),
            url: r.url,
            effective_from: new Date(r.effective_from).toISOString(),
          },
        ]
      : [];
  });
}
