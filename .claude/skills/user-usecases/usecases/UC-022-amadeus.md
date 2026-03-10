# UC-022: Amadeus Travel APIs

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-022 |
| **Provider** | Amadeus for Developers (developers.amadeus.com) |
| **Category** | Travel / Flights / Hotels / Airports |
| **Date Added** | 2026-03-10 |
| **Status** | Draft |
| **Client** | APIbase (Self-Service) |

---

## 1. Client Input Data

APIbase registered at developers.amadeus.com as "APIbase" app.

```
Type:                    Value:
──────────────────────────────────────────────────────────
API Key                  [from Amadeus My Apps dashboard]
API Secret               [from Amadeus My Apps dashboard]
App Name                 APIbase
Environment              Self-Service (test → production)
Auth Method              OAuth2 Client Credentials
Token Endpoint           https://api.amadeus.com/v1/security/oauth2/token
Base URL (test)          https://test.api.amadeus.com
Base URL (prod)          https://api.amadeus.com
```

### Sufficiency Assessment

| Data provided | What it enables | Sufficient? |
|---------------|----------------|-------------|
| API Key + Secret | OAuth2 token generation, access to all Self-Service APIs | **Yes** |
| App registered | Production access with free quota + pay-as-you-go | **Yes** |
| No validation needed | We do NOT use Flight Create Orders (booking) — search only | **Yes** |

**Verdict:** API Key + Secret is sufficient for all read-only travel data tools. No booking validation required.

---

## 2. Provider API Analysis

### Platform: Amadeus Self-Service

Amadeus is the world's largest GDS (Global Distribution System). Self-Service APIs provide instant access to real-time flight data, hotel search, airport info, and travel recommendations via REST + OAuth2.

### Authentication

```
POST /v1/security/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id={API_KEY}&client_secret={API_SECRET}
```

Returns `access_token` (Bearer), expires in 1799 seconds (~30 min). Token must be cached and refreshed.

### API Architecture

| Service | Base URL | Auth | Description |
|---------|----------|------|-------------|
| **Flight Offers Search** | `/v2/shopping/flight-offers` | Bearer | Real-time flight search (GET + POST) |
| **Flight Offers Price** | `/v1/shopping/flight-offers/pricing` | Bearer | Confirm pricing for selected offer |
| **On Demand Flight Status** | `/v2/schedule/flights` | Bearer | Real-time flight status |
| **Airport & City Search** | `/v1/reference-data/locations` | Bearer | IATA code lookup, autocomplete |
| **Airport Nearest Relevant** | `/v1/reference-data/locations/airports` | Bearer | Nearest airports by coordinates |
| **Airport Routes** | `/v1/airport/direct-destinations` | Bearer | Direct destinations from airport |
| **Airline Code Lookup** | `/v1/reference-data/airlines` | Bearer | IATA/ICAO airline codes |
| **Airline Routes** | `/v1/airline/destinations` | Bearer | Airline destinations |
| **Travel Recommendations** | `/v1/reference-data/recommended-locations` | Bearer | Recommended destinations |
| **SeatMap Display** | `/v1/shopping/seatmaps` | Bearer | Aircraft seat maps |
| **Branded Fares Upsell** | `/v1/shopping/flight-offers/upselling` | Bearer | Upsell branded fare options |
| **Flight Availabilities** | `/v1/shopping/availability/flight-availabilities` | Bearer | Seat availability search |
| **Flight Check-in Links** | `/v2/reference-data/urls/checkin-links` | Bearer | Airline check-in URLs |

### Rate Limits

| Environment | TPS | Parallelization |
|-------------|-----|-----------------|
| Test | 10 TPS | 1 req / 100ms |
| Production | 40 TPS | Full parallelization |

---

## 3. Pricing — Amadeus Cost to APIbase

### Free Quota (per month, both test and production)

