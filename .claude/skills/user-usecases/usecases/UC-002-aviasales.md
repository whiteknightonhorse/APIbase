# UC-002: Aviasales (Travelpayouts)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-002 |
| **Provider** | Aviasales / Travelpayouts (travelpayouts.com) |
| **Category** | Travel / Flights + Hotels |
| **Date Added** | 2026-03-07 |
| **Status** | Reference |
| **Client** | TravelBot Agency (Travelpayouts Partner) |

---

## 1. Client Input Data

Клиент **TravelBot Agency** зарегистрировался на Travelpayouts и подключился к программе Aviasales. Предоставил APIbase:

```
Тип данных:              Значение:
──────────────────────────────────────────────────────────
API Token                a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4 (пример)
Partner Marker           123456 (пример)
Программы                Aviasales (flights), Hotellook (hotels)
Тип монетизации          Revenue Share (40% от комиссии Aviasales)
Дата регистрации         01.03.2026
White Label URL          search.travelbot.agency (опционально)
```

### Sufficiency Assessment

| Data provided | What it enables | Sufficient? |
|---------------|----------------|-------------|
| API Token | Доступ ко всем Data API (цены, маршруты, календари) + Hotel API | **Да** |
| Partner Marker | Атрибуция трафика для начисления комиссий | **Да** |
| Aviasales program connected | Партнёрские ссылки с комиссией ~1.1% от цены билета | **Да** |
| Hotellook program connected | Партнёрские ссылки с комиссией от бронирований | **Да** |
| White Label URL (опц.) | Полноценный поисковый движок на домене клиента | Опционально |

**Verdict:** Provided data **полностью достаточно** для создания полноценного travel API. API Token + Marker — это всё, что нужно для доступа к ценам, поиску и атрибуции комиссий.

---

## 2. Provider API Analysis

### Платформа Travelpayouts

Travelpayouts — это партнёрская сеть от Aviasales, объединяющая 100+ travel-брендов. Через один аккаунт партнёр получает доступ к API Aviasales (авиабилеты), Hotellook (отели), и другим сервисам.

### API Architecture

| Сервис | Base URL | Auth | Описание |
|--------|----------|------|----------|
| **Flight Data API v1** | `api.travelpayouts.com/v1/` | Token | Кэшированные цены, дешёвые билеты |
| **Flight Data API v2** | `api.travelpayouts.com/v2/` | Token | Матрицы цен, ближайшие направления |
| **Flight Search API** | `api.travelpayouts.com/v1/flight_search` | MD5 Signature + Marker | Real-time поиск (строгие правила) |
| **Hotel Selections** | `yasen.hotellook.com/tp/public/` | Token | Подборки отелей |
| **Hotel Search** | `engine.hotellook.com/api/v2/` | Token + Marker | Поиск и цены отелей |
| **Reference Data** | `api.travelpayouts.com/data/` | Token | Справочники: страны, города, аэропорты, авиалинии |
| **Statistics API** | `api.travelpayouts.com/statistics/v1/` | Token | Статистика бронирований партнёра |
| **Finance API** | `api.travelpayouts.com/finance/v2/` | Token | Баланс и выплаты партнёра |
| **Geolocation** | `travelpayouts.com/whereami` | Нет | Определение города пользователя по IP |

### Key Endpoints — Flights

#### Flight Data API v1 (Cached / Historical)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/prices/cheap` | GET | Самые дешёвые билеты по маршруту (прямые и с пересадками) |
| `/v1/prices/direct` | GET | Самые дешёвые прямые рейсы |
| `/v1/prices/calendar` | GET | Календарь цен — цена за каждый день |
| `/v1/prices/monthly` | GET | Цены сгруппированные по месяцам |
| `/v1/airline-directions` | GET | Популярные маршруты авиакомпании |
| `/v1/city-directions` | GET | Популярные направления из города |

#### Flight Data API v2 (Cached / Enhanced)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v2/prices/latest` | GET | Последние известные цены (limit до 1000) |
| `/v2/prices/month-matrix` | GET | Матрица цен по дням месяца |
| `/v2/prices/week-matrix` | GET | Недельная матрица цен |
| `/v2/prices/nearest-places-matrix` | GET | Цены из/в соседние города (поиск по радиусу) |
| `/v2/prices/special-offers` | GET | Спецпредложения авиакомпаний (XML) |

