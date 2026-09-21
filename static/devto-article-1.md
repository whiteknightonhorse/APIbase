Your AI agent needs to search flights. It needs real-time stock prices. It needs to OCR a receipt image. Each of these requires a different API, a different auth flow, a different billing account.

What if the agent just... paid for each call itself? No subscriptions. No API key management. No human in the loop.

That's what I built. Here's how it works.

## The Problem: API Integration Is a Tax on Every Agent Builder

If you're building an AI agent that interacts with the real world, you already know the pain:

- Amadeus needs OAuth2 with double-base64 encoding
- Finnhub uses a query param token
- Serper wants an `X-API-KEY` header
- NASA uses `?api_key=` in the URL
- Some APIs charge per call, others per month, others per character

For each provider, you're writing auth code, error handling, retry logic, rate limiting, and billing integration. Multiply that by 10 providers and you've spent more time on plumbing than on your actual agent logic.

I wanted one endpoint where my agent sends a tool call, pays in USDC, and gets data back. No signup forms. No dashboards. No invoices.

## The Solution: MCP + x402 in One Pipeline

I built an MCP server that wraps 46 upstream API providers behind a single endpoint. The agent connects to `https://apibase.pro/mcp`, discovers 203 available tools, and calls any of them. Payment happens automatically via the x402 protocol — HTTP 402 with USDC on Base.

Here's what a single tool call looks like from the agent's perspective:

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "stocks.market.quote",
    "arguments": {
      "symbol": "AAPL"
    }
  }
}
```

The response comes back with the stock price. Behind the scenes, $0.001 in USDC was escrowed, the Finnhub API was called, and the payment was settled — all in under 400ms.

## The Multi-Stage Pipeline

Every tool call passes through a fixed sequence of stages in strict order. No stage can be skipped or reordered:

AUTH → IDEMPOTENCY → CONTENT_NEG → SCHEMA_VALIDATION → TOOL_STATUS → CACHE_OR_SINGLE_FLIGHT → RATE_LIMIT → ESCROW → PROVIDER_CALL → ESCROW_FINALIZE → LEDGER_WRITE → CACHE_SET → RESPONSE

Let me walk through the stages that matter most.

### Stage 1: AUTH

The agent authenticates with a Bearer token. On first request, the system auto-registers the agent and returns an API key — no human signup required.

```bash
curl -X POST https://apibase.pro/api/v1/agents/register \
  -H "Content-Type: application/json" \
  -d '{"agent_name": "my-agent", "agent_version": "1.0.0"}'
```

Returns `api_key: ak_live_...` — stored as SHA-256 hash in PostgreSQL, never in plaintext.

### Stage 4: SCHEMA_VALIDATION

Every tool has a Zod schema with `.describe()` on every field. The agent can't send garbage — invalid params are rejected at this stage with a clear error message, before any money moves.

```typescript
const search = z.object({
  q: z.string().min(1).describe('Search query'),
  gl: z.string().max(2).optional().describe('Country code (e.g. "us")'),
  num: z.number().int().min(1).max(100).optional().describe('Results count'),
}).strip();
```

### Stage 8: ESCROW

This is where it gets interesting. Before calling the upstream provider, we lock the tool's price in USDC:

| Tool | Price | What happens |
|------|-------|-------------|
| `finnhub.quote` | $0.001 | Escrow $0.001 USDC |
| `serper.web_search` | $0.002 | Escrow $0.002 USDC |
| `amadeus.flight_search` | $0.035 | Escrow $0.035 USDC |
| `stability.generate` | $0.070 | Escrow $0.070 USDC |

The USDC is reserved from the agent's balance in a PostgreSQL transaction. If the provider call fails, Stage 10 automatically refunds.

### Stage 9: PROVIDER_CALL

Now we actually call the upstream API. Each provider has a dedicated adapter that handles auth, request building, and response normalization.

What the agent sends:

```json
{"symbol": "AAPL"}
```

What our adapter sends to Finnhub:

`GET https://finnhub.io/api/v1/quote?symbol=AAPL&token=xxxxx`