| API | Free Requests/mo | Transaction Fee (beyond free) |
|-----|----------------:|------------------------------:|
| Flight Offers Search (GET/POST) | 2,000 | **€0.025** |
| Flight Offers Price | 3,000 | **€0.015** |
| Flight Create Orders | 10,000 | €0.04 |
| Flight Order Management | 5,000 | €0.0025 |
| SeatMap Display | 1,000 | €0.015 |
| Branded Fares Upsell | 3,000 | €0.015 |
| Flight Availabilities Search | 3,000 | €0.015 |
| Travel Recommendations | 10,000 | €0.0025 |
| On Demand Flight Status | 2,000 | €0.0025 |
| Airport & City Search | 7,000 / 3,000 | €0.0025 |
| Airport Nearest Relevant | 10,000 | €0.0025 |
| Airport Routes | 3,000 | €0.0025 |
| Flight Check-in Links | 10,000 | €0.0025 |
| Airline Code Lookup | 10,000 | €0.0025 |
| Airline Routes | 3,000 | €0.0025 |

**Note:** 90% discount on Flight Offers Search + Flight Offers Price if using Flight Create Orders in production with paid bookings. Not applicable to us (search-only).

**Taxes not included** in listed prices. May apply depending on country.

### Cost Analysis for APIbase

**Expensive APIs** (Flight Search/Price):
- Flight Offers Search: €0.025 (~$0.027) per call beyond 2,000/mo
- Flight Offers Price: €0.015 (~$0.016) per call beyond 3,000/mo
- These are our MOST REQUESTED tools — must price above cost

**Cheap Reference APIs** (€0.0025 = ~$0.0027):
- Airport Search, Airlines, Flight Status, Routes, Check-in Links
- High free quotas (3,000–10,000/mo), very cheap beyond
- Profitable at $0.003/call

---

## 4. APIbase Wrapper Design

### Phase 1 Tools (Read-Only, 7 tools)

| tool_id | Amadeus API | APIbase Price | Amadeus Cost | cache_ttl | Free/mo |
|---------|-------------|--------------|-------------|-----------|---------|
| `amadeus.flight_search` | Flight Offers Search | **$0.035** | €0.025 | 300 | 2,000 |
| `amadeus.flight_price` | Flight Offers Price | **$0.020** | €0.015 | 60 | 3,000 |
| `amadeus.flight_status` | On Demand Flight Status | $0.005 | €0.0025 | 60 | 2,000 |
| `amadeus.airport_search` | Airport & City Search | $0.003 | €0.0025 | 3600 | 7,000 |
| `amadeus.airport_nearest` | Airport Nearest Relevant | $0.003 | €0.0025 | 3600 | 10,000 |
| `amadeus.airport_routes` | Airport Routes | $0.003 | €0.0025 | 3600 | 3,000 |
| `amadeus.airline_lookup` | Airline Code Lookup | $0.002 | €0.0025 | 86400 | 10,000 |

**Pricing rationale:**
- Flight Search: $0.035 covers €0.025 cost (~$0.027) + ~30% margin
- Flight Price: $0.020 covers €0.015 cost (~$0.016) + ~25% margin
- Reference APIs: $0.002–0.005, mostly served from free quota = pure profit
- Within free quota: 100% margin on all tools

### Phase 2 Tools (Optional, later)

| tool_id | Amadeus API | Price | Notes |
|---------|-------------|-------|-------|
| `amadeus.seatmap` | SeatMap Display | $0.020 | 1,000 free/mo |
| `amadeus.upsell` | Branded Fares Upsell | $0.020 | 3,000 free/mo |
| `amadeus.availability` | Flight Availabilities | $0.020 | 3,000 free/mo |
| `amadeus.travel_recommendations` | Travel Recommendations | $0.005 | 10,000 free/mo |
| `amadeus.checkin_links` | Flight Check-in Links | $0.003 | 10,000 free/mo |

### Level 1: Protocol Adapter

```
src/adapters/amadeus/
├── index.ts          # AmadeusAdapter extends BaseAdapter
├── auth.ts           # OAuth2 token management (cache + auto-refresh)
└── types.ts          # Amadeus-specific response types
```

- OAuth2 token cached in memory with TTL (1799s - 60s buffer = 1739s)
- All requests use Bearer token in Authorization header
- Base URL: `https://api.amadeus.com` (production)
- Provider timeout: 10s (Amadeus can be slow for complex searches)

### Level 2: Semantic Normalizer

Amadeus responses are deeply nested JSON. Normalize to flat, agent-friendly format:

