# UC-649: GeoNet New Zealand (geonet-nz)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-649 |
| **Provider** | GeoNet (GNS Science, New Zealand) |
| **Domain** | api.geonet.org.nz |
| **Category** | World (Earthquakes — matches existing USGS Earthquake dashboard category) |
| **Theme** | New Zealand earthquake search/detail/statistics + Volcanic Alert Level for 12 monitored volcanoes |
| **Date** | 2026-09-01 |
| **Batch** | night-orchestra (onboarded) |
| **Status** | LIVE |
| **Region** | New Zealand |
| **Pricing Model** | free upstream (no auth) |
| **Monetization Pattern** | P3: Public/Community Open Data Wrapper |

---

## Provider Summary

GeoNet is New Zealand's official geological hazard monitoring system, operated by GNS Science
and funded by the NZ government (EQC, LINZ, MBIE). Its public REST API serves near-real-time
earthquake data (felt-quake search, single-quake detail, earthquake-rate statistics) and current
Volcanic Alert Levels for all 12 GeoNet-monitored New Zealand volcanoes.

| Aspect | Details |
|--------|---------|
| **Free Tier** | Fully open, no signup, no API key |
| **Paid Tier** | N/A — no paid tier exists |
| **Auth Model** | None |
| **License** | GeoNet Data Policy — "all its data and images freely available"; CC BY 3.0 NZ |
| **Quota** | No documented rate limit (verified against live API docs at api.geonet.org.nz) |
| **Global Availability** | Reachable from this host, standard HTTPS |
| **Status** | Production, actively maintained (GNS Science / EQC) |

---

## API Overview

| # | Endpoint | Method | Description |
|---|----------|--------|--------------|
| 1 | `api.geonet.org.nz/quake?MMI=(int)` | GET | Quakes possibly felt in NZ during the last 365 days (max 100), filtered by minimum shaking intensity |
| 2 | `api.geonet.org.nz/quake/(publicID)` | GET | Single quake detail by publicID |
| 3 | `api.geonet.org.nz/quake/stats` | GET | Magnitude-count breakdown (7/28/365 days) + daily earthquake-rate time series |
| 4 | `api.geonet.org.nz/volcano/val` | GET | Current Volcanic Alert Level + aviation colour code for all 12 monitored volcanoes |

Verified live before implementation:
```
curl -H "Accept: application/vnd.geo+json;version=2" "https://api.geonet.org.nz/quake?MMI=3"
-> {"type":"FeatureCollection","features":[{"properties":{"publicID":"2026p657434","time":"2026-09-01T06:00:52.826Z","depth":11.98,"magnitude":3.18,"mmi":3,"locality":"20 km south of Whanganui","quality":"best"},...}]}

curl -H "Accept: application/vnd.geo+json;version=2" "https://api.geonet.org.nz/quake/2026p657434"
-> single-feature FeatureCollection with same shape

curl -H "Accept: application/json;version=2" "https://api.geonet.org.nz/quake/stats"
-> {"magnitudeCount":{"days365":{...},"days28":{...},"days7":{...}},"rate":{"perDay":{...}}}

curl -H "Accept: application/vnd.geo+json;version=2" "https://api.geonet.org.nz/volcano/val"
-> 12 features, e.g. {"properties":{"acc":"Yellow","level":2,"volcanoID":"whiteisland","volcanoTitle":"White Island",...}}
```

### Research Quirk — `/quake` rejects ANY query parameter besides `MMI`

`GET /quake?bbox=...&MMI=3` returns `400 bad request: found additional query parameters` — the
endpoint is strictly single-parameter. No pagination, bbox, or date-range filtering is available;
`MMI` (required, integer -1 to 8) is the only accepted input, confirmed against the live API
(not just the docs prose) before writing the adapter.

### Research Quirk — error responses are `text/plain`, not JSON

`400` responses return a bare text body (e.g. `bad request: invalid MMI: 9`), not a JSON error
object. No adapter-level special-casing was needed: `BaseAdapter.executeRequest()` already only
attempts `JSON.parse()` on the success (2xx) path, and folds any 4xx body into the `INPUT_REJECTED`
error message as plain text — confirmed this project-wide invariant (2026-06-06 CLAUDE.md flywheel
rule) holds without adapter changes.

### Research Quirk — `/volcano/val` and `/volcano/quake/(volcanoID)` are separate endpoints; a bare `/volcano/quake` 404-redirects

Only `/volcano/val` (all-volcano Alert Level list, no path/query params) was implemented.
`/volcano/quake/(volcanoID)` (quakes near a specific volcano, past 60 days) is a distinct,
separately-documented endpoint that was considered but dropped to keep this batch at 4 tools —
candidate for a future follow-up if requested.

---

## Tool Mapping

| # | Tool ID | mcpName | Description | Price |
|---|---------|---------|--------------|-------|
| 1 | geonet-nz.quake_search | geonet-nz.quakes.search | Felt-earthquake search by minimum MMI | $0.001 |
| 2 | geonet-nz.quake_detail | geonet-nz.quakes.detail | Single quake detail by publicID | $0.001 |
| 3 | geonet-nz.quake_stats | geonet-nz.quakes.stats | Magnitude-count + daily-rate statistics | $0.001 |
| 4 | geonet-nz.volcano_alert_level | geonet-nz.volcano.alert_level | Current Volcanic Alert Level, all 12 NZ volcanoes | $0.001 |