#### Flight Search API (Real-Time)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/flight_search` | POST | Запуск real-time поиска (MD5 signature) |
| `/v1/flight_search_results` | GET | Получение результатов по UUID |

### Key Endpoints — Hotels

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/tp/public/available_selections.json` | GET | Доступные типы подборок |
| `/api/v2/lookup.json` | GET | Автокомплит по городам/отелям |
| `/api/v2/search/start` | POST | Запуск поиска отелей |
| `/api/v2/search/results` | GET | Результаты поиска |
| `/api/v2/price` | GET | Цены на конкретный отель |
| `/api/v2/hotel_list` | GET | Список отелей по локации |

### Key Endpoints — Reference Data

| Endpoint | Description |
|----------|-------------|
| `/data/en/countries.json` | Страны с кодами и валютами |
| `/data/en/cities.json` | Города с координатами и таймзонами |
| `/data/en/airports.json` | Аэропорты с IATA/ICAO кодами |
| `/data/en/airlines.json` | Авиалинии |
| `/data/en/airlines_alliances.json` | Альянсы авиакомпаний |
| `/data/planes.json` | Типы самолётов |
| `/data/routes.json` | Маршруты с кодшерами |

### Authentication Model

**Метод 1: Token (Data API, Hotels, Statistics, Finance)**
```
Header: X-Access-Token: YOUR_API_TOKEN
или
Query: ?token=YOUR_API_TOKEN
```

**Метод 2: MD5 Signature + Marker (Flight Search API)**
```
1. Берётся API Token
2. Конкатенируется с marker и всеми параметрами запроса
3. Значения сортируются алфавитно
4. Соединяются через ":"
5. Вычисляется MD5-хеш → это signature
6. В запрос отправляется signature + marker (но НЕ сам token)
```

### Rate Limits

| API | Лимит | Headers |
|-----|-------|---------|
| Flight Data API | 200 req/hour per IP | `X-Rate-Limit`, `X-Rate-Limit-Remaining`, `X-Rate-Limit-Reset` |
| Hotel Data API | 60 req/min | Аналогичные headers |
| Flight Search API | По согласованию | — |
| Statistics/Finance | Стандартные лимиты | — |

При превышении: HTTP 429. Восстановление автоматическое.
Увеличение лимитов: по запросу в support@travelpayouts.com.

### Monetization for Partners

| Модель | Описание |
|--------|----------|
| **Revenue Share** | Партнёр получает **40% от комиссии Aviasales** |
| **Реальная комиссия** | Aviasales зарабатывает ~2.2% от цены билета → партнёр получает **~1.1%** от цены |
| **eCPC** | ~$0.12 за клик |
| **Cookie lifetime** | 30 дней |
| **Выплаты** | Ежемесячно, 10–20 числа, через PayPal или карту |

---

## 3. APIbase Wrapper Design

### Level 1: Protocol Adapter

```
What the adapter does:
──────────────────────────────────────────────────────────────
• Unifies 8 Travelpayouts services → single APIbase endpoint
  apibase.pro/api/v1/aviasales/...

• Request routing:
  /aviasales/flights/search      → api.travelpayouts.com/v1/flight_search (real-time)
  /aviasales/flights/cheap       → api.travelpayouts.com/v1/prices/cheap (cached)
  /aviasales/flights/calendar    → api.travelpayouts.com/v1/prices/calendar (cached)
  /aviasales/hotels/search       → engine.hotellook.com/api/v2/search/start
  /aviasales/hotels/lookup       → engine.hotellook.com/api/v2/lookup.json
  /aviasales/reference/airports  → api.travelpayouts.com/data/en/airports.json

• Auth abstraction:
  - Agent sends request to APIbase with OAuth 2.1 token
  - APIbase injects client's API Token + constructs MD5 signature
  - Agent NEVER sees Travelpayouts credentials

• Rate limit management:
  - Shared pool: 200 req/hour for flights, 60 req/min for hotels
  - Intelligent distribution between agents based on KYA level
  - Queue + retry on 429

