# UC-549 — CORDIS EU Research Funding Database

## Meta

| Field | Value |
|-------|-------|
| ID | UC-549 |
| Provider | CORDIS (Community Research and Development Information Service) |
| Category | education |
| Date Added | 2026-06-30 |
| Status | LIVE |
| Tools | 4 |
| Auth | None (public SPARQL endpoint) |
| Upstream Cost | $0 |
| Price Range | $0.002–$0.003/call |

## Provider Overview

CORDIS is the European Commission's primary public repository for EU-funded research and innovation projects. It covers 80,000+ Horizon Europe (2021–2027) and H2020 (2014–2020) funded projects, 72,000+ participating organisations, and 419,000+ linked publications.

Data is exposed via the EURIO ontology (`http://data.europa.eu/s66#`) through a public Virtuoso SPARQL endpoint at `https://cordis.europa.eu/datalab/sparql`. No authentication or registration is required.

**Data portal:** https://cordis.europa.eu/

## API Endpoints

| Endpoint | Auth | Notes |
|----------|------|-------|
| `https://cordis.europa.eu/datalab/sparql` | None | SPARQL 1.1, Virtuoso triplestore, returns `application/sparql-results+json` |

**Key EURIO classes:**
- `eurio:Project` — funded research project (grant agreement)
- `eurio:Organisation` — legal entity participant
- `eurio:ProjectPublication` — linked publication/deliverable

**Query patterns:**
- `FILTER(CONTAINS(LCASE(str(?title)), "..."))` — case-insensitive keyword search
- `eurio:identifier "101012345"` — exact grant ID lookup
- `eurio:hasInvolvedParty → eurio:isRoleOf` — project → organisation join

## Tool Mapping

| Tool ID | MCP Name | Description | Price | Cache TTL |
|---------|----------|-------------|-------|-----------|
| `cordis.project_search` | `cordis.research.project_search` | Search EU-funded projects by keyword, status, and date range | $0.002 | 3600s |
| `cordis.project_details` | `cordis.research.project_details` | Full project metadata including abstract, budget, duration, and participating organisations | $0.003 | 86400s |
| `cordis.organisation_search` | `cordis.research.organisation_search` | Search organisations by name and country that participated in EU-funded research | $0.002 | 86400s |
| `cordis.project_publications` | `cordis.research.project_publications` | Search publications and deliverables from EU-funded projects | $0.002 | 86400s |

## Input Schemas

### `cordis.project_search`
```typescript
{
  query:     string          // keyword search in project title (required)
  status?:   'SIGNED' | 'CLOSED' | 'TERMINATED'
  year_from?: number         // filter start date >= year-01-01
  year_to?:   number         // filter start date <= year-12-31
  limit?:    number          // 1–20, default 10
}
```

### `cordis.project_details`
```typescript
{
  grant_id: string  // 9-digit Horizon Europe agreement number (e.g. 101012345) or 6-digit H2020
}
```

### `cordis.organisation_search`
```typescript
{
  name:     string  // organisation name partial match (min 2 chars)
  country?: string  // ISO 3166-1 alpha-2 country code (e.g. DE, FR, GB)
  limit?:   number  // 1–20, default 10
}
```

### `cordis.project_publications`
```typescript
{
  query:      string  // keyword search in publication title (min 2 chars)
  project_id?: string // filter by grant agreement number
  limit?:     number  // 1–20, default 10
}
```

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/cordis/types.ts` | TypeScript interfaces for SPARQL raw results and normalised output |
| `src/adapters/cordis/index.ts` | CordisAdapter: builds SPARQL URLs, parses bindings, two-step project detail |
| `src/schemas/cordis.schema.ts` | Zod validation schemas for all 4 tools |
| `src/adapters/registry.ts` | `case 'cordis'` → CordisAdapter |
| `src/schemas/index.ts` | `...cordisSchemas` spread |
| `src/mcp/tool-definitions.ts` | 4 tool definitions with mcpName/title/description/category |
| `config/tool_provider_config.yaml` | Tool pricing and cache TTL |
| `src/config/provider-limits.json` | Dashboard config: unlimited, no auth |

## Implementation Notes

- **SPARQL timeout:** 15 000 ms (SPARQL queries on large triplestores can take 5–10s).
- **Two-step project detail:** `cordis.project_details` makes two SPARQL requests — one for project fields, one for organisation participants — merged in the `call()` override. Internal sub-tool `cordis.project_details_orgs` is not registered in the catalog.
- **CORDIS REST/DET API skipped:** The `/api/search` endpoint is broken (SPA routing issue; returns 404 HTML). The DET (Data Extraction Tool) REST API requires registration. The SPARQL endpoint is the only reliable, open, programmatic access path.
- **EURIO ontology depth:** Project identifier is the grant agreement number (`eurio:identifier`), not the RCN. Both are returned where available.
- **Organisation type filter:** Uses `VALUES ?type { eurio:Organisation eurio:ForProfitOrganisation eurio:SME }` to cover the most common entity types without hitting abstract superclasses.

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| `cordis.project_search` | $0 | $0.002 | 100% |
| `cordis.project_details` | $0 | $0.003 | 100% |
| `cordis.organisation_search` | $0 | $0.002 | 100% |
| `cordis.project_publications` | $0 | $0.002 | 100% |

`project_details` is priced at $0.003 (vs $0.002) because it makes two upstream SPARQL requests per call and returns richer data (abstract, budget, organisations).
