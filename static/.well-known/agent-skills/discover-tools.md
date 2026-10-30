---
name: discover-tools
description: Progressive-disclosure workflow for finding relevant tools in APIbase's 1380-tool catalog without loading every schema into the agent context.
---

# Skill: Discover tools on APIbase

APIbase exposes 1380 tools across 25 categories. Loading all schemas into context
costs hundreds of thousands of tokens, which is wasteful. Use the `apibase.discover` tool (or
`GET /api/v1/discover`) to find only the tools relevant to the current task. The
`discover_tools` prompt is kept for backward compatibility.

## When to use

- The agent has a fresh goal and does not yet know which tool(s) to call.
- The agent's system prompt should not preload the full catalog.
- The MCP server has more than ~50 tools (APIbase has 1380).

## Steps

1. **Connect to the MCP server.**

   ```
   POST https://apibase.pro/mcp
   Content-Type: application/json
   Authorization: Bearer <ak_live_...>   # optional — auto-registration on first call
   ```

2. **Call the `apibase.discover` tool** (REST: `GET /api/v1/discover`). Three usage modes:

   | Call | Returns |
   |---|---|
   | `apibase.discover` (no args) | Best-ranked matches across the whole catalog (25 categories) |
   | `apibase.discover category="travel"` | Top travel tools (37 in the category) with descriptions |
   | `apibase.discover intent="find flights from NYC to Tokyo"` | Top tools ranked by relevance |

3. **Inspect the returned tool names and descriptions.** Pick the 1–3 tools that
   match the agent's goal.

4. **Call the chosen tool via `tools/call`.** All 1380 tools are always callable —
   discovery is advisory, not a gate.

   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "tools/call",
     "params": { "name": "sabre.search_flights", "arguments": { "...": "..." } }
   }
   ```

5. **Handle `402 Payment Required`** the first time you hit a paid tool.
   See the `x402-payment` skill for the payment flow.

## Alternative: full catalog

If the agent really needs every tool (e.g., for offline indexing), use:

```
GET https://apibase.pro/api/v1/tools
```

Returns all 1380 tools with full JSON Schemas. Use sparingly — the response is
large.

## Pin what you discovered

Every tool carries a `definition_sha256` (REST field; MCP `_meta["apibase/definition_sha256"]` in `tools/list`).
Recompute it as `sha256hex(stable_json({id, description, input_schema}))`, where `stable_json` is
fast-json-stable-stringify (keys sorted recursively, no whitespace) and the three values are exactly what
`GET /api/v1/tools/<id>` returns. `GET /api/v1/tools/manifest` returns every hash with an ETag you can poll
with `If-None-Match`. A changed hash means the description or input schema changed: re-read the tool before
calling it. Price is not part of the hash.
`tools/list` carries `ttlMs` (300000, 5 min) and `cacheScope` (`public`); a changed `definition_sha256` is the signal to re-read, and the price you pay is the one in the 402, never a cached one.
The manifest covers exactly the tools `tools/list` serves right now, including the `shop.*` platform tools, so a
tool marked unavailable drops out of both and `manifest_sha256` moves when the served set changes, while a
`definition_sha256` moves only when that tool's description or input schema changes.
`GET /api/v1/tools/shop.<name>` returns the fields a shop hash is computed over.

A tool input property may carry `"x-apibase-volatile": true` in its `input_schema`: that field does not take part in the cache key or the x402 dedup key (a request id or timestamp there no longer defeats a cache hit).
The annotation lives in `input_schema`, so it is part of `definition_sha256`.

## Why this exists

Agents that preload hundreds of tool schemas waste context and latency. Progressive
disclosure keeps the agent fast and focused while preserving full catalog
access for the rare cases that need it.