• Caching strategy:
  - Reference data (airports, airlines): 24h TTL
  - Price calendar: 1h TTL (cached data from Travelpayouts is already ~24h old)
  - Search results: 15 min TTL (Travelpayouts validity window)
  - Hotel prices: 30 min TTL
  - Geolocation: 24h TTL per IP

• Currency normalization:
  - Travelpayouts default: RUB
  - APIbase: always returns USD (converts via exchange rate API)
  - Agent can request any currency
```

### Level 2: Semantic Normalizer

**Domain model: `flight-search`**

```json
// === Travelpayouts оригинал (v1/prices/cheap) ===
{
  "success": true,
  "data": {
    "MOW": {
      "BKK": {
        "0": {
          "price": 28137,
          "airline": "SU",
          "flight_number": 270,
          "departure_at": "2026-04-15T05:20:00Z",
          "return_at": "2026-04-25T22:55:00Z",
          "expires_at": "2026-03-07T14:00:00Z",
          "number_of_changes": 0,
          "gate": "Aviasales",
          "distance": 7065
        }
      }
    }
  },
  "currency": "rub"
}

// === APIbase normalized (flight-search schema) ===
{
  "provider": "aviasales",
  "search_id": "apibase_as_MOW_BKK_20260415",
  "route": {
    "origin": {
      "code": "MOW",
      "city": "Moscow",
      "country": "RU"
    },
    "destination": {
      "code": "BKK",
      "city": "Bangkok",
      "country": "TH"
    }
  },
  "results": [
    {
      "price_usd": 315.00,
      "price_original": 28137,
      "currency_original": "RUB",
      "airline": {
        "code": "SU",
        "name": "Aeroflot"
      },
      "flight_number": "SU 270",
      "departure": "2026-04-15T05:20:00Z",
      "return": "2026-04-25T22:55:00Z",
      "stops": 0,
      "duration_h": null,
      "distance_km": 7065,
      "booking_url": "https://apibase.pro/redirect/aviasales/...",
      "data_freshness": "cached",
      "expires_at": "2026-03-07T14:00:00Z"
    }
  ],
  "metadata": {
    "results_count": 1,
    "search_type": "cached",
    "currency": "USD",
    "data_age": "up to 24h (cached prices)"
  }
}
```

**Domain model: `hotel-search`**

```json
// === APIbase normalized (hotel-search schema) ===
{
  "provider": "hotellook",
  "search_id": "apibase_hl_BKK_20260415",
  "location": {
    "city": "Bangkok",
    "country": "TH",
    "code": "BKK"
  },
  "check_in": "2026-04-15",
  "check_out": "2026-04-25",
  "guests": {"adults": 2, "children": 0},
  "results": [
    {
      "hotel_name": "Mandarin Oriental Bangkok",
      "stars": 5,
      "guest_score": 9.2,
      "price_usd_per_night": 280.00,
      "price_usd_total": 2800.00,
      "amenities": ["pool", "spa", "restaurant", "wifi"],
      "location": {"lat": 13.7234, "lng": 100.5167},
      "booking_url": "https://apibase.pro/redirect/hotellook/...",
      "photos_count": 45,
      "reviews_count": 1823
    }
  ]
}
```

### Level 3: Affiliate Link Injector

```
Every booking link goes through Travelpayouts with the client's marker:
──────────────────────────────────────────────────────────────
1. Agent finds a flight/hotel through APIbase
2. APIbase generates a booking_url with embedded:
   - Partner Marker (123456) → commission attributed to client
   - Sub ID (agent_id + request_id) → tracking which agent generated the booking
3. When user clicks booking_url → Aviasales/Hotellook sets 30-day cookie
4. If user books within 30 days → commission credited to client
5. Client receives 40% of Aviasales commission (~1.1% of ticket price)
6. Revenue share: client keeps 70%, APIbase takes 30% (by agreement)

Booking URL format:
https://www.aviasales.ru/search/MOW1504BKK25041?marker=123456.apibase_agent123

