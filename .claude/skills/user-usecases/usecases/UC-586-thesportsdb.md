# UC-586 — TheSportsDB (Multi-Sport Data)

## Meta

| Field | Value |
|-------|-------|
| **UC ID** | UC-586 |
| **Provider** | TheSportsDB |
| **Category** | Entertainment / Sports |
| **Status** | LIVE |
| **Date** | 2026-07-02 |
| **Tools** | 4 |
| **Auth** | None (free public API key "3" in URL path) |
| **Upstream Cost** | $0 |
| **Our Price** | $0.001/call |
| **Margin** | ~100% |

## Provider Overview

TheSportsDB is a community-maintained open sports database covering soccer, basketball, NFL,
NHL, MLB, rugby, tennis, and more. The free public API (key "3") provides team search,
player search, and league event schedules. No registration or API key required.

**API Base URL:** `https://www.thesportsdb.com/api/v1/json/3/`
**Documentation:** https://www.thesportsdb.com/api.php

## Endpoints Used

| Endpoint | Tool | Cache TTL |
|----------|------|-----------|
| `GET /searchteams.php?t={name}` | thesportsdb.team_search | 3600s |
| `GET /searchplayers.php?p={name}` | thesportsdb.player_search | 3600s |
| `GET /eventspastleague.php?id={id}` | thesportsdb.events_past | 300s |
| `GET /eventsnextleague.php?id={id}` | thesportsdb.events_next | 300s |

## Tool Mapping

| Tool ID | MCP Name | Description |
|---------|----------|-------------|
| `thesportsdb.team_search` | `thesportsdb.teams.search` | Search sports teams by name, returns league ID, stadium, country |
| `thesportsdb.player_search` | `thesportsdb.players.search` | Search players by name, returns team, position, nationality |
| `thesportsdb.events_past` | `thesportsdb.events.past` | Recent match results for a league (scores, round, venue) |
| `thesportsdb.events_next` | `thesportsdb.events.next` | Upcoming matches for a league (date, time, teams) |

## Common League IDs

| League | ID |
|--------|----|
| English Premier League | 4328 |
| Scottish Premier League | 4335 |
| German Bundesliga | 4331 |
| Italian Serie A | 4332 |
| NBA | 4387 |
| NFL | 4391 |
| MLB | 4380 |

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/thesportsdb/types.ts` | Raw API response TypeScript types |
| `src/adapters/thesportsdb/index.ts` | TheSportsDbAdapter class (no auth) |
| `src/schemas/thesportsdb.schema.ts` | Zod validation schemas |
| `src/adapters/registry.ts` | `case 'thesportsdb':` → TheSportsDbAdapter |
| `src/schemas/index.ts` | thesportsdbSchemas spread |
| `src/mcp/tool-definitions.ts` | 4 tool entries |
| `config/tool_provider_config.yaml` | Pricing and cache TTLs |
| `src/config/provider-limits.json` | Dashboard config (unlimited, no auth) |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| thesportsdb.team_search | $0 (free API) | $0.001 | ~100% |
| thesportsdb.player_search | $0 (free API) | $0.001 | ~100% |
| thesportsdb.events_past | $0 (free API) | $0.001 | ~100% |
| thesportsdb.events_next | $0 (free API) | $0.001 | ~100% |

Priced at minimum $0.001/call (infrastructure cost floor) since upstream is free.
~100% margin on all tools. Standard pricing for open, no-auth data sources.

## Notes

- Free key "3" is TheSportsDB's documented public API key; included in the URL path
- `search_all_leagues.php?s={sport}` is unavailable on free tier (returns empty results)
- Agent workflow: search team → get league_id → call events_past/events_next
- All sports covered: soccer, basketball, NFL, NHL, MLB, rugby, cricket, tennis, etc.
