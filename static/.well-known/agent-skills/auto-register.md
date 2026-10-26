---
name: auto-register
description: How an agent gets an APIbase identity and a reusable API key — no signup form, no human in the loop. Your first payment creates the identity; three register endpoints return a key ahead of payment.
---

# Skill: Get an agent identity on APIbase

Canonical reference: <https://apibase.pro/auth.md>. This skill is the short form.

## Identity from the first payment

Your first payment (x402 or MPP) creates your agent identity, keyed to the paying
wallet. No key and no registration call are needed for paid tools.

## A reusable key ahead of payment

Pick one endpoint; all return the same kind of credential.

| Endpoint | Body | Returns |
|---|---|---|
| `POST /api/v1/agents/auto` | none (fingerprint of IP + `X-Agent-Name` or `User-Agent`) | `{agent_id, api_key, tier}` |
| `POST /api/v1/agents/register` | `{"agent_name": "...", "agent_version": "..."}` (explicit-name variant) | `{agent_id, api_key, tier}` |
| `POST /oauth/register` | optional `{"client_name": "..."}` (RFC 7591) | `{client_id, client_secret, ...}` where `client_id` is the `agent_id` and `client_secret` is the `api_key` |

```
curl -X POST https://apibase.pro/api/v1/agents/auto
```

The raw `api_key` (`ak_live_...`) is returned once; the server stores only a hash and
cannot recover it. Calling `/agents/auto` again with the same fingerprint returns the
existing `agent_id` without a new key.

Use the key on every later call: `Authorization: Bearer <api_key>`.

## Tiers and limits

Tiers are `free`, `paid` and `enterprise`; a new registration starts on `free`.
Limits: <!--rate-limits-->free: 10 requests per second, 100 per day; paid: 50 requests per second, 10,000 per day; enterprise: 200 requests per second, 100,000 per day<!--/rate-limits-->.

Policy: <https://apibase.pro/.well-known/kya-policy.json>

## Security notes

- Never embed the API key in client-side code. Agents that serve end-users should
  proxy requests through a backend that holds the key.
- There is no rotation endpoint and no revocation webhook. Rotation means registering
  a new identity; cutting off access is an operator action on the account.