Hotel URL format:
https://search.hotellook.com/hotels?marker=123456.apibase_agent123&...
```

---

## 4. MCP Tool Definitions

### Tool: aviasales-flight-search

```json
{
  "name": "aviasales-flight-search",
  "description": "Search for flights using Aviasales. Find cheapest tickets between any cities. Returns prices, airlines, number of stops, and booking links. Supports one-way, round-trip, and multi-city searches.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "origin": {
        "type": "string",
        "description": "Departure city or airport IATA code (e.g., 'MOW' for Moscow, 'JFK' for New York)"
      },
      "destination": {
        "type": "string",
        "description": "Arrival city or airport IATA code (e.g., 'BKK' for Bangkok)"
      },
      "departure_date": {
        "type": "string",
        "format": "date",
        "description": "Departure date in YYYY-MM-DD format"
      },
      "return_date": {
        "type": "string",
        "format": "date",
        "description": "Return date (optional, omit for one-way)"
      },
      "passengers": {
        "type": "object",
        "properties": {
          "adults": {"type": "integer", "default": 1, "minimum": 1, "maximum": 9},
          "children": {"type": "integer", "default": 0, "maximum": 9},
          "infants": {"type": "integer", "default": 0, "maximum": 9}
        },
        "default": {"adults": 1, "children": 0, "infants": 0}
      },
      "cabin_class": {
        "type": "string",
        "enum": ["economy", "business"],
        "default": "economy"
      },
      "direct_only": {
        "type": "boolean",
        "default": false,
        "description": "Only show non-stop flights"
      },
      "currency": {
        "type": "string",
        "default": "USD",
        "description": "Currency for prices (ISO 4217)"
      },
      "sort_by": {
        "type": "string",
        "enum": ["price", "duration", "departure_time"],
        "default": "price"
      },
      "limit": {
        "type": "integer",
        "default": 10,
        "maximum": 50
      }
    },
    "required": ["origin", "destination", "departure_date"]
  }
}
```

### Tool: aviasales-price-calendar

```json
{
  "name": "aviasales-price-calendar",
  "description": "Get a calendar of flight prices for a route. Shows the cheapest price for each day of the month. Perfect for finding the cheapest travel dates.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "origin": {
        "type": "string",
        "description": "Departure IATA code"
      },
      "destination": {
        "type": "string",
        "description": "Arrival IATA code"
      },
      "month": {
        "type": "string",
        "description": "Month in YYYY-MM format (e.g., '2026-04')"
      },
      "currency": {
        "type": "string",
        "default": "USD"
      }
    },
    "required": ["origin", "destination", "month"]
  }
}
```

### Tool: aviasales-cheap-flights

```json
{
  "name": "aviasales-cheap-flights",
  "description": "Find the cheapest flights from a city to anywhere, or between two specific cities. Uses cached data (up to 24h old) for fast response. Great for budget travel planning.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "origin": {
        "type": "string",
        "description": "Departure IATA code"
      },
      "destination": {
        "type": "string",
        "description": "Arrival IATA code (optional — omit to search everywhere)"
      },
      "departure_month": {
        "type": "string",
        "description": "Departure month YYYY-MM (optional)"
      },
      "direct_only": {
        "type": "boolean",
        "default": false
      },
      "currency": {
        "type": "string",
        "default": "USD"
      },
      "limit": {
        "type": "integer",
        "default": 10,
        "maximum": 30
      }
    },
    "required": ["origin"]
  }
}
```

### Tool: aviasales-popular-routes

```json
{
  "name": "aviasales-popular-routes",
  "description": "Get popular flight destinations from a given city, sorted by popularity. Useful for travel inspiration and recommendations.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "origin": {
        "type": "string",
        "description": "Departure city IATA code"
      },
      "limit": {
        "type": "integer",
        "default": 10,
        "maximum": 30
      }
    },
    "required": ["origin"]
  }
}
```

### Tool: aviasales-hotel-search

```json
{
  "name": "aviasales-hotel-search",
  "description": "Search for hotels in a city using Hotellook. Returns hotel names, star ratings, guest scores, prices, and amenities. Supports sorting by price, rating, or popularity.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "city": {
        "type": "string",
        "description": "City name or IATA code (e.g., 'Bangkok' or 'BKK')"
      },
      "check_in": {
        "type": "string",
        "format": "date",
        "description": "Check-in date YYYY-MM-DD"
      },
      "check_out": {
        "type": "string",
        "format": "date",
        "description": "Check-out date YYYY-MM-DD"
      },
      "guests": {
        "type": "object",
        "properties": {
          "adults": {"type": "integer", "default": 2},
          "children": {"type": "integer", "default": 0}
        }
      },
      "stars": {
        "type": "array",
        "items": {"type": "integer", "enum": [1, 2, 3, 4, 5]},
        "description": "Filter by star rating (optional)"
      },
      "sort_by": {
        "type": "string",
        "enum": ["price", "rating", "stars", "popularity"],
        "default": "popularity"
      },
      "price_max_usd": {
        "type": "number",
        "description": "Maximum price per night in USD (optional)"
      },
      "limit": {
        "type": "integer",
        "default": 10,
        "maximum": 50
      }
    },
    "required": ["city", "check_in", "check_out"]
  }
}
```

### Tool: aviasales-nearby-destinations

```json
{
  "name": "aviasales-nearby-destinations",
  "description": "Find cheap flights to destinations near a target city. Searches airports within a radius. Great when the user is flexible on exact destination.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "origin": {
        "type": "string",
        "description": "Departure IATA code"
      },
      "destination": {
        "type": "string",
        "description": "Target destination IATA code (will search nearby)"
      },
      "departure_date": {
        "type": "string",
        "format": "date"
      },
      "return_date": {
        "type": "string",
        "format": "date"
      },
      "flexibility_days": {
        "type": "integer",
        "default": 3,
        "description": "Date flexibility in days (+/- from given dates)"
      },
      "distance_km": {
        "type": "integer",
        "default": 200,
        "description": "Search radius in km from target destination"
      },
      "currency": {
        "type": "string",
        "default": "USD"
      }
    },
    "required": ["origin", "destination", "departure_date"]
  }
}
```

### Tool: aviasales-airport-lookup

```json
{
  "name": "aviasales-airport-lookup",
  "description": "Look up airport and city IATA codes by name. Use this before flight search when you have city names but need IATA codes.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "City or airport name (e.g., 'Bangkok', 'Sheremetyevo')"
      },
      "locale": {
        "type": "string",
        "default": "en",
        "description": "Language for results"
      }
    },
    "required": ["query"]
  }
}
```

---

## 5. AI Instructions

```markdown
# Aviasales Travel API via APIbase — AI Agent Instructions

