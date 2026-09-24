# auth.md

APIbase is a pay-per-call MCP/REST gateway. **Most tools need no registration at all** — send an
x402 payment header (`X-Payment`, USDC on Base) or an MPP payment header (`Authorization: Payment`,
USDC.e on Tempo) on your very first call, and APIbase provisions an agent record for that wallet
automatically. No signup, no API key, no ceremony.

If you want a reusable credential ahead of payment — for the free tier, for rate-limit tracking, or
because your OAuth client library expects Dynamic Client Registration — three equivalent paths exist.
All three hand back the same kind of credential: an opaque `api_key`, used as
`Authorization: Bearer <api_key>` (or `X-API-Key: <api_key>`) on every later call.

## Discover

```http
GET /.well-known/oauth-protected-resource
GET /.well-known/oauth-authorization-server
```

Both are served from `https://apibase.pro` with issuer `https://apibase.pro` — resource server and
authorization server are the same host. The authorization server's `agent_auth` block points back to
this document.

## Register — pick one

- **Anonymous, no body.** `POST /api/v1/agents/auto` fingerprints the caller by IP plus the
  `X-Agent-Name` header (falls back to `User-Agent`) and returns `{ agent_id, api_key, tier }`.
  Calling it again with the same fingerprint before the fingerprint expires returns the existing
  `agent_id` without re-issuing a key.
- **Named.** `POST /api/v1/agents/register` with `{ "agent_name": "...", "agent_version": "..." }`
  returns the same `{ agent_id, api_key }` shape, tied to the name you gave instead of a fingerprint.
- **RFC 7591 Dynamic Client Registration**, for OAuth-speaking clients: `POST /oauth/register` with an
  optional `{ "client_name": "..." }` body, no client authentication required. Returns
  `{ client_id, client_secret, client_id_issued_at, client_secret_expires_at, grant_types,
  token_endpoint_auth_method, client_name }`. `client_id` is the `agent_id`, `client_secret` is the
  `api_key` — same credential, RFC field names.

## Get a token (OAuth path only)

```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=<client_id>&client_secret=<client_secret>
```

Returns `{ access_token, token_type: "Bearer", expires_in }`. `access_token` is the same `api_key`
you already hold — there is no separate token-issuance pipeline or JWT here, this endpoint exists for
clients that only speak `client_credentials`.

## Use it

```http
Authorization: Bearer <api_key>
```

on every call to `/mcp` or `/api/v1/*`.

## What this is not

There is no claim ceremony, no identity-assertion exchange, no verified-email requirement, and no
revocation webhook. Every credential above is self-issued and anonymous — APIbase never asks for or
checks a real-world identity. Cutting off an agent's access is an operator action on its account
status, not a self-service call.
