# x402 vs MPP

> An agent with a Base wallet pays with x402; an agent with a Tempo wallet pays with MPP. Both rails are accepted on the same APIbase endpoints at the same listed price per call, and both return a public receipt. They differ in what happens when the provider fails.

Use one rail per request, never both. Prices are on [/pricing](/pricing); the connection steps are on [/connect](/connect); the reason for a single endpoint is on [/why](/why).

## What each rail is

**x402** is HTTP 402 Payment Required used as a payment protocol. The server answers a priced call with a 402 challenge naming the price. The agent's wallet signs an EIP-3009 `transferWithAuthorization` for USDC on Base mainnet and retries with it in the `X-PAYMENT` header. Over MCP the same payment can travel in `params._meta["x402/payment"]`. APIbase's self-hosted facilitator settles it on-chain.

**MPP** is the Machine Payments Protocol on Tempo. The agent signs a credential for each call with the `mppx` SDK against a Tempo wallet (chain 4217) and sends it as `Authorization: Payment <credential>`, or as `Payment-Authorization: Payment <credential>` next to a Bearer key. The currency is USDC.e on Tempo mainnet.

## Side by side

| | x402 | MPP |
|---|---|---|
| Network and asset | USDC on Base mainnet | USDC.e on Tempo mainnet (chain 4217) |
| What the agent signs | An EIP-3009 transfer authorization | A credential for each call |
| Header | `X-PAYMENT` | `Authorization: Payment` |
| Client | An x402 client | `mppx` 0.6.16 or newer, with `polyfill: false` |
| Settlement | After a delivered response, by the self-hosted facilitator | Before the provider call |
| Provider fails | Not settled: nothing leaves the wallet | Refund owed, paid out by the operator |
| Same lookup again within 2 minutes | Answered from cache and not charged | Charged again |
| First payment from a new wallet | Creates the agent identity | Creates the agent identity |
| Receipt | Public, `X-APIbase-Receipt` header | Public, `X-APIbase-Receipt` header |

A replayed MPP credential is refused with 403 `credential_replayed`.

## When an agent picks which

- The wallet decides. A Base wallet with USDC signs x402; a Tempo wallet with USDC.e signs MPP.
- An agent that already uses Base Account or the Base MCP uses x402.
- An agent starting from a fresh Tempo wallet with no prior registration uses MPP: the first payment is the signup. The same holds for x402 on Base. Details: [/connect](/connect).
- An agent that must never be charged for a failed provider call picks x402, because an unsettled authorization moves no funds.
- An agent that repeats identical cacheable lookups picks x402 for the two-minute no-charge window. The response carries `X-APIbase-Charged: false` and the original receipt.

## Refunds per rail

<!-- refund-truth: re-word when REFUND-WALLET-1026 lands -->The “Provider fails” row of the table is the short form. The full statement, kept current, is in [/pricing#refunds](/pricing#refunds).

## Receipts

Each billed call on either rail has a public, immutable receipt at `https://apibase.pro/r/<receipt_id>.json`. What a receipt contains is in the [privacy policy](/privacy).

## Related

- [What is an MCP gateway](/what-is-an-mcp-gateway)
- [FAQ](/faq)
- [Pricing](/pricing)
