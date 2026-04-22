---
name: discover-tools
description: Progressive-disclosure workflow for finding relevant tools in APIbase's 502-tool catalog without loading every schema into the agent context.
---

# Skill: Discover tools on APIbase

APIbase exposes 502 tools across 21 categories. Loading all schemas into context
costs ~300K tokens, which is wasteful. Use the `discover_tools` prompt to find
only the tools relevant to the current task.

## When to use

- The agent has a fresh goal and does not yet know which tool(s) to call.
- The agent's system prompt should not preload the full catalog.
- The MCP server has more than ~50 tools (APIbase has 502).

## Steps

1. **Connect to the MCP server.**

   ```
   POST https://apibase.pro/mcp
   Content-Type: application/json
   Authorization: Bearer <ak_live_...>   # optional — auto-registration on first call
   ```

2. **Call the `discover_tools` prompt.** Three usage modes:

   | Call | Returns |
   |---|---|
   | `discover_tools` (no args) | 21 categories with tool counts |
   | `discover_tools category="travel"` | ~17 travel tools with descriptions |
   | `discover_tools task="find flights from NYC to Tokyo"` | Top tools ranked by keyword relevance |

3. **Inspect the returned tool names and descriptions.** Pick the 1–3 tools that
   match the agent's goal.

4. **Call the chosen tool via `tools/call`.** All 502 tools are always callable —
   the `discover_tools` prompt is advisory, not a gate.

   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "tools/call",
     "params": { "name": "amadeus.flight_search", "arguments": { "...": "..." } }
   }
   ```

5. **Handle `402 Payment Required`** the first time you hit a paid tool.
   See the `x402-payment` skill for the payment flow.

## Alternative: full catalog

If the agent really needs every tool (e.g., for offline indexing), use:

```
GET https://apibase.pro/api/v1/tools
```

Returns all 502 tools with full JSON Schemas. Use sparingly — the response is
large.

## Why this exists

Agents that preload 500+ tool schemas waste context and latency. Progressive
disclosure keeps the agent fast and focused while preserving full catalog
access for the rare cases that need it.