```typescript
// Amadeus raw: data[].itineraries[].segments[].departure.iataCode
// APIbase normalized: flights[].segments[].from
```

### Level 3: Attribution

No referral/builder mechanism. Revenue comes purely from markup pricing (APIbase price > Amadeus cost).

---

## 5. MCP Tool Definitions

### amadeus.flight_search

```json
{
  "name": "amadeus.flight_search",
  "description": "Search for real-time flight offers between airports. Returns prices, airlines, stops, and duration.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "origin": { "type": "string", "description": "Departure airport IATA code (e.g. JFK)" },
      "destination": { "type": "string", "description": "Arrival airport IATA code (e.g. LHR)" },
      "departure_date": { "type": "string", "description": "Departure date YYYY-MM-DD" },
      "return_date": { "type": "string", "description": "Return date YYYY-MM-DD (optional, omit for one-way)" },
      "adults": { "type": "integer", "description": "Number of adult passengers (1-9)", "default": 1 },
      "travel_class": { "type": "string", "enum": ["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"], "default": "ECONOMY" },
      "nonstop": { "type": "boolean", "description": "Direct flights only", "default": false },
      "max_results": { "type": "integer", "description": "Max results (1-50)", "default": 10 },
      "currency": { "type": "string", "description": "Currency code (USD, EUR, etc.)", "default": "USD" }
    },
    "required": ["origin", "destination", "departure_date"]
  }
}
```

### amadeus.flight_price

```json
{
  "name": "amadeus.flight_price",
  "description": "Confirm and get final pricing for a flight offer. Use after flight_search to verify price before booking.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "flight_offer": { "type": "object", "description": "Flight offer object from flight_search result" }
    },
    "required": ["flight_offer"]
  }
}
```

### amadeus.flight_status

```json
{
  "name": "amadeus.flight_status",
  "description": "Get real-time status of a specific flight (delays, cancellations, gate info).",
  "inputSchema": {
    "type": "object",
    "properties": {
      "carrier_code": { "type": "string", "description": "Airline IATA code (e.g. BA, AA)" },
      "flight_number": { "type": "string", "description": "Flight number (e.g. 123)" },
      "date": { "type": "string", "description": "Flight date YYYY-MM-DD" }
    },
    "required": ["carrier_code", "flight_number", "date"]
  }
}
```

### amadeus.airport_search

```json
{
  "name": "amadeus.airport_search",
  "description": "Search airports and cities by keyword or IATA code. Supports autocomplete.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "keyword": { "type": "string", "description": "Search term (city name, airport name, or IATA code)" },
      "subType": { "type": "string", "enum": ["AIRPORT", "CITY"], "description": "Filter by type" }
    },
    "required": ["keyword"]
  }
}
```

### amadeus.airport_nearest

```json
{
  "name": "amadeus.airport_nearest",
  "description": "Find nearest airports by geographic coordinates.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "latitude": { "type": "number", "description": "Latitude (-90 to 90)" },
      "longitude": { "type": "number", "description": "Longitude (-180 to 180)" },
      "radius": { "type": "integer", "description": "Search radius in km (default 500)", "default": 500 }
    },
    "required": ["latitude", "longitude"]
  }
}
```

### amadeus.airport_routes

```json
{
  "name": "amadeus.airport_routes",
  "description": "Get all direct flight destinations from an airport.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "airport_code": { "type": "string", "description": "Departure airport IATA code (e.g. JFK)" }
    },
    "required": ["airport_code"]
  }
}
```

### amadeus.airline_lookup

```json
{
  "name": "amadeus.airline_lookup",
  "description": "Look up airline details by IATA or ICAO code.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "airline_code": { "type": "string", "description": "IATA code (e.g. BA) or ICAO code (e.g. BAW)" }
    },
    "required": ["airline_code"]
  }
}
```

---

## 6. AI Instructions

