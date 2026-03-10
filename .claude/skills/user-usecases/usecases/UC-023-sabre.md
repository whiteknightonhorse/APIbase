# UC-023: Sabre GDS — Flight Search & Travel Data

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-023 |
| **Provider** | Sabre Dev Studio (developer.sabre.com) |
| **Category** | Travel / Flights / Airlines / Destinations |
| **Date Added** | 2026-03-10 |
| **Status** | Live (cert environment) |
| **Client** | APIbase |

---

## 1. Client Input Data

APIbase registered at developer.sabre.com.

```
Type:                    Value:
──────────────────────────────────────────────────────────
Client ID                V1:fcs01nfyevgw9ze8:DEVCENTER:EXT
Client Secret            O2j0uyJT
Auth Method              OAuth2 Client Credentials (double base64)
Token Endpoint           https://api-crt.cert.havail.sabre.com/v2/auth/token
API Base URL             https://api-crt.cert.havail.sabre.com
Token TTL                604,800 seconds (7 days)
Environment              Cert (test) — returns REAL data
```

### Sufficiency Assessment

| Data provided | What it enables | Sufficient? |
|---------------|----------------|-------------|
| Client ID + Secret | OAuth2 token, access to cert APIs | **Yes** |
| Cert environment | Real flight data, real prices, no booking | **Yes** |
| No commercial contract | 4 APIs work, enterprise APIs blocked (BFM, SeatMap) | **Yes for Phase 1** |

**Verdict:** Credentials sufficient for 4 read-only tools. Production requires commercial contract ($500-5000/mo).

---

## 2. Provider API Analysis

### Platform: Sabre Dev Studio

Sabre is the #2 GDS worldwide (after Amadeus). The cert environment returns real data from the global Sabre system — actual flights, actual prices, actual airlines.

### Authentication

Sabre uses **double base64** encoding (non-standard):

```
step1 = base64(clientId)
step2 = base64(clientSecret)
step3 = base64(step1 + ":" + step2)

POST /v2/auth/token
Authorization: Basic {step3}
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
```

Returns `access_token` (Bearer), TTL: 604,800s (7 days).

### Available APIs

| API | Endpoint | Status | Description |
|-----|----------|--------|-------------|
| **InstaFlights Search** | `/v1/shop/flights` | **200 OK** | Real-time flight search with prices |
| **Destination Finder** | `/v2/shop/flights/fares` | **200 OK** | Cheapest fares from origin |
| **Airlines Lookup** | `/v1/lists/utilities/airlines` | **200 OK** | Full airline database |
| **Travel Themes** | `/v1/shop/themes` | **200 OK** | 12 themed destination categories |
| Bargain Finder Max | N/A | **404** | Requires separate subscription |
| SeatMap | N/A | **404** | Enterprise-only |
| GeoCode | N/A | **404** | Enterprise-only |
| Low Fare Forecast | N/A | **404** | Not in base plan |

### Rate Limits

Cert environment: no documented hard limits. Token valid for 7 days.

---

## 3. Tool Mapping

| tool_id | Sabre API | Method | Price | cache_ttl |
|---------|-----------|--------|-------|-----------|
| `sabre.search_flights` | InstaFlights `/v1/shop/flights` | GET | $0.010 | 300 |
| `sabre.destination_finder` | Flights To `/v2/shop/flights/fares` | GET | $0.005 | 3600 |
| `sabre.airline_lookup` | Airlines `/v1/lists/utilities/airlines` | GET | $0.002 | 86400 |
| `sabre.travel_themes` | Themes `/v1/shop/themes` | GET | $0.002 | 86400 |

---

## 4. Input Schemas

### sabre.search_flights

```typescript
{
  origin: string,           // IATA code, 3 chars (e.g. "JFK")
  destination: string,      // IATA code, 3 chars (e.g. "LHR")
  departure_date: string,   // YYYY-MM-DD
  return_date?: string,     // YYYY-MM-DD (optional, one-way if omitted)
  point_of_sale?: string,   // 2-letter country code (default: "US")
  limit?: number,           // 1-50 results
}
```

### sabre.destination_finder

```typescript
{
  origin: string,           // IATA code
  departure_date: string,   // YYYY-MM-DD
  return_date: string,      // YYYY-MM-DD
  point_of_sale?: string,   // default: "US"
  max_fare?: number,        // maximum fare filter
}
```

### sabre.airline_lookup

```typescript
{
  airline_code: string,     // IATA (2 chars) or ICAO (3 chars)
}
```

### sabre.travel_themes

```typescript
{}  // No parameters
```

---

## 5. Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/sabre/index.ts` | SabreAdapter (extends BaseAdapter) |
| `src/adapters/sabre/auth.ts` | OAuth2 token manager (double base64, 7-day TTL) |
| `src/adapters/sabre/types.ts` | TypeScript interfaces for Sabre responses |
| `src/schemas/sabre.schema.ts` | Zod input validation schemas |
| `scripts/test-sabre.sh` | 8-test smoke test script |

### Registry

```
src/adapters/registry.ts → case 'sabre' → SabreAdapter(clientId, clientSecret)
```

### Environment Variables

```
SABRE_CLIENT_ID=V1:fcs01nfyevgw9ze8:DEVCENTER:EXT
SABRE_CLIENT_SECRET=O2j0uyJT
```

---

## 6. Verified Test Results

```
InstaFlights: JFK→LHR — real flights with prices ($520+)
Destination Finder: JFK → AUA $338, BCN $455 (real fares)
Airlines: Aeroflot, American Airlines, Delta, etc. (full database)
Themes: 12 themes — BEACH, DISNEY, SKIING, ROMANTIC, etc.
```

---

## 7. Production Upgrade Path

| Current (cert) | Production |
|----------------|------------|
| Free | $500-5000/mo + commissions |
| Real data | Same data, guaranteed SLA |
| 4 APIs | +BFM, SeatMap, GeoCode, Low Fare Forecast |
| No booking | Booking possible with PCC (Pseudo City Code) |
| No contract | Commercial agreement with Sabre sales |

**Decision:** Stay on cert while traffic is low. Upgrade when volume justifies cost.

---

## 8. Pricing Rationale

| Tool | Our cost | Our price | Margin |
|------|----------|-----------|--------|
| sabre.search_flights | $0.000 | $0.010 | 100% |
| sabre.destination_finder | $0.000 | $0.005 | 100% |
| sabre.airline_lookup | $0.000 | $0.002 | 100% |
| sabre.travel_themes | $0.000 | $0.002 | 100% |

All tools are pure margin on cert environment.