## When to Use
- User wants to find flights between cities
- User asks about flight prices or cheapest dates to travel
- User is planning a trip and needs flights + hotels
- User asks "where can I fly from X for cheap?"
- User needs hotel recommendations in a city
- User wants to compare travel options within a budget

## Key Concepts
- Aviasales aggregates prices from hundreds of airlines and agencies
- Prices from Data API are CACHED (up to 24h old) — great for planning, NOT for booking
- For exact real-time prices, use aviasales-flight-search (slower, but current)
- Hotel data comes from Hotellook (part of Travelpayouts ecosystem)
- All prices include booking links — user clicks to complete purchase on airline/agency site
- IATA codes are required for searches (use aviasales-airport-lookup to convert city names)

## Recommended Call Chains

### "Find me flights from Moscow to Bangkok in April"
1. `aviasales-airport-lookup` (query="Moscow") → MOW
2. `aviasales-airport-lookup` (query="Bangkok") → BKK (if needed)
3. `aviasales-flight-search` (origin="MOW", destination="BKK", departure_date="2026-04-15")
4. Present results with prices, airlines, stops

### "When is the cheapest time to fly from NYC to London?"
1. `aviasales-price-calendar` (origin="NYC", destination="LON", month="2026-04")
2. `aviasales-price-calendar` (origin="NYC", destination="LON", month="2026-05") — check next month too
3. Compare and recommend cheapest dates

### "I have $2000, plan a trip to Thailand for 10 days"
1. `aviasales-flight-search` (origin=user_city, destination="BKK", departure_date=..., return_date=...)
2. `aviasales-hotel-search` (city="Bangkok", check_in=..., check_out=..., price_max_usd=100)
3. Calculate: flight + hotel * nights ≤ $2000
4. Present 2-3 options within budget

