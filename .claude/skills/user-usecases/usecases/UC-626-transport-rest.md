# UC-626: transport.rest — Berlin/Brandenburg Public Transit

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-626 |
| **Provider** | transport.rest (community-run, v6.bvg.transport.rest — BVG HAFAS wrapper) |
| **Domain** | transport.rest |
| **Category** | Transportation |
| **Theme** | Travel & Transit |
| **Date** | 2026-08-28 |
| **Batch** | night-orchestra (onboarded) |
| **Status** | LIVE (Berlin/Brandenburg region only — see quirk below) |
| **Region** | Berlin & Brandenburg, Germany (some long-distance trains included) |
| **Pricing Model** | free upstream |
| **Monetization Pattern** | P3: Public/Community Open Data Wrapper |

---

## Provider Summary

`transport.rest` is a family of free, no-auth REST wrappers around various European public-transit
HAFAS backends, run by the community (derhuerst). It exposes several regional subdomains
(`v6.db.transport.rest` for nationwide Deutsche Bahn, `v6.bvg.transport.rest` for Berlin/Brandenburg
BVG, `v6.vbb.transport.rest`, `poland.transport.rest`, etc.).

| Aspect | Details |
|--------|---------|
| **Free Tier** | Unlimited (rate-limited to 100 req/min) |
| **Paid Tier** | None |
| **Auth Model** | None |
| **ToS** | Publicly documented, developer-friendly project; CORS enabled; no resale restriction stated |
| **Global Availability** | Origin server region-locked in practice — see quirk below |

### CRITICAL Upstream Quirk (confirmed live, 2026-08-28) — most subdomains reject TLS from this host

Live reachability was verified per-subdomain from this Hetzner datacenter IP:

| Subdomain | Result |
|-----------|--------|
| `v6.db.transport.rest` (nationwide DB) | **TLS handshake fails** — server sends `tlsv1 alert internal error` during ClientHello, confirmed via `openssl s_client` (not a client-side cert/cipher issue — the server actively rejects the connection before any HTTP exchange) |
| `v6.vbb.transport.rest` | Same TLS failure |
| `v1.nottingham-city.transport.rest` | Same TLS failure |
| `v6.bvg.transport.rest` (Berlin/Brandenburg) | **Reachable, HTTP 200**, verified with live `/locations`, `/locations/nearby`, `/stops/{id}/departures`, `/journeys` calls |
| `poland.transport.rest` | Reachable, HTTP 200 (not used — out of scope) |

Root cause is unconfirmed (likely per-origin infra difference between community-run mirrors, not a
uniform anti-bot block, since two of five subdomains work fine). **Scope was reduced to
Berlin/Brandenburg transit only** via `v6.bvg.transport.rest`, the confirmed-reachable origin. If a
future onboarding needs nationwide German rail, re-test `v6.db.transport.rest` reachability first —
do not assume it works from this host.

---

## API Overview

| # | Endpoint | Method | Description | Rate Limit |
|---|----------|--------|-------------|------------|
| 1 | `/locations` | GET | Search stops/stations, addresses, POIs by name | 100 req/min |
| 2 | `/locations/nearby` | GET | Find stops/stations near a lat/lon coordinate | 100 req/min |
| 3 | `/stops/{id}/departures` | GET | Real-time departures at a stop within a time window | 100 req/min |
| 4 | `/journeys` | GET | Plan a multi-leg transit journey between two stops | 100 req/min |

**Base URL:** `https://v6.bvg.transport.rest`
**Docs:** `https://v6.bvg.transport.rest/` (human docs + OpenAPI playground)

---

## Proposed MCP Tools

| # | Tool Name | Description | Est. Price |
|---|-----------|--------------|------------|
| 1 | `transport-rest.location_search` | Search transit stops/stations/addresses/POIs by name | $0.001 |
| 2 | `transport-rest.nearby_stops` | Find transit stops near a coordinate, sorted by distance | $0.001 |
| 3 | `transport-rest.stop_departures` | Real-time departures (line, platform, delay) for a stop | $0.002 |
| 4 | `transport-rest.journey_search` | Plan a journey between two stops with leg-by-leg routing | $0.002 |

---

## Why Interesting for Agents

- Real-time delay/platform data — most transit APIs on the platform are static/reference-only
- Complements existing travel tools (Amadeus, Sabre, Aviasales — all flights) with ground-level urban
  transit, useful for last-mile / local-transport planning agents
- No API key friction — agents can call immediately
- **Not suitable** for transit outside Berlin/Brandenburg — tool descriptions state the region explicitly

---

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/transport-rest/index.ts` | `TransportRestAdapter` — inline types, maps 4 tools to `v6.bvg.transport.rest` endpoints, trims verbose HAFAS response shapes to agent-friendly summaries |
| `src/schemas/transport-rest.schema.ts` | Zod schemas (`query`, `latitude`/`longitude`, `stop_id`, `from_stop_id`/`to_stop_id`, etc.) per tool |
| `src/adapters/registry.ts` | `case 'transport-rest':` → `TransportRestAdapter` |
| `src/schemas/index.ts` | `...transportRestSchemas` spread |
| `src/mcp/tool-definitions.ts` | 4 tool definitions, category `travel`, `mcpName` = `transport-rest.transit.{action}` |
| `config/tool_provider_config.yaml` | 4 tool entries, `provider: transport-rest`, `price_usd: "0.001"–"0.002"`, `cache_ttl: 60`–`604800` |
| `src/config/provider-limits.json` | `transport-rest` dashboard entry (hourly, 6000 free — derived from documented 100 req/min) |
| `static/dashboard.html` | `PROVIDER_CATEGORIES['transport.rest (BVG Berlin Transit)'] = 'Travel'` |
| `scripts/test-transport-rest.sh` | 6-check smoke test (catalog, schema, dashboard, OpenAPI, live upstream value) |

## Pricing Rationale

| Tool | Upstream Cost | Price (USD) | Margin | Cache TTL |
|------|---------------|-------------|--------|-----------|
| `transport-rest.location_search` | $0 (free, no auth) | $0.001 | ~100% | 604800s (7d — station names/coords are static) |
| `transport-rest.nearby_stops` | $0 (free, no auth) | $0.001 | ~100% | 604800s (7d — static) |
| `transport-rest.stop_departures` | $0 (free, no auth) | $0.002 | ~100% | 60s (real-time delay data) |
| `transport-rest.journey_search` | $0 (free, no auth) | $0.002 | ~100% | 60s (real-time delay data) |

---

## Next Steps

- [x] No registration needed
- [x] Onboarded via night-orchestra batch role — adapter, schemas, registry, config, seed, build, deploy, smoke tests all pass
- [x] Scope reduced to Berlin/Brandenburg (`v6.bvg.transport.rest`) after confirming `v6.db.transport.rest`/`v6.vbb.transport.rest` reject TLS from this host
- [x] Smoke test all tools — `scripts/test-transport-rest.sh` + general `scripts/smoke-test.sh` 8/8 PASS
- [ ] Update candidates-registry.json status to "onboarded"