```
You have access to Amadeus travel tools for real-time flight data:

- amadeus.flight_search — Search flights (origin, destination, date). Returns prices, airlines, duration.
- amadeus.flight_price — Confirm exact pricing for a flight offer from search results.
- amadeus.flight_status — Check real-time flight status (delays, cancellations).
- amadeus.airport_search — Find airports by name or IATA code.
- amadeus.airport_nearest — Find nearest airports by coordinates.
- amadeus.airport_routes — Get all direct destinations from an airport.
- amadeus.airline_lookup — Look up airline by IATA/ICAO code.

Workflow for flight booking assistance:
1. Use airport_search to resolve city names to IATA codes
2. Use flight_search to find available flights
3. Use flight_price to confirm pricing for selected offer
4. Present results with prices, duration, stops, and airline info

Always use IATA codes (3 letters) for airports. Dates must be YYYY-MM-DD format.
```

---

## 7. Traffic Flow Diagram

```
AI Agent
  │
  ├─ MCP tools/call: amadeus.flight_search
  │    │
  │    ▼
  │  APIbase Pipeline (13 stages)
  │    │
  │    ├─ AUTH (verify agent api_key)
  │    ├─ SCHEMA_VALIDATION (Zod: origin, destination, date)
  │    ├─ CACHE_OR_SINGLE_FLIGHT (Redis, TTL=300s for search)
  │    ├─ RATE_LIMIT (per-agent bucket)
  │    ├─ ESCROW ($0.035 charge)
  │    │
  │    ▼
  │  AmadeusAdapter
  │    ├─ OAuth2 token (cached, auto-refresh)
  │    ├─ GET /v2/shopping/flight-offers?origin=JFK&destination=LHR&...
  │    ├─ Response normalization
  │    │
  │    ▼
  │  ESCROW_FINALIZE → LEDGER_WRITE → CACHE_SET → RESPONSE
  │
  ▼
Agent receives normalized flight data
```

---

## 8. Monetization Model

| Revenue stream | Mechanism | Expected |
|---------------|-----------|----------|
| **Markup pricing** | APIbase price > Amadeus cost | 25-30% margin on flight search |
| **Free quota profit** | First 2,000-10,000 req/mo = zero cost | 100% margin early stage |
| **Reference API margin** | Airport/Airline lookups: $0.002-0.003 vs €0.0025 cost | Profitable at scale |
| **Caching savings** | 300s TTL on flight search reduces Amadeus calls | ~40% hit rate expected |

### Break-Even Analysis

| Scenario | Flight Search calls/mo | Amadeus cost | APIbase revenue | Profit |
|----------|----------------------:|-------------:|----------------:|-------:|
| Early (free tier) | 2,000 | €0 | $70 | **$70** |
| Growth | 10,000 | €200 (8K paid) | $350 | **$150** |
| Scale | 50,000 | €1,200 (48K paid) | $1,750 | **$550** |

Reference APIs (airport_search, airline_lookup, etc.) add ~$50-200/mo profit depending on volume, mostly from free quota.

---

## 9. Environment Variables

```
# Amadeus Self-Service API
AMADEUS_API_KEY=                    # From developers.amadeus.com
AMADEUS_API_SECRET=                 # From developers.amadeus.com
AMADEUS_BASE_URL=https://api.amadeus.com   # Production
# AMADEUS_BASE_URL=https://test.api.amadeus.com  # Test environment
```

---

## 10. Implementation Checklist

- [ ] Register app at developers.amadeus.com — **IN PROGRESS**
- [ ] Get API Key + Secret from dashboard
- [ ] Add env vars to `.env` and `src/config/env.ts`
- [ ] Create `src/adapters/amadeus/` adapter with OAuth2 token management
- [ ] Create `src/schemas/amadeus.schema.ts` (7 Zod schemas)
- [ ] Add 7 tools to `config/tool_provider_config.yaml`
- [ ] Register tools in `src/mcp/tool-adapter.ts`
- [ ] Add adapter to `src/adapters/registry.ts`
- [ ] Seed database with new tools
- [ ] Test in test environment first, then switch to production
- [ ] User sends API documentation — refine schemas accordingly

---

## 11. Lessons Learned

- Amadeus pricing is **expensive** for flight search (€0.025/call) — must price above cost, not flat $0.005
- Free quota (2,000/mo for search) is good for bootstrapping but will run out at scale
- Reference APIs (airports, airlines) are cheap and high-margin — good for agent utility
- OAuth2 token must be cached (~30min TTL) to avoid extra latency
- No referral/builder mechanism — pure markup model unlike Polymarket/Hyperliquid
- Test environment has limited data quality — production needed for real results