### "Where can I fly cheap from Berlin?"
1. `aviasales-cheap-flights` (origin="BER", limit=10)
2. Present destinations sorted by price

### "I'm flexible on destination, somewhere warm near Greece"
1. `aviasales-nearby-destinations` (origin=user_city, destination="ATH", distance_km=500)
2. Filter for warm destinations
3. Present with prices

## Response Formatting
- Always show prices in user's currency: "$315 round-trip"
- Include airline name, not just code: "Aeroflot (SU)" not just "SU"
- Show stops clearly: "Direct" or "1 stop (Istanbul, 2h layover)"
- For cached data, note: "Prices as of [date], may vary at booking"
- Include booking action: "Click to book: [link]"
- For budget planning, show breakdown: "Flight: $315 + Hotel: $140/night × 10 = $1,715 total"

## Limitations
- Data API prices are cached (up to 24h old) — actual prices may differ
- Flight Search API returns results valid for 15 minutes
- No direct booking through API — user must click through to airline/agency
- Hotel availability changes in real-time — prices shown are indicative
- Some routes may have limited data in off-season
- Currency conversion rates updated daily

## IATA Codes Quick Reference
- Moscow: MOW (city), SVO/DME/VKO (airports)
- Bangkok: BKK
- New York: NYC (city), JFK/LGA/EWR (airports)
- London: LON (city), LHR/LGW/STN (airports)
- Use aviasales-airport-lookup for any other city

## Pricing via APIbase
- Cached data (cheap-flights, calendar, popular): Free tier (1000 req/month)
- Cached data above free tier: $0.001 per request (x402)
- Real-time search: $0.005 per search (x402)
- Hotel search: $0.003 per search (x402)
- Reference data (airports, airlines): Free, unlimited
```

---

## 6. Publication

### APIbase.pro Catalog Entry

```
URL: apibase.pro/catalog/travel/aviasales/
──────────────────────────────────────────────────────────────
Provider:       Aviasales / Travelpayouts
Website:        aviasales.ru / travelpayouts.com
Category:       Travel / Flights + Hotels
Subcategories:  Flights, Hotels, Price Calendar, Route Planning

Status:         Active ✅
MCP Tools:      7 tools (flight-search, price-calendar, cheap-flights,
                popular-routes, hotel-search, nearby-destinations,
                airport-lookup)
Formats:        MCP Tool Definition, OpenAPI 3.1, A2A Agent Card

Pricing:
  Cached data (free tier):  1000 req/month
  Cached data (paid):       $0.001/req via x402
  Real-time search:         $0.005/search via x402
  Hotel search:             $0.003/search via x402
  Reference data:           Free, unlimited

Authentication:  OAuth 2.1 via APIbase (agent registration required)
Data freshness:  Cached prices: ~24h | Real-time search: live | Hotels: 30 min
Rate limits:     Per-agent, based on KYA level
Auto-sync:       Reference data daily, prices hourly
```

### GitHub Public Entry

```
github.com/apibase-pro/apibase/apis/travel/aviasales/
│
├── README.md
│   # Aviasales — Flight & Hotel Search API
│   Aviasales is the largest flight metasearch in Russia/CIS and one
│   of the largest globally. Through APIbase, AI agents can search
│   flights, compare prices, find cheapest dates, search hotels,
│   and generate booking links.
│
│   ## Available Tools
│   - aviasales-flight-search: Search flights (real-time)
│   - aviasales-price-calendar: Price calendar for flexible dates
│   - aviasales-cheap-flights: Find cheapest flights from any city
│   - aviasales-popular-routes: Popular destinations from a city
│   - aviasales-hotel-search: Search hotels (Hotellook)
│   - aviasales-nearby-destinations: Cheap flights to nearby cities
│   - aviasales-airport-lookup: City/airport IATA code lookup
│
│   ## Quick Start
│   POST apibase.pro/api/v1/discover {"query": "cheap flights"}
│
├── capabilities.json
│   {
│     "provider": "aviasales",
│     "category": "travel",
│     "subcategories": ["flights", "hotels"],
│     "tools_count": 7,
│     "real_time_search": true,
│     "cached_data": true,
│     "hotel_support": true,
│     "x402_enabled": true,
│     "currencies": ["USD", "EUR", "RUB", "THB", "..."],
│     "coverage": "worldwide"
│   }
│
└── examples.md
    ## Search flights Moscow → Bangkok
    POST /api/v1/aviasales/flight-search
    {"origin": "MOW", "destination": "BKK", "departure_date": "2026-04-15"}

    ## Find cheapest month to fly
    GET /api/v1/aviasales/price-calendar?origin=MOW&destination=BKK&month=2026-04
