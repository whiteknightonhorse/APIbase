# UC-587 — EUR-Lex Cellar

## Meta

| Field | Value |
|-------|-------|
| ID | UC-587 |
| Provider | EUR-Lex Cellar (EU Publications Office) |
| Category | Legal |
| Date | 2026-07-02 |
| Status | LIVE |
| Tools | 4 |
| Auth | None (public EU open data) |

## Provider Overview

EUR-Lex Cellar is the official EU Publications Office SPARQL endpoint exposing the full body of EU law
via the CDM (Common Data Model) ontology. It covers all EU secondary legislation (regulations, directives,
decisions) published in the Official Journal of the European Union.

- **Endpoint**: `https://publications.europa.eu/webapi/rdf/sparql`
- **Protocol**: SPARQL 1.1 over HTTP POST (form-urlencoded)
- **Auth**: None
- **Rate limits**: No documented limits (EU Government open data)
- **License**: CC BY 4.0

## Client Input

| Field | Value |
|-------|-------|
| API Key | Not required |
| API Base | https://publications.europa.eu/webapi/rdf/sparql |

## Provider API Analysis

The EUR-Lex SPARQL endpoint supports SPARQL 1.1 queries.
JSON output: `Accept: application/sparql-results+json` header.

Key CDM predicates:
- `cdm:resource_legal_id_celex` — CELEX identifier (e.g. `32024R1689`)
- `cdm:work_date_document` — publication date
- `cdm:expression_title` — English title (via expression + language filter)
- `cdm:resource_legal_in-force` — boolean in-force status
- `cdm:expression_belongs_to_work` — links expression to work

CELEX format: `3[YEAR][TYPE][NUMBER]` where TYPE:
- `R` = Regulation (directly applicable in all EU member states)
- `L` = Directive (binding on objectives, member states implement)
- `D` = Decision (binding on specific addressees)

## Tool Mapping

| Tool ID | MCP Name | Description | Price | Cache TTL |
|---------|----------|-------------|-------|-----------|
| `eurlex.legislation.search` | `eurlex.legislation.search` | Search EU legislation by keyword in title | $0.002 | 3600s |
| `eurlex.legislation.recent` | `eurlex.legislation.recent` | Get recently published EU legislation | $0.001 | 1800s |
| `eurlex.legislation.detail` | `eurlex.legislation.detail` | Get details by CELEX number | $0.002 | 86400s |
| `eurlex.legislation.by_type` | `eurlex.legislation.by_type` | Browse by doc type (regulation/directive/decision) | $0.002 | 3600s |

## Input Schemas

### eurlex.legislation.search
```json
{
  "keyword": "artificial intelligence",
  "limit": 10,
  "from_date": "2020-01-01"
}
```

### eurlex.legislation.recent
```json
{
  "days": 30,
  "limit": 10
}
```

### eurlex.legislation.detail
```json
{
  "celex": "32024R1689"
}
```

### eurlex.legislation.by_type
```json
{
  "doc_type": "regulation",
  "from_year": 2020,
  "limit": 10
}
```

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/eurlex/types.ts` | TypeScript interfaces for SPARQL results |
| `src/adapters/eurlex/index.ts` | Adapter (SPARQL query builder + parser) |
| `src/schemas/eurlex.schema.ts` | Zod input schemas |
| `src/schemas/index.ts` | Schema registry (eurLexSchemas added) |
| `src/adapters/registry.ts` | Adapter registry (`eurlex` case added) |
| `src/mcp/tool-definitions.ts` | 4 tool definitions added |
| `config/tool_provider_config.yaml` | 4 tool entries |
| `src/config/provider-limits.json` | eurlex dashboard entry |

## Pricing Rationale

| Tool | Price | Upstream Cost | Margin |
|------|-------|---------------|--------|
| search | $0.002 | $0 | 100% |
| recent | $0.001 | $0 | 100% |
| detail | $0.002 | $0 | 100% |
| by_type | $0.002 | $0 | 100% |

Free upstream (EU Government open data, no auth). Pricing reflects SPARQL complexity and usefulness
for legal research agents. Detail and search priced at $0.002 (moderate complexity, valuable for
compliance/legal AI agents). Recent priced at $0.001 (simpler browse query).

## Notable Technical Decisions

- **POST with form-urlencoded**: SPARQL queries sent as POST body with `query=<encoded>` — avoids URL
  length limits for complex queries with CDM ontology prefixes.
- **15s timeout**: SPARQL queries over large triple stores can be slow; raised from default 10s.
- **Keyword injection prevention**: `keyword.replace(/"/g, '')` strips double quotes from CONTAINS()
  filter to prevent SPARQL injection. `celex.replace(/"/g, '')` same for detail filter.
- **CELEX sector 3 filter**: All queries filter `STRSTARTS(STR(?celex), "3")` to restrict to secondary
  EU legislation (sector 3 = regulations, directives, decisions from EU institutions).
- **MCP name convention**: All 4 tools use 3-level `eurlex.legislation.{action}` — `legislation` is the
  category noun since all 4 tools are in the same domain.