What comes back to the agent (normalized):

```json
{
  "price": 249.94,
  "change": -4.06,
  "change_percent": -1.60,
  "high": 254.94,
  "low": 249.00,
  "open": 253.78,
  "previous_close": 254.00
}
```

The agent never sees the upstream API format, auth headers, or error codes. Every tool returns the same normalized structure.

### Stage 10: ESCROW_FINALIZE + LEDGER_WRITE

If the provider call succeeded: settle the escrow, write to the append-only ledger. If it failed: refund the USDC, write a REFUNDED ledger entry. This happens in a single PostgreSQL transaction — no partial state possible.

The ledger is append-only. We never UPDATE or DELETE rows. This gives us a complete audit trail of every payment.

## What 46 Providers Look Like Through One Pipe

Here's a sample of what agents can do through this single MCP endpoint:

| Category | Tools | Example |
|----------|-------|---------|
| Flights | amadeus.flight_search | Search JFK to LHR, real prices |
| Stocks | finnhub.quote, finnhub.candles | AAPL $249.94, OHLCV charts |
| Web Search | serper.web_search | Google results as JSON |
| AI Search | tavily.search | AI-synthesized answers + sources |
| News | news.latest, news.crypto | 180K+ sources, 200+ countries |
| Legal | courtlistener.search | US court opinions since 1995 |
| Real Estate | walkscore.score | Walk/Transit/Bike scores |
| Image Gen | stability.generate | Stable Diffusion from text |
| Email | resend.send_email | Transactional email delivery |
| OCR | ocr.extract_text | Text from image/PDF URL |

Each tool costs between $0.001 and $0.070 per call. The agent decides what to call based on the task. No subscriptions, no minimums.

## The Cache Layer: Why Most Calls Are Nearly Free

Stage 6 checks Redis before hitting the upstream provider. Each tool has a configured TTL:

- **finnhub.quote** — 5 seconds (stock prices change fast)
- **walkscore.score** — 7 days (walkability scores rarely change)
- **news.latest** — 1 minute (news updates frequently)
- **courtlistener.search** — 1 hour (court opinions are historical)

If 100 agents request AAPL's stock price in the same 5-second window, only one upstream call happens. The other 99 get the cached result instantly — still billed, but at a lower cache-hit price, and the upstream provider sees only one request.

Single-flight deduplication prevents thundering herd: concurrent identical requests wait for the first one to complete rather than all hitting the provider simultaneously.

## What I Learned Building This

**1. Escrow-first is non-negotiable.** Early versions charged after the provider call. But if the agent disconnected mid-response, we'd already incurred upstream cost with no payment. Escrow-before-call eliminates this entirely.

**2. Idempotency prevents double charges.** Agents retry on timeout. Without idempotency keys, a single flight search could charge the agent twice. Stage 2 catches duplicates before any work happens.

**3. Fail-closed beats fail-open.** When Redis goes down, we reject all requests rather than disabling rate limits and caching. This sounds aggressive, but it prevents a single Redis restart from causing a cascade of unthrottled upstream calls.

**4. Every stage sounds like overhead, but each one prevents a real production bug.** We removed a stage once (content negotiation) and immediately got agents sending XML to JSON-only providers. Every stage exists because we hit the bug it prevents.

## Try It Yourself

Connect any MCP client to the endpoint and discover the tools:

```bash
curl -X POST https://apibase.pro/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

Or add it to Claude Desktop / Cursor:

```json
{
  "mcpServers": {
    "apibase": {
      "url": "https://apibase.pro/mcp"
    }
  }
}
```

203 tools. One endpoint. The agent pays for what it uses.

---

*Built with [APIbase](https://apibase.pro) — open source on [GitHub](https://github.com/whiteknightonhorse/APIbase).*
