/** T-0369 TB1-TB2: "current legal version" with equal effective_from, against real Postgres (TEST_DATABASE_URL). */
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ShopTx } from '../../src/shop/db';
import {
  LEGAL_DIR,
  LEGAL_DOC_IDS,
  type LegalIndexEntry,
  LegalEffectiveFromError,
  legalIndex,
  syncLegalDocs,
} from '../../src/shop/legal/legal-docs';
import { currentDocs } from '../../src/shop/auth/terms.guard';
import { client, dbDescribe, migrate } from './helpers/shop-db';

jest.mock('../../src/config', () => ({ config: {} }));

dbDescribe('legal current version tie-break on real Postgres (T-0369)', () => {
  const db = client();
  const tx = db as unknown as ShopTx;
  const same = '2026-10-12T00:00:00Z';
  const NOW = Date.parse('2026-10-28T00:00:00Z');

  const insert = (doc_id: string, version: string, effective_from: string) =>
    db.$executeRawUnsafe(
      `INSERT INTO shop_legal_docs (doc_id, version, sha256, url, effective_from, body_md)
       VALUES ($1, $2, $3, $4, $5::timestamptz, 'x')`,
      doc_id,
      version,
      `${doc_id}-${version}`.padEnd(64, '0'),
      `/legal/${doc_id}`,
      effective_from,
    );
  const strip = (r: LegalIndexEntry[]) =>
    r.map(({ doc_id, version, sha256, url }) => ({ doc_id, version, sha256, url }));

  beforeAll(() => migrate());
  beforeEach(() => db.$executeRawUnsafe(`DELETE FROM shop_legal_docs`));
  afterAll(async () => {
    await db.$executeRawUnsafe(`DELETE FROM shop_legal_docs`);
    await db.$disconnect();
  });

  it('TB1 v1.2 then v1.3 with identical effective_from: both selectors return 1.3 and agree', async () => {
    for (const v of ['1.2', '1.3']) for (const id of LEGAL_DOC_IDS) await insert(id, v, same);
    const cur = await currentDocs(tx, NOW);
    const idx = await legalIndex(tx, NOW);
    expect(cur.map((d) => d.version)).toEqual(['1.3', '1.3', '1.3', '1.3']);
    expect(idx.map((d) => d.version)).toEqual(['1.3', '1.3', '1.3', '1.3']);
    expect(strip(cur)).toEqual(strip(idx));
  });

  it('TB2 bumped version with an equal date is rejected and inserts nothing; a later date registers', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'legal-tie-'));
    for (const id of LEGAL_DOC_IDS)
      copyFileSync(join(LEGAL_DIR, `${id}.md`), join(dir, `${id}.md`));
    await syncLegalDocs(tx, dir);
    const before = await db.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT count(*) AS n FROM shop_legal_docs`,
    );
    const aup = join(dir, 'aup.md');
    // Derive the bump from the shipped header so a legal release does not break this test.
    const head = /<!-- version: (\d+)\.(\d+); effective_from: (\d{4}-\d{2}-\d{2})/.exec(
      readFileSync(aup, 'utf-8'),
    )!;
    const nextVersion = `${head[1]}.${Number(head[2]) + 1}`;
    const laterDate = new Date(Date.parse(`${head[3]}T00:00:00Z`) + 86_400_000)
      .toISOString()
      .slice(0, 10);
    const bumped = readFileSync(aup, 'utf-8').replace(
      `version: ${head[1]}.${head[2]};`,
      `version: ${nextVersion};`,
    );
    writeFileSync(aup, bumped);
    await expect(syncLegalDocs(tx, dir)).rejects.toBeInstanceOf(LegalEffectiveFromError);
    const after = await db.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT count(*) AS n FROM shop_legal_docs`,
    );
    expect(after[0].n).toBe(before[0].n);

    writeFileSync(
      aup,
      bumped.replace(/effective_from: \d{4}-\d{2}-\d{2}/, `effective_from: ${laterDate}`),
    );
    await syncLegalDocs(tx, dir);
    const later = Date.parse(`${laterDate}T00:00:00Z`) + 86_400_000;
    expect((await currentDocs(tx, later)).find((d) => d.doc_id === 'aup')!.version).toBe(
      nextVersion,
    );
    expect((await legalIndex(tx, later)).find((d) => d.doc_id === 'aup')!.version).toBe(
      nextVersion,
    );
  });
});