```

**Not published on GitHub:** API Token, Partner Marker, MD5 signature logic, caching config, affiliate link construction.

---

## 7. Traffic Flow Diagram

### Cached Price Request (fast, ~24h old data)

```
AI Agent                     APIbase.pro                   Travelpayouts
    │                            │                              │
    │── aviasales-cheap-flights─→│                              │
    │   origin="MOW"             │                              │
    │   currency="USD"           │                              │
    │                            │── Check cache ──────────────→│ (internal)
    │                            │   [cache miss or expired]    │
    │                            │                              │
    │                            │── GET /v1/prices/cheap ─────→│
    │                            │   X-Access-Token: a1b2c3...  │ api.travelpayouts
    │                            │   ?origin=MOW&currency=rub   │
    │                            │←── 200 OK [JSON] ───────────│
    │                            │                              │
    │                            │   [normalize → APIbase schema]│
    │                            │   [convert RUB → USD]        │
    │                            │   [inject booking URLs with  │
    │                            │    marker=123456]            │
    │                            │   [cache result, TTL=1h]     │
    │                            │                              │
    │←── 200 OK ─────────────────│                              │
    │   [{                       │                              │
    │     destination: "BKK",    │                              │
    │     city: "Bangkok",       │                              │
    │     price_usd: 315,        │                              │
    │     airline: "Aeroflot",   │                              │
    │     stops: 0,              │                              │
    │     booking_url: "..."     │                              │
    │   }, ...]                  │                              │
```

### Real-Time Flight Search (current prices, slower)

```
AI Agent                     APIbase.pro                   Travelpayouts
    │                            │                              │
    │── aviasales-flight-search─→│                              │
    │   origin="MOW"             │                              │
    │   destination="BKK"        │                              │
    │   departure="2026-04-15"   │                              │
    │                            │── Compute MD5 signature ────→│ (internal)
    │                            │   token + marker + params    │
    │                            │                              │
    │                            │── POST /v1/flight_search ───→│
    │                            │   signature=abc123...        │ api.travelpayouts
    │                            │   marker=123456              │
    │                            │←── {uuid: "search-uuid"} ───│
    │                            │                              │
    │                            │── GET /flight_search_results→│
    │                            │   ?uuid=search-uuid          │ (poll every 1s)
    │                            │←── {results: [...]} ────────│
    │                            │                              │
    │                            │   [normalize + inject links] │
    │                            │   [cache 15 min]             │
    │                            │                              │
    │←── 200 OK ─────────────────│                              │
    │   [full flight results     │                              │
    │    with real-time prices]  │                              │
```

### Booking Conversion Flow (how money is earned)

```
AI Agent              APIbase           User Browser          Aviasales         Airline/Agency
    │                     │                   │                    │                   │
    │── search ──────────→│                   │                    │                   │
    │←── results + URLs ──│                   │                    │                   │
    │                     │                   │                    │                   │
    │── "best option" ───→│ (to user)         │                    │                   │
    │                     │                   │                    │                   │
    │                     │     User clicks   │                    │                   │
    │                     │     booking_url   │                    │                   │
    │                     │                   │── redirect ───────→│                   │
    │                     │                   │   marker=123456    │                   │
    │                     │                   │                    │── 30-day cookie ──→│
    │                     │                   │                    │                   │
    │                     │                   │                    │   User books       │
    │                     │                   │                    │   ticket ($500)    │
    │                     │                   │                    │                   │
    │                     │                   │                    │── Commission ─────→│
    │                     │                   │                    │   Aviasales: 2.2%  │
    │                     │                   │                    │   ($11.00)         │
    │                     │                   │                    │                   │
    │                     │                   │   Partner: 40%     │                   │
    │                     │                   │   of $11 = $4.40   │                   │
    │                     │                   │                    │                   │
    │                     │   Revenue share:  │                    │                   │
    │                     │   Client: $3.08   │                    │                   │
    │                     │   APIbase: $1.32  │                    │                   │
