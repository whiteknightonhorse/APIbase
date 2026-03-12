---
name: smithery
description: "Publish and update APIbase MCP server on Smithery.ai registry. Triggers a re-scan so Smithery picks up new tools after provider onboarding. Use /smithery to republish, or /smithery status to check current listing."
user-invocable: true
argument-hint: "[publish | status]"
allowed-tools: Read, Grep, Glob, Bash, Agent
---

# APIbase — Smithery Registry Publish Skill

Manages the APIbase listing on Smithery.ai — the main MCP server catalog.

## Smithery Registration

| Field | Value |
|-------|-------|
| Namespace | `apibase-pro` |
| Server ID | `api-hub` |
| Qualified name | `apibase-pro/api-hub` |
| Server URL | `https://apibase.pro/mcp` |
| Transport | Streamable HTTP (protocol 2025-11-25) |
| Listing URL | `https://smithery.ai/servers/apibase-pro/api-hub` |
| Gateway URL | `api-hub--apibase-pro.run.tools` |

## Authentication

Smithery API key required for CLI publish. Stored in `.env`:

```
SMITHERY_API_KEY=<key from https://smithery.ai/account/api-keys>
```

The user must create this key manually at smithery.ai/account/api-keys and add it to `.env`.

## Connection Config Schema

Our server accepts API key via two methods:
- `Authorization: Bearer <key>` (standard, direct connections)
- `apiKey: <key>` header (Smithery gateway forwards this way)

Config schema for Smithery:
```json
{
  "type": "object",
  "properties": {
    "apiKey": {
      "type": "string",
      "description": "APIbase API key (format: ak_live_...)"
    }
  },
  "required": ["apiKey"]
}
```

## Publish / Update Workflow

### When to republish

Republish to Smithery after ANY of these changes:
- New provider adapter added (new tools)
- Tools removed or renamed
- Tool schemas changed
- Server version bumped

### How to republish (CLI)

```bash
# Load API key from .env
source .env

# Republish — Smithery re-scans the server and picks up all current tools
SMITHERY_API_KEY="$SMITHERY_API_KEY" npx @smithery/cli mcp publish \
  "https://apibase.pro/mcp" \
  -n "apibase-pro/api-hub" \
  --config-schema '{"type":"object","properties":{"apiKey":{"type":"string","description":"APIbase API key"}},"required":["apiKey"]}'
```

### How to republish (Web UI fallback)

1. Go to https://smithery.ai/servers/apibase-pro/api-hub/releases
2. Click "Publish"
3. Enter scan credentials: API key from `.env` (`SMITHERY_SCAN_KEY`)
4. Click Connect — Smithery re-scans and updates tool list

## Execution Steps

### /smithery publish

1. Verify API container is healthy: `sudo docker compose ps api`
2. Verify MCP endpoint responds: `curl -s -X POST https://apibase.pro/mcp ...`
3. Count current tools from MCP response
4. Check `.env` for `SMITHERY_API_KEY`
5. If key exists: run CLI publish command
6. If key missing: instruct user to create at smithery.ai/account/api-keys or use web UI
7. Verify publish succeeded
8. Report: tools count, publish status, listing URL

### /smithery status

1. Fetch listing info from Smithery
2. Compare tool count: Smithery vs local MCP server
3. Report any drift (tools added locally but not yet published)

## Integration with /onboard-provider

The `/onboard-provider` skill should trigger `/smithery publish` as its final step after:
1. Adapter built and deployed
2. Tools seeded in database
3. Smoke tests pass
4. MCP server returns the new tools

This ensures Smithery always reflects the current tool catalog.

## Scan Credentials

For Smithery to scan our server, it needs a valid API key. A dedicated key is stored in `.env`:

```
SMITHERY_SCAN_KEY=<ak_live_... key used for Smithery scanning>
```

This key was auto-registered when first connecting to Smithery. Keep it stable — changing it requires updating Smithery connection settings.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Smithery scan fails 401 | Check `apiKey` header support in `src/mcp/server.ts` `extractApiKey()` |
| Tool count mismatch | Some tools may lack schemas — check `tool-adapter.ts` registration warnings |
| Publish auth fails | Regenerate API key at smithery.ai/account/api-keys, update `.env` |
| "Method not found" warnings | Expected — we don't serve MCP resources or prompts, only tools |
