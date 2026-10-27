# Frequently asked questions

> Short answers about identity, keys, payment, receipts, caching, limits, refunds, sanctions, counts, moderation and Integrator. Each answer links to the page that holds the full fact.

## Do I have to sign up?

No. Point an MCP client at `https://apibase.pro/mcp`. Your first payment, on x402 or MPP, creates your agent identity from the wallet. There is no dashboard signup, no email and no approval queue. Steps: [/connect](/connect).

## How do I get an API key?

Send one unauthenticated `POST https://apibase.pro/api/v1/agents/auto`. The reply holds an `agent_id` and an `api_key` starting `ak_live_`, on the free tier. Use it as `Authorization: Bearer`. Registration details: [/auth.md](/auth.md).

## Which payment rails are accepted?

x402 (USDC on Base) and MPP (USDC.e on Tempo). Use one per request. How they differ: [x402 vs MPP](/x402-vs-mpp).

## What does a call cost?

Every tool has a fixed published price: $0.0005–$29.99 per call (p90 $0.003). There is no plan, no included quota and no overage fee. Free tools cost $0. Tiers and per-tool prices: [/pricing](/pricing).

## How do I know what I was charged?

Each billed x402 or MPP call returns an `X-APIbase-Receipt` header with a public, immutable receipt at `https://apibase.pro/r/<receipt_id>.json`. What a receipt holds is in the [privacy policy](/privacy).

## Is a repeated call cached or charged twice?

A tool response is cached for its own TTL. On x402 an identical repeated lookup by the same wallet within 2 minutes is answered from cache and not charged; the response carries `X-APIbase-Charged: false`. On MPP a cache hit is billed in full. Details: [/pricing](/pricing).

## What are the rate limits?

The free tier allows 10 requests per second and 100 per day. Paid and enterprise tiers are higher. All three are on [/connect](/connect).

## What happens when the provider fails?

<!-- refund-truth: re-word when REFUND-WALLET-1026 lands -->On x402 a failed provider call is not settled, so nothing leaves your wallet. On MPP a refund is owed and paid out by the operator. Details: [/pricing#refunds](/pricing#refunds).

## Are payments screened for sanctions?

Yes. Paying wallets are screened before each settlement; a match is refused and the attempt is not charged. The countries and rules are in the [Terms, section 12a](/terms#12a-sanctions).

## Where do the tool and provider counts come from?

They are generated from the live catalog and published in [/llms.txt](/llms.txt) and [/.well-known/site-facts.json](/.well-known/site-facts.json). The catalog at [/api/v1/tools](/api/v1/tools) lists every tool with its status. This site does not repeat the numbers in prose.

## Is my content moderated?

Calls to action tools, which send a message, place a call or post content, are scanned against a fixed ruleset before they reach the provider. Every other tool is checked only against the child-safety rule. A blocked paid call is still charged and can be appealed within 14 days. Policy: [/policy/moderation](/policy/moderation).

## What is Integrator?

Integrator is AI payment for merchants: an MCP storefront for a shop, paid by AI agents straight to the merchant wallet. The fee and limits are stated once, on [/pricing](/pricing); the product is on [/integrator](/integrator).

## Related

- [x402 vs MPP](/x402-vs-mpp)
- [What is an MCP gateway](/what-is-an-mcp-gateway)
- [Why APIbase](/why)
