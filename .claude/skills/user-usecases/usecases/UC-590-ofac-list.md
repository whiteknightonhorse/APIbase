# UC-590 — OFAC Sanctions List

## Meta

| Field | Value |
|-------|-------|
| UC ID | UC-590 |
| Provider | US Treasury — Office of Foreign Assets Control (OFAC) |
| Category | Legal / Compliance |
| Date | 2026-07-02 |
| Status | LIVE |
| Tools | 4 |
| Auth | None (US Government public domain) |
| Base URL | https://sanctionslistservice.ofac.treas.gov/api/publicationpreview/exports/ |

## Provider Overview

The OFAC Specially Designated Nationals and Blocked Persons (SDN) list is the primary US sanctions enforcement tool published by the Department of the Treasury. US persons and entities are generally prohibited from transacting with any party on this list. The list is updated on US business days and is published as CSV, XML, and JSON flat files (CSV is used here as the most reliable format).

The list contains ~19,000 rows of individuals, entities, vessels, and aircraft across dozens of sanctions programs (IRAN, RUSSIA, CUBA, DPRK, CYBER, GLOMAG, etc.).

## Endpoints Used

| Endpoint | Description | Format | Size |
|----------|-------------|--------|------|
| `exports/sdn.csv` | Main SDN list | CSV (no header) | ~5.6 MB |
| `exports/alt.csv` | Alternate names/aliases | CSV (no header) | ~1 MB |

The server returns `Content-Type: text/xml` regardless of extension — the file content is actual CSV. There is no REST search API; tools parse the CSV files directly.

## Tool Mapping

| Tool ID | MCP Name | Description | Price | Cache TTL |
|---------|----------|-------------|-------|-----------|
| `ofac.sdn.search` | `ofac.sdn.search` | Search SDN list by name, type, program | $0.003 | 3600s |
| `ofac.sdn.aliases` | `ofac.sdn.aliases` | Get all aliases for an entity by ent_num | $0.002 | 3600s |
| `ofac.meta.programs` | `ofac.meta.programs` | List unique sanctions programs + entity counts | $0.002 | 86400s |
| `ofac.meta.publication_info` | `ofac.meta.publication_info` | Get publication date + SHA-256 digest | $0.001 | 3600s |

## Input Schemas

### ofac.sdn.search
```typescript
{
  name: string;              // min 1, max 200 — case-insensitive substring match
  type?: 'individual' | 'entity' | 'vessel' | 'aircraft';
  program?: string;          // e.g. "IRAN", "RUSSIA", "CUBA"
  limit?: number;            // 1–50, default 20
}
```

### ofac.sdn.aliases
```typescript
{
  ent_num: number;           // positive integer from sdn.search result
}
```

### ofac.meta.programs / ofac.meta.publication_info
```typescript
{
  locale?: string;           // no-op, for schema consistency
}
```

## CSV Formats

**sdn.csv** (12 fields, no header, `-0-` = null):
`ent_num, SDN_Name, SDN_Type, Program, Title, Call_Sign, Voc_Type, Tonnage, GRT, Vess_Flag, Vess_Owner, Remarks`

**alt.csv** (5 fields, no header):
`ent_num, alt_num, alt_type (aka/fka/nka), alt_name, alt_remarks`

## Implementation Files

- `src/adapters/ofac/types.ts` — raw CSV row types + result types
- `src/adapters/ofac/index.ts` — OfacAdapter (maxResponseBytes: 7MB, no auth)
- `src/schemas/ofac.schema.ts` — Zod schemas with `.describe()` on all fields

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| `ofac.sdn.search` | $0 (US Gov) | $0.003 | ~100% |
| `ofac.sdn.aliases` | $0 (US Gov) | $0.002 | ~100% |
| `ofac.meta.programs` | $0 (US Gov) | $0.002 | ~100% |
| `ofac.meta.publication_info` | $0 (US Gov) | $0.001 | ~100% |

Higher price for `sdn.search` ($0.003) reflects the 5.6 MB download cost (compute/bandwidth) for cold-cache calls. The 1-hour cache TTL (3600s) amortises this across repeated searches in the same window.

## License

US Government data — public domain under 17 U.S.C. § 105. Commercial use permitted. No ToS restrictions on resale via API aggregation.

## Usage Pattern

```
Agent workflow (AML/KYC screening):
1. ofac.meta.publication_info → verify list is current
2. ofac.sdn.search?name=TARGET → screen entity name
3. ofac.sdn.aliases?ent_num=NNN → check aliases for any hit
4. ofac.meta.programs → understand which sanctions program applies
```