```

---

## 8. Monetization Model

| Revenue Stream | Mechanism | Expected per Month |
|---------------|-----------|-------------------|
| **Affiliate commission** | 40% of Aviasales commission (~1.1% ticket price). Revenue share: Client 70% / APIbase 30% | $500–5000 (scales with bookings) |
| **API Usage Fee (cached)** | $0.001/req after free tier | $50–500 |
| **API Usage Fee (real-time)** | $0.005/search via x402 | $100–1000 |
| **API Usage Fee (hotels)** | $0.003/search via x402 | $30–300 |
| **Hotel booking commission** | Hotellook affiliate commission, similar revenue share | $200–2000 |

**Revenue comparison with UC-001 (Polymarket):**

| Metric | UC-001 Polymarket | UC-002 Aviasales |
|--------|-------------------|------------------|
| Primary revenue | API Usage Fees | **Affiliate commissions** |
| Commission per transaction | $0.001/req | **~$4.40/booking** (much higher) |
| Transaction volume to $1K/mo | 1M requests | **~230 bookings** |
| Scaling model | Linear (more requests) | **Conversion-based** (higher value per action) |

**Key insight:** Aviasales is fundamentally different from Polymarket. Polymarket monetizes through API usage fees (many small payments). Aviasales monetizes through **affiliate commissions** (fewer but much higher value transactions). A single flight booking generates ~$4.40, which equals 4,400 Polymarket API calls.

---

## 9. Lessons Learned

### What works well

1. **Classic affiliate model = APIbase core revenue.** Aviasales' 40% RevShare + 30-day cookie is the textbook example of how APIbase monetizes. No x402 needed for the commission — it's pure affiliate.

2. **Two-tier data (cached + real-time) = flexible for agents.** Cached data is free/cheap and perfect for planning, inspiration, budget estimation. Real-time search is more expensive but gives exact prices. Agents choose based on user's need.

3. **Flights + Hotels in one API.** Travelpayouts bundles Aviasales and Hotellook. APIbase wraps both under one provider, enabling the "plan a trip" use case with one integration.

4. **Global coverage.** Aviasales covers worldwide routes and 100+ airlines. No geographic limitation for agents.

5. **Reference data is gold.** Airport/airline/route databases are freely available and perfect for agent intelligence (resolving city names to IATA codes, knowing airline alliances, etc.).

### Challenges identified

1. **Low rate limits (200 req/hour).** Much lower than Polymarket (9000 req/10sec). Need aggressive caching and smart distribution. Will need to request limit increase from Travelpayouts support as agent traffic grows.

2. **Cached data staleness.** Data API prices can be up to 24h old. Agent must communicate this to users ("prices may differ at booking time"). Real-time search is available but limited and slower.

3. **MD5 signature complexity.** Flight Search API requires MD5 signature construction — more complex than simple token auth. APIbase abstracts this away from agents.

4. **Conversion dependency.** Unlike Polymarket (pay per API call), Aviasales revenue depends on actual bookings. If agents search but users don't book, revenue is zero. Need to optimize for conversion (good booking URLs, clear CTAs in agent responses).

5. **Strict Flight Search API rules.** Travelpayouts requires ≥9% CTR to agencies and ≥5% to actual purchases. Need to monitor and ensure compliance.

### Pattern: Affiliate Travel Integration

This integration establishes a **reusable pattern** for other travel affiliate APIs:
- Partner registers on affiliate platform → gets Token + Marker
- Data API (cached) for planning/inspiration (free/cheap)
- Search API (real-time) for exact prices (paid)
- Booking links with embedded affiliate tracking
- Commission on completed bookings (30-day cookie)

This pattern applies to: **Booking.com, Agoda, GetYourGuide, Viator, Rentalcars** — all available through Travelpayouts with the same Token.
