/**
 * T-INT-05: register static/legal/*.md in shop_legal_docs. Exits non-zero when a registered
 * version's text changed (bump `version` in the first line instead).
 *   tsx scripts/shop/sync-legal-docs.ts          sync to the database (also runs at app start)
 *   tsx scripts/shop/sync-legal-docs.ts --check  parse + hash only, no database (npm run build)
 */
import { readAllLegalFiles, syncLegalDocs } from '../../src/shop/legal/legal-docs';

async function main(): Promise<void> {
  if (process.argv.includes('--check')) {
    for (const f of readAllLegalFiles())
      console.log(`${f.doc_id} v${f.version} sha256:${f.sha256}`);
    return;
  }
  const { defaultShopDeps } = await import('../../src/shop/merchant-lifecycle.service');
  const files = await syncLegalDocs(defaultShopDeps().db);
  for (const f of files) console.log(`${f.doc_id} v${f.version} sha256:${f.sha256}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
