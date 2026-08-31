# UC-647: NCBI E-utilities Taxonomy (ncbi-eutils)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-647 |
| **Provider** | NCBI E-utilities (Entrez Programming Utilities) — Taxonomy database |
| **Domain** | eutils.ncbi.nlm.nih.gov |
| **Category** | World (biology/taxonomy reference — no dedicated "biodiversity" category exists; closest precedent is macrostrat UC-643, also a scientific reference DB, categorized "world") |
| **Theme** | Organism taxonomic classification — search by name, summary, full kingdom-to-species lineage |
| **Date** | 2026-08-31 |
| **Batch** | night-orchestra (onboarded) |
| **Status** | LIVE |
| **Region** | Global (US National Library of Medicine, public domain) |
| **Pricing Model** | free upstream (no auth) |
| **Monetization Pattern** | P3: Public/Community Open Data Wrapper |

---

## Provider Summary

NCBI E-utilities is the public REST gateway to all NCBI Entrez databases (PubMed, Gene,
Nucleotide, Protein, Taxonomy, etc.), run by the US National Library of Medicine (NIH). This
integration wraps the `taxonomy` database only — organism scientific classification (domain
through species) — a genuinely new capability distinct from the PubMed literature search already
covered by `education.pubmed_search` (`src/adapters/education`), which hits the same `eutils` host
with `db=pubmed`. Both adapters legitimately target `eutils.ncbi.nlm.nih.gov` for different Entrez
databases; there is no tool overlap.

| Aspect | Details |
|--------|---------|
| **Free Tier** | No signup, no API key required for read access |
| **Paid Tier** | N/A — no paid tier exists |
| **Auth Model** | None required; optional `api_key` raises the rate limit (see Quota) |
| **License** | US Government work, public domain |
| **Quota** | 3 requests/sec without a key, 10 requests/sec with an NCBI API key (NBK25497, "Usage Guidelines and Requirements") |
| **Global Availability** | Reachable from this host, standard HTTPS |
| **Status** | Stable, decades-old production API, platform-wide NCBI standard |

---

## API Overview

| # | Endpoint | Method | Description |
|---|----------|--------|--------------|
| 1 | `eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=taxonomy&term=...&retmode=json` | GET | Search taxonomy by organism name -> list of TaxIDs |
| 2 | `eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=taxonomy&id=...&retmode=json` | GET | TaxID -> scientific/common name, rank, division |
| 3 | `eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=taxonomy&id=...&retmode=xml` | GET | TaxID -> full classification record (XML only, no JSON mode) |

Verified live before implementation:
```
curl "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=taxonomy&term=Panthera%20leo&retmode=json"
-> {"header":{...},"esearchresult":{"count":"1","idlist":["9689"],"querytranslation":"panthera leo[All Names]"}}

curl "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=taxonomy&id=9689&retmode=json"
-> {"header":{...},"result":{"uids":["9689"],"9689":{"uid":"9689","rank":"species","scientificname":"Panthera leo","commonname":"lion",...}}}

curl "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=taxonomy&id=9689&retmode=xml"
-> <TaxaSet><Taxon><TaxId>9689</TaxId><ScientificName>Panthera leo</ScientificName>...
   <Lineage>cellular organisms; Eukaryota; ...; Felidae; Pantherinae; Panthera</Lineage>
   <LineageEx><Taxon>...27 ancestor ranks...</Taxon></LineageEx></Taxon></TaxaSet>
```

### Research Quirk — efetch has no JSON mode for taxonomy; hand-parsed XML instead of a new dependency

`retmode=json` is silently ignored by `efetch.fcgi` for `db=taxonomy` (only `esearch`/`esummary`
honor it) — XML is the only format. No XML-parsing library exists in `package.json`
(`src/adapters/adbkidb` and `src/adapters/uklegislation` already hand-parse XML via regex rather
than adding a dependency), so `taxonomy_lineage` follows the same no-dependency pattern:
`NcbiEutilsAdapter` overrides `call()` for this one tool, fetches XML text directly (retry/timeout
logic copied from the `bank-of-england` CSV-fetch pattern), and extracts fields with targeted
regexes. The top-level `<Taxon>` fields (`ScientificName`, `Rank`, `Division`, etc.) all appear in
document order *before* the nested `<LineageEx><Taxon>...` ancestor list, so a non-global
`tagText()` regex match (first occurrence wins) always resolves to the outer taxon's value, never
a nested ancestor's — verified against the live Panthera leo response above (28 total ranks:
1 self + 27 ancestors, all extracted correctly, order preserved).

### Research Quirk — efetch returns an empty `<TaxaSet></TaxaSet>` for unknown/invalid TaxIDs

