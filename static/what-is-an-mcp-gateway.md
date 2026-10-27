# What is an MCP gateway?

> An MCP gateway is one Model Context Protocol endpoint that exposes the tools of many providers, so an agent connects once instead of connecting to one MCP server per provider. APIbase is an MCP gateway with a REST twin: `POST https://apibase.pro/mcp` or the REST routes under `/api/v1`.

The live counts of tools and providers are in [/llms.txt](/llms.txt) and in [/.well-known/site-facts.json](/.well-known/site-facts.json), not on this page.

## One endpoint instead of many servers

An MCP server normally exposes the tools of one provider. An agent that needs ten providers then holds ten connections, ten sets of credentials and ten tool lists. A gateway replaces them with one connection and one tool list. On APIbase that connection needs no signup and no key to start: the first payment, on either [rail](/x402-vs-mpp), creates the agent identity.

```
{ "mcpServers": { "apibase": { "url": "https://apibase.pro/mcp", "transport": "streamable-http" } } }
```

Per-client configuration is on [/frameworks](/frameworks).

## How discovery works here

Call the `apibase.discover` MCP tool, or `GET /api/v1/discover?intent=...` over REST. Both are free and need no authentication. Arguments are `intent`, `category` and `max_price_usd`. Matches are ranked by relevance, then quality, then price, and each match carries its pricing, payment rails, availability and quality signal.

With no arguments the call returns the best matches across the whole catalog. Every tool stays callable through `tools/call` whether or not discovery returned it. The full catalog is at [/api/v1/tools](/api/v1/tools) for agents that prefer to cache it and search locally. The step-by-step version is on [/why](/why).

## What happens on a call

A priced call without payment gets an HTTP 402 challenge with the exact price. The agent pays and retries, and the gateway runs the request against the upstream provider. A call to a free tool needs no payment. Prices and tiers: [/pricing](/pricing).

## What is not promised

- A different provider's answer is never substituted for the one that was requested. A failed call returns an error.
- A tool whose free upstream quota is exhausted is withdrawn until it resets, and answers 503 `tool_unavailable` with `retry_after` before any payment challenge.
- There is no self-service top-up balance. A balance exists only as refund credit.
- On MPP a provider failure means a refund owed and paid by the operator, not an automatic refund. See [/pricing#refunds](/pricing#refunds).
- Content sent to action tools (messages, calls, posts) is screened first. See [/policy/moderation](/policy/moderation).

## Related

- [x402 vs MPP](/x402-vs-mpp)
- [FAQ](/faq)
- [Why APIbase](/why)