All 4 tools: category `world`, annotations `READ_ONLY`.

---

## Input Schemas

Defined in `src/schemas/geonet-nz.schema.ts`, all `strip()`ped Zod objects:

- `quake_search`: `mmi` (required, integer -1..8) — real upstream-required parameter
- `quake_detail`: `public_id` (required, string 1-32 chars, e.g. `"2014p715167"`)
- `quake_stats`: `days` (optional enum `"7"|"28"|"365"`) — client-side filter of the response's
  `magnitudeCount` object, since the upstream endpoint itself takes no query parameters
- `volcano_alert_level`: `volcano_id` (optional enum of the 12 known GeoNet volcano IDs) —
  client-side filter of the response list, since `/volcano/val` itself takes no query parameters

`mmi` and `public_id` are re-validated in the adapter (range check / length check) before being
placed on the outbound URL; `public_id` is `encodeURIComponent()`-escaped per the 2026-03-30
CLAUDE.md URL-path-injection rule.

---

## Implementation Files

| File | Purpose |
|------|---------|
| src/adapters/geonet-nz/index.ts | GeonetNzAdapter — buildRequest/parseResponse for all 4 tools |
| src/adapters/geonet-nz/types.ts | Raw GeoNet GeoJSON/stats response types |
| src/schemas/geonet-nz.schema.ts | Zod schemas for all 4 tools |
| src/adapters/registry.ts | case 'geonet-nz' to GeonetNzAdapter |
| src/schemas/index.ts | geonetNzSchemas spread |
| src/mcp/tool-definitions.ts | 4 tool definitions, category world |
| config/tool_provider_config.yaml | 4 tool entries, provider geonet-nz, price_usd 0.001, cache_ttl 60-3600 |
| src/config/provider-limits.json | Dashboard entry, limit_type unlimited, no documented rate limit |
| static/dashboard.html | PROVIDER_CATEGORIES entry: 'Earthquakes' (matches USGS Earthquake) |
| scripts/test-geonet-nz.sh | Smoke test script |

---

## Pricing Rationale

| Tool | Upstream Cost | Price (USD) | Margin | Cache TTL |
|------|---------------|-------------|--------|-----------|
| geonet-nz.quake_search | $0 (free, no auth) | $0.001 | ~100% | 60s (near-real-time felt-quake list) |
| geonet-nz.quake_detail | $0 (free, no auth) | $0.001 | ~100% | 300s (quality field can be revised, e.g. best→deleted) |
| geonet-nz.quake_stats | $0 (free, no auth) | $0.001 | ~100% | 3600s (aggregate daily-rate stats change slowly) |
| geonet-nz.volcano_alert_level | $0 (free, no auth) | $0.001 | ~100% | 300s (alert level can change quickly during unrest) |

---

## Notes

- New category pairing for the dashboard: added to the existing `Earthquakes` bucket alongside
  `USGS Earthquake` in `static/dashboard.html` `PROVIDER_CATEGORIES` (no new category needed).
- `npx tsx scripts/seed.ts` upserted all 1304 tools (including the 4 new geonet-nz tools).
  The script's separate `seedTestAgent()` step failed afterward with the same pre-existing,
  unrelated Prisma UUID error documented in prior UC notes (UC-643 through UC-648:
  `Agent.agent_id` column is typed `uuid` in Postgres but the seed script's hardcoded
  `TEST_AGENT_ID` value `'test-agent-001'` is not a valid UUID) — confirmed unmodified by this
  onboarding, out of scope to fix here.
- Full paid-path pipeline execution (ESCROW → PROVIDER_CALL → LEDGER_WRITE) was not exercised
  end-to-end in this role: the `/api/v1/agents/auto` endpoint returned "Anonymous agent already
  exists for this fingerprint" without issuing a fresh API key, and the seed script's hardcoded
  `TEST_API_KEY` fails the gateway's API-key format check (same UUID-adjacent seed bug above).
  Routing correctness up to the auth gate was confirmed instead via: catalog presence (4/4),
  schema+description richness (4/4), dashboard registration (tool_count=4), and 4 OpenAPI routes
  — same fallback verification level as prior UC-645/646/647/648 batch entries.
- `scripts/smoke-test.sh` (8/8) and `scripts/test-geonet-nz.sh` (6/6) both pass after
  OpenAPI/server-card regeneration (Step 14). Note: `apibase.pro` and `localhost:8880` are the
  same running Docker stack on this host (Docker Nginx → host Nginx → public 443), so "local
  production" verification and the public domain are the same live deployment.
- Per A-06/sandbox rules, this role did NOT run `scripts/sync-counts.sh` and did not publish to
  the remote repository or Smithery — those remain for the hourly batch-pusher, matching the
  UC-645/UC-646/UC-647/UC-648 precedent.

## Next Steps

- [x] No registration needed
- [x] Onboarded via night-orchestra batch role — adapter, schemas, registry, config, seed, build,
      deploy, OpenAPI, server-card all live
