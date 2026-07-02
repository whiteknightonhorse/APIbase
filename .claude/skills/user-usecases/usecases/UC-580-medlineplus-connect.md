# UC-580 — MedlinePlus Connect

## Meta

| Field | Value |
|-------|-------|
| ID | UC-580 |
| Provider | MedlinePlus Connect (US NLM) |
| Category | health — Clinical code → patient health information |
| Date | 2026-07-02 |
| Status | LIVE |
| Tools | 4 |
| Auth | None — US Government public domain, no registration |
| Upstream Cost | $0 (unlimited free) |

## Overview

MedlinePlus Connect is a free service from the US National Library of Medicine (NLM) that links
clinical health data systems to relevant patient-health information. It accepts standard clinical
codes — ICD-10-CM, ICD-9-CM, SNOMED CT, and RxNorm — and returns curated MedlinePlus topic
articles, drug information pages, and plain-language summaries in English or Spanish.

Typical use cases: EHR systems linking diagnosis codes to patient education, clinical decision
support lookups, drug information retrieval by RXCUI, multilingual patient portals.

## Endpoints

| Endpoint | Method | Auth |
|----------|--------|------|
| `https://connect.medlineplus.gov/service` | GET | None |

**Query parameters (common):**
- `mainSearchCriteria.v.c` — clinical code value
- `mainSearchCriteria.v.cs` — code system OID
- `mainSearchCriteria.v.dn` — display name (optional, improves matching)
- `informationRecipient.languageCode.c` — response language (`en` / `es`)
- `knowledgeResponseType=application/json` — always set to get JSON

**Code system OIDs:**

| Standard | OID |
|----------|-----|
| ICD-10-CM | `2.16.840.1.113883.6.90` |
| ICD-9-CM | `2.16.840.1.113883.6.103` |
| SNOMED CT | `2.16.840.1.113883.6.96` |
| RxNorm | `2.16.840.1.113883.6.88` |

## Tool Mapping

| Tool ID | MCP Name | Description | Price |
|---------|----------|-------------|-------|
| `medlineplus.icd10_lookup` | `medlineplus.clinical.icd10_lookup` | ICD-10-CM code → MedlinePlus patient topics | $0.001 |
| `medlineplus.icd9_lookup` | `medlineplus.clinical.icd9_lookup` | ICD-9-CM code → MedlinePlus patient topics | $0.001 |
| `medlineplus.snomed_lookup` | `medlineplus.clinical.snomed_lookup` | SNOMED CT concept → MedlinePlus patient topics | $0.001 |
| `medlineplus.rxnorm_lookup` | `medlineplus.clinical.rxnorm_lookup` | RxNorm RXCUI → MedlinePlus drug information | $0.001 |

## Input Schemas

### medlineplus.icd10_lookup
```json
{
  "code": "E11",
  "language": "en"
}
```

### medlineplus.icd9_lookup
```json
{
  "code": "250",
  "language": "en"
}
```

### medlineplus.snomed_lookup
```json
{
  "code": "44054006",
  "display_name": "Diabetes mellitus type 2",
  "language": "en"
}
```

### medlineplus.rxnorm_lookup
```json
{
  "rxcui": "723",
  "display_name": "Metformin",
  "language": "en"
}
```

## Sample Response

```json
{
  "code": "E11",
  "code_system": "ICD10CM",
  "display_name": "",
  "language": "en",
  "subtitle": "MedlinePlus Connect results for ICD-10-CM E11",
  "result_count": 2,
  "results": [
    {
      "title": "Diabetes Type 2",
      "url": "https://medlineplus.gov/diabetestype2.html?utm_source=mplusconnect&utm_medium=service",
      "summary": "Type 2 diabetes is a disease in which your blood glucose levels are too high..."
    },
    {
      "title": "Type 2 diabetes",
      "url": "https://medlineplus.gov/genetics/condition/type-2-diabetes?utm_source=mplusconnect&utm_medium=service",
      "summary": "Type 2 diabetes is a disorder characterized by abnormally high levels of blood glucose..."
    }
  ]
}
```

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/medlineplus/index.ts` | Main adapter class |
| `src/adapters/medlineplus/types.ts` | Raw API response types |
| `src/schemas/medlineplus.schema.ts` | Zod input validation schemas |
| `src/adapters/registry.ts` | `case 'medlineplus':` added |
| `src/schemas/index.ts` | `medlineplusSchemas` spread |
| `src/mcp/tool-definitions.ts` | 4 tool definitions added |
| `config/tool_provider_config.yaml` | 4 tool entries, price $0.001, TTL 86400 |
| `src/config/provider-limits.json` | Dashboard entry |
| `scripts/test-medlineplus.sh` | Smoke test script |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| `medlineplus.icd10_lookup` | $0 (US Gov public domain) | $0.001 | ~100% |
| `medlineplus.icd9_lookup` | $0 (US Gov public domain) | $0.001 | ~100% |
| `medlineplus.snomed_lookup` | $0 (US Gov public domain) | $0.001 | ~100% |
| `medlineplus.rxnorm_lookup` | $0 (US Gov public domain) | $0.001 | ~100% |

All tools are priced at $0.001 (minimum platform price) since upstream is free. Cache TTL 86400s
(24h) because clinical code definitions and MedlinePlus articles change infrequently.

## Notes

- API is a US Government service from the National Library of Medicine (NLM/NIH).
- No API key or registration required.
- No documented rate limits; practical limit is generous for EHR/clinical use cases.
- Returns patient-friendly summaries, not clinical documentation.
- Spanish language support via `language=es` parameter (maps to `informationRecipient.languageCode.c=es`).
- Summary field is HTML; adapter strips HTML tags via shared `stripHtml()` utility and truncates to 800 chars.
- Response cache is 86400s (24h) because medical articles update rarely.
