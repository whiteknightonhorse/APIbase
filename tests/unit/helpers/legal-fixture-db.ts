import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LEGAL_DIR, LEGAL_DOC_IDS } from '../../../src/shop/legal/legal-docs';

export interface FixtureRow {
  doc_id: string;
  version: string;
  effective_from: string;
  body_md: string;
}

/** Registry rows mirroring the files on disk (what syncLegalDocs would have registered). */
export function diskRows(dir: string = LEGAL_DIR): FixtureRow[] {
  return LEGAL_DOC_IDS.map((id) => {
    const body_md = readFileSync(join(dir, `${id}.md`), 'utf-8');
    const m = /^<!-- version: (\S+?); effective_from: (\d{4}-\d{2}-\d{2});/.exec(body_md)!;
    return { doc_id: id, version: m[1], effective_from: `${m[2]}T00:00:00.000Z`, body_md };
  });
}

/** A shop_legal_docs stub: answers latest / next / source queries from `rows`. */
export function fixtureDb(rows: FixtureRow[] = diskRows()) {
  const full = (r: FixtureRow) => ({
    ...r,
    sha256: createHash('sha256').update(Buffer.from(r.body_md, 'utf-8')).digest('hex'),
    url: `/legal/${r.doc_id}`,
  });
  return {
    $queryRawUnsafe: async (sql: string, ...args: unknown[]) => {
      const all = rows.map(full);
      if (/DISTINCT ON/.test(sql)) {
        const ids = args[0] as string[];
        const now = Date.parse(args[1] as string);
        const next = /effective_from >/.test(sql);
        const pick = (id: string) => {
          const c = all
            .filter((r) => r.doc_id === id)
            .filter((r) =>
              next ? Date.parse(r.effective_from) > now : Date.parse(r.effective_from) <= now,
            )
            .sort((a, b) => Date.parse(a.effective_from) - Date.parse(b.effective_from));
          return next ? c[0] : c[c.length - 1];
        };
        return ids.map(pick).filter(Boolean);
      }
      if (/version = \$2/.test(sql)) {
        return all.filter((r) => r.doc_id === args[0] && r.version === args[1]).slice(0, 1);
      }
      const now = Date.parse(args[1] as string);
      return all
        .filter((r) => r.doc_id === args[0] && Date.parse(r.effective_from) <= now)
        .sort((a, b) => Date.parse(b.effective_from) - Date.parse(a.effective_from))
        .slice(0, 1);
    },
  } as never;
}
