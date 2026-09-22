# Why APIbase

> One MCP + REST endpoint to APIbase's live tool catalog (counts: <https://apibase.pro/llms.txt>).
> No signup, no subscription, no API key to start — pay per call in USDC (x402 on Base or MPP on Tempo).

An agent that needs an external capability goes through the same four steps regardless of
which provider ends up serving the call: **discover** that a tool exists, **evaluate**
whether it fits (price, schema, availability), **pay** for it, and **execute** the call.
APIbase is built around making all four steps happen against one endpoint instead of one
per provider.

## 1. DISCOVER

Call the `apibase.discover` MCP tool, or `GET /api/v1/discover?intent=...` over plain REST —
both free ($0), no authentication required.

```
GET https://apibase.pro/api/v1/discover?intent=search+flights&max_price_usd=0.01
```

Discovery ranks by relevance, then quality, then price, and returns each match's pricing,
payment rails, availability, and quality signal in the same response. The full catalog is
also fetchable directly at <https://apibase.pro/api/v1/tools> for agents that prefer to
cache it and search client-side.

## 2. EVALUATE

Every tool entry carries what's needed to decide whether to call it, before spending
anything:

- `pricing.price_usd` — the sticker price for that specific call
- `tier` — micro / standard / premium, so an agent can filter by wallet size
- `input_schema` — JSON Schema for the call body, validated before sending
- `min_balance_usd` — the balance a wallet should hold before attempting the call

This is the same JSON the live server returns to any HTTP client — checkable directly at
<https://apibase.pro/api/v1/tools>, not a claim that has to be taken on trust.

## 3. PAY

A priced tool call without a payment header gets back an HTTP 402 challenge naming the
exact price and rail options. Two independent rails are accepted on the same endpoints:

| Rail | Network / asset | Header |
|---|---|---|
| x402 | USDC on Base mainnet | `X-PAYMENT` |
| MPP | USDC on Tempo mainnet | `Authorization: Payment` |

Neither rail requires a prior signup step — a correctly signed first payment is enough to
create agent credentials. Full mechanics: <https://apibase.pro/connect>.

## 4. EXECUTE

`tools/call` (MCP) or the equivalent REST call runs the request against the upstream
provider. Payment is escrow-first and the call is idempotent by design; a failed provider
call is never billed — only a delivered response is charged.

## How this compares by class

Comparing by class, not by name:

| Class | What you connect to | Before the first paid call |
|---|---|---|
| Single MCP server | One provider's own tools | Usually nothing for that one provider — but it's still only that one provider |
| MCP marketplace / registry | A directory listing of other people's MCP servers | You still connect to, and often authenticate against, each listed server separately |
| API marketplace (REST) | A directory of individual REST APIs | Signup and an API key per provider |
| Unified gateway with signup | Multiple providers behind one endpoint | Signup and an API key for the gateway |
| APIbase | Multiple providers behind one MCP + REST endpoint | Nothing — the first paid call creates agent credentials automatically |

## Answers for specific needs

- [Flight search API without integrating individual providers](https://apibase.pro/flight-search-intent)
- [Image generation API with pay-per-call access for AI agents](https://apibase.pro/image-generation-intent)
- [Tools for company research](https://apibase.pro/company-research-intent)
