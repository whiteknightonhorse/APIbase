# Integrator — AI payment

## Offer

Sell to AI agents. One link on your site, and a buyer's agent places and pays the order by itself. USDC settles to your wallet. {{INTEGRATOR_FEE_PCT}} fee.

- Connect AI payment: /integrator/connect
- View the demo shop: /m/apibase-demo

Merchants connected so far: {{MERCHANTS_COUNT}}.

## How it works

1. merchant site → link /m/<slug>
2. buyer's AI agent → storefront (MCP, only your tools)
3. quote → fixed price, single-use nonce
4. pay → USDC over x402 (Base) or MPP (Tempo)
5. settle → your wallet — APIbase never holds the money

The buyer's agent finds the storefront, sees only your tools, gets a quote and pays it in USDC over x402 (Base) or MPP (Tempo), straight to your wallet. APIbase does not hold your money. See /integrator/why-base-tempo.

## What your buyer's agent sees

An abstract shop page with a product and a button "Buy with your AI agent". The button is a plain link (variant A below). Real flow: /m/apibase-demo.

## Four ways to add it

All four are markup or a link; nothing to install and no script from us. Replace `<slug>` and `<sku>`.

A. Button at the product:

```
<a href="https://apibase.pro/m/<slug>/p/<sku>" rel="alternate payment" class="apibase-ai-buy">Buy with your AI agent</a>
```

B. Button at checkout (cart link):

```
<a href="https://apibase.pro/m/<slug>/cart?items=<sku>:1,<sku>:2" rel="alternate payment">Buy with your AI agent</a>
```

C. "AI purchase" block on the home page:

```
<p>AI purchase: AI agents can buy here. <a href="https://apibase.pro/m/<slug>">Open our AI storefront</a></p>
```

D. Machine markup only:

```
<link rel="alternate" type="application/json" href="https://apibase.pro/m/<slug>/agent.json">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Offer","potentialAction":
 {"@type":"BuyAction","target":"https://apibase.pro/mcp/m/<slug>"}}
</script>

# llms.txt on your site
AI agents can buy here: https://apibase.pro/m/<slug>/llms.txt
```

Website builders: /integrator/platforms/shopify, /integrator/platforms/woocommerce, /integrator/platforms/tilda, /integrator/platforms/wix, /integrator/platforms/custom.

## Connect in 10 minutes

You, by hand:

1. Open /integrator/connect, fill in the form, tick the box for the four documents and sign with your wallet.
2. Copy your API key. It is shown once.
3. Upload your catalog (REST or the merchant tools) and add the `__apibase_test` item at $0.01.
4. Paste link A, B, C or D into your site.
5. Run the check (next section).

Your agent: give it /integrator/agent-guide. Every step is an exact call with its error codes. It needs a wallet with USDC on Base or Tempo and an x402/MPP client for the last step.

## Sandbox and the connection check

{{SANDBOX_STATUS}}

The check runs five steps: `storefront_initialize`, `tools_list_6`, `quote_test_sku`, `webhook_ping`, `payment_verified`. Call `shop.merchant.check` or `GET /api/v1/shop/merchants/me/check` with your key; anyone can read the statuses at `/integrator/check/<slug>`.

- `connected`: the first four steps have no failure.
- `payment_verified`: a paid test order made by your own agent exists.

## Fee and minimums

Fee: {{INTEGRATOR_FEE_PCT}}. Minimum order: {{INTEGRATOR_MIN_ORDER}}. The test item carries no fee.

- Tempo (MPP): when the fee is on, it is taken inside the buyer's transaction as a split; you receive the rest directly.
- Base (x402): the fee is not in the transaction. You receive the full amount; the fee is recorded as a receivable and billed to you by invoice.

While the fee is off, nothing is recorded or charged on either rail.

Why Base and Tempo: Base: USDC is native; x402 is an open Coinbase protocol for paying HTTP requests in USDC; our facilitator settles. Tempo: settlement and network fees in a stablecoin; native splits and sessions (MPP). Full text: /integrator/why-base-tempo.

## Security: what you can verify

- The quote's `pay.x402.payTo` is your payout wallet. It is never the platform wallet; compare it with the transfer on a block explorer.
- The buyer signs an authorization for the exact quoted total to that exact address; the nonce is single-use.
- Goods are delivered only after the USDC transfer has a successful receipt.
- Webhooks are signed with HMAC-SHA256 over the raw body; URLs must be https and public, redirects are not followed.
- Your API key is shown once; APIbase stores only its hash. APIbase takes no card data.
- Every product passes rule-based moderation before buyers see it.

What stays outside our guarantees: spending limits belong to the buyer's wallet; human confirmation belongs to the buyer's agent client; safekeeping of your key is yours; refunds are the seller's duty (see the refund framework).

## Questions

- Does APIbase hold the money? No. The buyer pays your payout wallet directly.
- What can I sell? Digital items in the allowed categories (/legal/aup). Physical goods are not available yet.
- Which wallet do I need? One that receives USDC on Base or Tempo. APIbase issues no wallets: see /integrator/wallet.
- Which countries are served? The list is in the AUP. Others get `country_not_supported` (403).
- What if a payment is slow? The order stays `PAYING` (202 `payment_pending`) and a job reconciles it against the chain.
- Who is APIbase in this deal? Read /legal/merchant-agreement: APIbase is a technology intermediary, and the fee is charged to the seller.

## Legal documents

Drafts, not yet published. A page shows its banner until the operator publishes it.

- /legal/merchant-agreement
- /legal/aup
- /legal/dpa
- /legal/refund-framework
- /legal/index.json (hashes)

## Make your site easy for agents

Do AI agents visit your site? Check on AIpush.app: https://aipush.app. It shows how agents see your site and what to fix.

## For buyers

Add a storefront URL `https://apibase.pro/mcp/m/<slug>` to your agent's MCP client, or find shops with `apibase.discover` (`kind: merchant`). Limits live in your wallet, the quote fixes the price, and nobody asks for your keys. Details: /integrator/buyers.
