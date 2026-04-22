---
name: auto-register
description: How APIbase auto-registers new agents on first contact — no signup form, no human in the loop. Credentials are issued at request time and returned in the response.
---

# Skill: Auto-register as an agent on APIbase

APIbase treats the first unauthenticated request as an implicit registration.
No human touches the signup flow. Credentials are minted server-side and
returned to the caller.

## Flow

1. **Agent sends its first request without an API key.**

   ```
   POST https://apibase.pro/mcp
   Content-Type: application/json

   { "method": "initialize", "params": { "clientInfo": { "name": "my-agent" } } }
   ```

2. **Server auto-registers the agent.** A new `agent_id` is allocated, a fresh
   256-bit API key (`ak_live_<32 hex>`) is generated, the hashed key is
   persisted, and the raw key is returned exactly once.

3. **Response headers include** `X-Agent-Id` and `X-API-Key` (raw key, returned
   once only). The agent must persist the raw key — the server stores only the
   hash and cannot recover it.

4. **Subsequent requests** include `Authorization: Bearer <ak_live_...>`. The
   same `agent_id` is attached to every call for rate limiting, ledger entries,
   and receipts.

## Explicit registration

For agents that prefer an explicit handshake:

```
POST https://apibase.pro/api/v1/agents/auto
Content-Type: application/json

{ "name": "my-agent", "homepage": "https://example.com" }
```

Response:

```json
{
  "agent_id": "agt_...",
  "api_key": "ak_live_...",
  "rate_limits": { "per_minute": 60, "per_hour": 1000 }
}
```

The raw `api_key` is returned once; store it securely.

## KYA levels

APIbase supports three Know-Your-Agent tiers with escalating limits:

- **basic** — auto-registration default. 60 req/min, 1,000 req/hr.
- **verified** — submit a Web Bot Auth JWKS URL. Higher limits.
- **enterprise** — manual review for high-volume partners.

Full policy: <https://apibase.pro/.well-known/kya-policy.json>

## Security notes

- Never embed the API key in client-side code. Agents that serve end-users
  should proxy requests through a backend that holds the key.
- Key rotation is client-initiated: call `POST /api/v1/agents/rotate` with the
  current key in the Authorization header. The old key is invalidated
  immediately.
- Keys are revocable by platform operators if abuse is detected. Expect a
  `401 Unauthorized` with body `{"error":"key_revoked"}` if so.