Unlike esummary (which returns `{"uid":"...","error":"cannot get document summary"}` for an
invalid ID — passed straight through by `taxonomy_summary`'s `found: false` branch), efetch on an
unknown TaxID returns HTTP 200 with an empty `<TaxaSet>` element, no error field at all. Handled by
checking for the presence of any `<TaxId>` tag in the response body before attempting field
extraction; absent, `taxonomy_lineage` returns `{tax_id, found: false}` instead of throwing.

### Research Quirk — no PubMed/literature overlap

The candidate line pointed at the generic `eutils.ncbi.nlm.nih.gov/entrez/eutils` root, which also
serves PubMed search (already live as `education.pubmed_search`, using `db=pubmed` on the same
host). Deliberately scoped this integration to `db=taxonomy` only — a distinct Entrez database and
a distinct real-world capability (organism classification, not literature search) — rather than
duplicating existing tool coverage.

---

## Tool Mapping

| # | Tool ID | mcpName | Description | Price |
|---|---------|---------|--------------|-------|
| 1 | ncbi-eutils.taxonomy_search | ncbi-eutils.taxonomy.search | Search organism name -> list of NCBI TaxIDs | $0.001 |
| 2 | ncbi-eutils.taxonomy_summary | ncbi-eutils.taxonomy.summary | TaxID -> scientific/common name, rank, division | $0.001 |
| 3 | ncbi-eutils.taxonomy_lineage | ncbi-eutils.taxonomy.lineage | TaxID -> full kingdom-to-species classification tree | $0.001 |

All 3 tools: category `world`, annotations `READ_ONLY`.

- `taxonomy_search` is the entry point — its returned `tax_ids` feed directly into both
  `taxonomy_summary` (quick single-record lookup) and `taxonomy_lineage` (full ancestor tree),
  same search -> detail flow as prior single-domain reference-data onboardings.

---

## Input Schemas

Defined in `src/schemas/ncbi-eutils.schema.ts`, all `strip()`ped Zod objects:

- `taxonomy_search`: `query` (required, min length 1, scientific or common name), `retmax`
  (optional int, 1-50, default 20).
- `taxonomy_summary`: `tax_id` (required string, regex `^\d+$` — numeric NCBI TaxID).
- `taxonomy_lineage`: `tax_id` (required string, regex `^\d+$` — numeric NCBI TaxID).

`tax_id` is re-validated in the adapter (`requireTaxId`) — not just at the Zod layer — since it is
interpolated directly into the outbound `esummary.fcgi`/`efetch.fcgi` URLs.

---

## Implementation Files

| File | Purpose |
|------|---------|
| src/adapters/ncbi-eutils/index.ts | NcbiEutilsAdapter — esearch/esummary via base call(), efetch XML via call() override |
| src/adapters/ncbi-eutils/types.ts | Raw E-utilities taxonomy response types |
| src/schemas/ncbi-eutils.schema.ts | Zod schemas for all 3 tools |
| src/adapters/registry.ts | case 'ncbi-eutils' to NcbiEutilsAdapter, reuses PROVIDER_KEY_NCBI |
| src/schemas/index.ts | ncbiEutilsSchemas spread |
| src/mcp/tool-definitions.ts | 3 tool definitions, category world |
| config/tool_provider_config.yaml | 3 tool entries, provider ncbi-eutils, price_usd 0.001, cache_ttl 604800 |
| src/config/provider-limits.json | Dashboard entry, limit_type unlimited, documented 3/10 req/sec rate limit |
| static/dashboard.html | PROVIDER_CATEGORIES entry: 'Science' (matches OBIS Marine Biodiversity, Catalogue of Life) |
| scripts/test-ncbi-eutils.sh | Smoke test script |

---

## Pricing Rationale

| Tool | Upstream Cost | Price (USD) | Margin | Cache TTL |
|------|---------------|-------------|--------|-----------|
| ncbi-eutils.taxonomy_search | $0 (free, no auth) | $0.001 | ~100% | 604800s (7d — taxonomic search results are effectively static reference data) |
| ncbi-eutils.taxonomy_summary | $0 (free, no auth) | $0.001 | ~100% | 604800s (7d — species classification changes on a years-not-days timescale) |
| ncbi-eutils.taxonomy_lineage | $0 (free, no auth) | $0.001 | ~100% | 604800s (7d — same static-reference-data class as malaria-atlas UC-640/world-bank-cckp UC-630) |

---

## Notes

- Shares `PROVIDER_KEY_NCBI` with the existing `pubchem` adapter (`src/adapters/pubchem`) — same
  NCBI account, raises the eutils rate limit from 3 to 10 req/sec across both adapters when the
  key is present. No new env var added.
- Adapter logic was verified directly against the live upstream API (bypassing the pipeline, since
  agent auth was blocked — see below) via a one-off `tsx` script exercising all 3 tool code paths:
  `taxonomy_search` (Panthera leo -> tax_id 9689), `taxonomy_summary` (9689 -> "Panthera leo" /
  "lion" / species / carnivores), and `taxonomy_lineage` (9689 -> 27-ancestor lineage array,
  domain through genus, plus the raw `lineage_text` semicolon-joined string) — all fields populated
  correctly, XML parsing confirmed against the live 28-rank Panthera leo record.
- `scripts/seed.ts` upserted all 1275 tools (including the 3 new ncbi-eutils tools, confirmed
  `healthy` status via a direct Prisma query) successfully; the script's separate
  `seedTestAgent()` step failed afterward with the same pre-existing, unrelated Prisma UUID error
  documented in prior UC notes (UC-643 through UC-646: `Agent.agent_id` column is typed `uuid` in
  Postgres but the seed script's `TEST_AGENT_ID` value `'test-agent-001'` is not a valid UUID) —
  confirmed unmodified by this onboarding (`git log` shows no changes to `scripts/seed.ts` or the
  Prisma schema), out of scope to fix here. This also meant the standard TEST_API_KEY-based live
  pipeline call could not be exercised — mitigated by the direct-adapter verification above plus
  the standard `/api/v1/tools`/`/api/v1/dashboard` REST checks (schema, description, catalog
  count, dashboard entry all confirmed live).
- `scripts/smoke-test.sh` 8/8 pass.
- Per A-06/sandbox rules, this role did NOT run `scripts/sync-counts.sh` and did not publish to
  the remote repository or Smithery — those remain for the hourly batch-pusher, matching the
  UC-645/UC-646 precedent.

## Next Steps

- [x] No registration needed
- [x] Onboarded via night-orchestra batch role — adapter, schemas, registry, config, seed, build,
      deploy, OpenAPI, server-card all live
