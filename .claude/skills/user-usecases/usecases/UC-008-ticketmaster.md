# UC-008: Ticketmaster

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-008 |
| **Provider** | Ticketmaster (ticketmaster.com) / Live Nation Entertainment |
| **Category** | Events / Live Entertainment |
| **Date Added** | 2026-03-07 |
| **Status** | Reference |
| **Client** | APIbase (platform-level integration) |

---

## 1. Client Input Data

Интеграция на уровне платформы — APIbase подключает Ticketmaster как upstream-провайдер:

```
Тип данных:          Значение:
──────────────────────────────────────────────────────────
TM API Key           Discovery API consumer key (бесплатный)
Affiliate ID         Impact publisher ID (для affiliate tracking)
```

### Sufficiency Assessment

| Data provided | What it enables | Sufficient? |
|---------------|----------------|-------------|
| Discovery API Key | 5,000 req/day, 2 req/sec. Поиск событий, площадок, артистов, классификаций. 230,000+ live events, 26+ стран. | **Yes** — полноценный production доступ |
| Discovery Feed | Без лимита вызовов, обновление каждый час. Bulk export всех событий. | **Yes** — для prefetch и cache |
| Affiliate Publisher ID | Auto-injection affiliate URL в каждый API response. Комиссия $0.30/ticket (AU), ~1% (UK/US). 30-day cookie. | **Yes** — монетизация через конверсии |

**Verdict:** Ticketmaster Discovery API полностью бесплатен. Монетизация через **affiliate program** (Impact platform) — URL'ы автоматически инжектируются в ответы API при регистрации Publisher ID. Это первый UC с **transactional affiliate** моделью — $0 upstream cost, revenue per ticket purchase. Партнёрство Ticketmaster с Google AI Mode подтверждает agentic use case.

---

## 2. Provider API Analysis

### API Architecture

Ticketmaster / Live Nation — крупнейшая платформа продажи билетов в мире: **230,000+ live events**, 26+ стран, Sports + Music + Arts + Theater + Family + Film. Уже интегрирован в Google AI Mode для agentic ticket booking.

| Service | Base URL | Auth | Description |
|---------|----------|------|-------------|
| **Discovery API v2** | `https://app.ticketmaster.com/discovery/v2/` | API Key (query param) | Поиск событий, площадок, артистов |
| **Discovery Feed v2** | `https://app.ticketmaster.com/discovery-feed/v2/` | API Key | Bulk-экспорт всех событий (без лимита) |
| **Commerce API** | `https://app.ticketmaster.com/commerce/v2/` | API Key + OAuth | Checkout, корзина, покупка (partner only) |
| **International Discovery** | `https://app.ticketmaster.com/discovery/v2/` | API Key | 26+ рынков (US, CA, UK, AU, DE, MX, etc.) |

### Key Endpoints

#### Events Search (Primary)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/discovery/v2/events.json` | GET | Поиск событий с фильтрами |

**Ключевые параметры:**
```
keyword           — поиск по названию/артисту
classificationName — Music, Sports, Arts & Theatre, Film, Miscellaneous
city / stateCode / countryCode — география
latlong + radius + unit — геопоиск (miles/km)
startDateTime / endDateTime — диапазон дат (ISO 8601)
sort              — date,asc / date,desc / relevance,asc / name,asc
size              — результатов на страницу (max 200)
page              — пагинация
genreId           — жанр (Rock, Pop, Hip-Hop, Classical, etc.)
subGenreId        — поджанр
segmentId         — сегмент (Music, Sports, Arts)
venueId           — конкретная площадка
attractionId      — конкретный артист/команда
promoterId        — промоутер
includeTBA / includeTBD — включить TBA/TBD события
source            — ticketmaster / ticketweb / frontgate / universe / tmr
```

#### Event Details

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/discovery/v2/events/{id}.json` | GET | Полная информация о событии |

**Возвращает:**
```
name              — название события
dates.start       — дата/время начала
dates.status      — onsale / offsale / cancelled / rescheduled
priceRanges       — min/max цена, тип (standard/VIP)
url               — ссылка на покупку (с affiliate tracking!)
images            — массив изображений (разные размеры)
_embedded.venues  — площадка (адрес, координаты, capacity)
_embedded.attractions — артисты/команды
classifications   — жанр, поджанр, сегмент
seatmap           — ссылка на карту зала
sales.public      — даты начала/конца продаж
promoter          — промоутер
accessibility     — информация о доступности
```

#### Venues

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/discovery/v2/venues.json` | GET | Поиск площадок |
| `/discovery/v2/venues/{id}.json` | GET | Детали площадки |

**Данные:**
```
name              — название площадки
city / state / country — адрес
location.latitude / longitude — координаты
capacity (если доступно)
url               — страница площадки
images            — фото площадки
upcomingEvents    — количество предстоящих событий
```

#### Attractions (Artists / Teams)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/discovery/v2/attractions.json` | GET | Поиск артистов/команд |
| `/discovery/v2/attractions/{id}.json` | GET | Детали артиста |

**Данные:**
```
name              — имя артиста/команды
type              — artist / team / group
classifications   — жанр, поджанр
images            — фото
externalLinks     — YouTube, Twitter, Instagram, Facebook, Spotify, iTunes
upcomingEvents    — количество предстоящих событий
url               — страница на Ticketmaster
```

#### Classifications (Taxonomy)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/discovery/v2/classifications.json` | GET | Классификация: сегменты → жанры → поджанры |

**Таксономия:**
```
Segment: Music
  → Genre: Rock, Pop, Hip-Hop/Rap, R&B, Country, Electronic, Classical, Jazz, Metal, Latin
    → Subgenre: Alternative Rock, Indie Pop, Trap, etc.

Segment: Sports
  → Genre: Football, Basketball, Baseball, Hockey, Soccer, Tennis, MMA, Boxing
    → Subgenre: NFL, NBA, MLB, NHL, Premier League, etc.

Segment: Arts & Theatre
  → Genre: Theatre, Comedy, Dance, Opera, Musical

Segment: Film
Segment: Family (Disney On Ice, Cirque du Soleil, etc.)
```

#### Discovery Feed (Bulk)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/discovery-feed/v2/events.json` | GET | Все события без rate limits |

**Особенности:**
```
• Обновление каждый час
• Без лимита вызовов (в отличие от 5,000/day для Discovery API)
• Используется для bulk sync / prefetch
• Включает delta-updates (только изменения)
• Форматы: JSON, XML
```

### Authentication Model

```
Простая модель:
  Query parameter: ?apikey=YOUR_API_KEY
  Нет OAuth для Discovery API (только для Commerce)

Affiliate auto-injection:
  При регистрации Publisher ID через Impact,
  все URL в ответах автоматически содержат affiliate tracking.
  Агенту/пользователю не нужно ничего менять — clicking = affiliate revenue.
```

### Rate Limits

| Tier | Requests/day | Requests/sec | Cost | When |
|------|-------------|-------------|------|------|
| Discovery API | 5,000 | 2 | $0 | Standard search queries |
| Discovery Feed | Unlimited | — | $0 | Bulk sync, prefetch |
| Commerce API | By agreement | — | Partner only | Checkout (not needed) |

### Markets (Countries)

```
26+ стран с локализованными данными:
US, CA, MX — Америка
GB, IE, DE, AT, NL, BE, FR, ES, IT, CH, SE, NO, DK, FI, PL, CZ — Европа
AU, NZ — Океания
JP, KR — Азия

Каждый рынок имеет локальные события, площадки, артистов.
Cross-market search поддерживается.
```

### Affiliate Program (Impact)

```
Партнёрская программа через Impact:
  • Регистрация: developer.ticketmaster.com/partners/affiliate-sign-up/
  • Комиссия: ~$0.30/ticket (AU), ~1% (UK/US) — varies by market
  • Cookie duration: 30 дней
  • Tracking: auto-injection в API responses
  • Resale included: комиссия с перепродажи тоже
  • Dashboard: Impact affiliate dashboard для отслеживания
  • Payment: monthly via Impact (bank transfer, PayPal)

URL injection:
  Каждый `url` в API response автоматически содержит
  affiliate tracking параметры после регистрации Publisher ID.
  Агент передаёт URL пользователю → клик → покупка → комиссия.
```

### Existing MCP Servers

```
Ticketmaster уже имеет community MCP servers:
  • mochow13/ticketmaster-mcp-server (GitHub)
  • windsornguyen-ticketmaster-mcp (GitHub)
  • Streamable HTTP transport

APIbase wrapper добавляет:
  • x402 оплату за query
  • Affiliate URL injection
  • Geo-enrichment (координаты → город → страна)
  • Cross-UC integration (travel + weather + events)
  • Cache layer для популярных запросов
  • Multi-market routing
```

---

## 3. APIbase Wrapper Design

### Level 1: Protocol Adapter

```
What the adapter does:
──────────────────────────────────────────────────────────────
• Wraps 4 Ticketmaster сервиса → unified events interface
  apibase.pro/api/v1/events/...

• Request routing:
  /events/search        → ticketmaster /discovery/v2/events
  /events/{id}          → ticketmaster /discovery/v2/events/{id}
  /events/venues        → ticketmaster /discovery/v2/venues
  /events/artists       → ticketmaster /discovery/v2/attractions
  /events/categories    → ticketmaster /discovery/v2/classifications

• Auto-geolocation:
  - Агент отправляет "concerts in Berlin" или "events near me"
  - APIbase resolves city → lat/lon (кэш из UC-005 geocoding)
  - Подставляет latlong + radius в Ticketmaster API
  - Кэш geocoding: 30 дней

• Affiliate URL injection:
  - Все url поля в ответах содержат affiliate tracking
  - APIbase НЕ модифицирует URL — Ticketmaster инжектирует автоматически
  - Агент передаёт URL пользователю → клик → покупка → комиссия

• Smart caching:
  - Event search results: 5 мин TTL (события обновляются часто)
  - Event details: 15 мин TTL (prices/availability меняются)
  - Venues: 24 часа TTL (адрес не меняется)
  - Artists/Attractions: 12 часов TTL
  - Classifications: 7 дней TTL (taxonomy стабильна)
  - Discovery Feed: hourly sync для популярных рынков

• Prefetch via Discovery Feed:
  - Hourly bulk sync top-5 рынков (US, UK, CA, AU, DE)
  - Все события в кэше → serve без upstream call
  - Margin на prefetch: ~100% (no per-query upstream cost)

• Multi-market routing:
  - Агент может не знать свой рынок
  - APIbase определяет по IP или language preference
  - Auto-routing: "concerts this weekend" → user's local market

• Error normalization:
  APIbase standard format:
  {"error": "events_not_found", "message": "No events matching criteria"}
  {"error": "events_rate_limited", "message": "Daily limit reached, retry tomorrow"}
  {"error": "events_market_unavailable", "message": "Market not supported"}
```

### Level 2: Semantic Normalizer

**Domain model: `event`**

```json
// === Ticketmaster original (simplified) ===
{
  "name": "Taylor Swift | The Eras Tour",
  "type": "event",
  "id": "vvG1YZ9YkeB12p",
  "url": "https://www.ticketmaster.com/event/vvG1YZ9YkeB12p?afflid=APIBASE",
  "dates": {
    "start": {"localDate": "2026-06-15", "localTime": "19:00:00"},
    "status": {"code": "onsale"}
  },
  "priceRanges": [{"type": "standard", "min": 89.0, "max": 449.0, "currency": "USD"}],
  "_embedded": {
    "venues": [{"name": "Wembley Stadium", "city": {"name": "London"}, "country": {"countryCode": "GB"}}],
    "attractions": [{"name": "Taylor Swift", "classifications": [{"genre": {"name": "Pop"}}]}]
  }
}

// === APIbase normalized (event schema) ===
{
  "provider": "ticketmaster",
  "event_id": "apibase_ev_vvG1YZ9YkeB12p",
  "name": "Taylor Swift | The Eras Tour",
  "category": "Music",
  "genre": "Pop",
  "date": "2026-06-15",
  "time": "19:00",
  "status": "on_sale",
  "venue": {
    "name": "Wembley Stadium",
    "city": "London",
    "country": "GB",
    "location": {"lat": 51.5560, "lon": -0.2795}
  },
  "artists": [
    {
      "name": "Taylor Swift",
      "genre": "Pop",
      "social": {
        "spotify": "https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02",
        "instagram": "https://instagram.com/taylorswift"
      }
    }
  ],
  "pricing": {
    "currency": "USD",
    "min": 89.00,
    "max": 449.00,
    "type": "standard"
  },
  "ticket_url": "https://www.ticketmaster.com/event/vvG1YZ9YkeB12p?afflid=APIBASE",
  "images": {
    "thumbnail": "https://s1.ticketm.net/.../small.jpg",
    "hero": "https://s1.ticketm.net/.../large.jpg"
  },
  "timestamp": "2026-03-07T14:30:00Z"
}
```

### Level 3: Event Intelligence & Value-Add

```
APIbase добавляет ценность поверх прямого Ticketmaster API:
──────────────────────────────────────────────────────────────

1. Price intelligence:
   - Track price changes over time (from Discovery Feed hourly syncs)
   - "Prices dropped 20% since last week" alerts
   - Min/max/avg price per event type в городе
   - Price comparison across markets (EU vs US pricing)

2. Event enrichment:
   - Weather forecast for outdoor events (Cross-UC: UC-005)
   - Travel options to venue (Cross-UC: UC-002)
   - Nearby restaurants for pre-show dining (Cross-UC: UC-003)
   - Translate event descriptions for international users (Cross-UC: UC-007)

3. Smart recommendations:
   - "Events like this" based on classification taxonomy
   - "Popular this week in [city]" from trending data
   - "Last chance" — events with few dates remaining
   - Genre-based suggestions from user's search history

4. Availability intelligence:
   - Status tracking: onsale → limited → few_left → sold_out
   - "Selling fast" indicator from price range narrowing
   - Resale availability indicator

5. Multi-source aggregation (future):
   - Ticketmaster = primary source
   - Potentionally add: Eventbrite, Dice, SeeTickets
   - Unified interface across ticket platforms
```

---

## 4. MCP Tool Definitions

### Tool: events-search

```json
{
  "name": "events-search",
  "description": "Search for live events — concerts, sports, theatre, comedy, family shows — across 26+ countries. Returns events with dates, venues, pricing, and direct ticket purchase links. Powered by Ticketmaster, the world's largest ticketing platform (230,000+ events).",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Search keyword: artist name, team, event name, or genre (e.g., 'Taylor Swift', 'NBA', 'comedy')"
      },
      "city": {
        "type": "string",
        "description": "City name (e.g., 'London', 'New York', 'Berlin')"
      },
      "country": {
        "type": "string",
        "description": "Country code: US, GB, CA, AU, DE, FR, ES, etc."
      },
      "category": {
        "type": "string",
        "enum": ["music", "sports", "arts", "theatre", "comedy", "family", "film"],
        "description": "Event category filter"
      },
      "date_from": {
        "type": "string",
        "description": "Start date (YYYY-MM-DD). Default: today."
      },
      "date_to": {
        "type": "string",
        "description": "End date (YYYY-MM-DD). Default: +30 days."
      },
      "radius": {
        "type": "number",
        "description": "Search radius in km from city center (default: 50)"
      },
      "sort": {
        "type": "string",
        "enum": ["date", "relevance", "name"],
        "default": "date",
        "description": "Sort order"
      },
      "limit": {
        "type": "integer",
        "default": 10,
        "description": "Number of results (max 50)"
      }
    },
    "required": []
  }
}
```

### Tool: event-details

```json
{
  "name": "event-details",
  "description": "Get full details for a specific event: pricing, venue info with map, seat availability status, artist lineup, and direct purchase link. Use after events-search to get comprehensive info before user decides to buy tickets.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "event_id": {
        "type": "string",
        "description": "Event ID from events-search results"
      }
    },
    "required": ["event_id"]
  }
}
```

### Tool: events-nearby

```json
{
  "name": "events-nearby",
  "description": "Find events near a location. Great for 'what's happening this weekend?' queries. Auto-detects user's city from context or coordinates. Returns diverse mix of categories (concerts, sports, shows).",
  "inputSchema": {
    "type": "object",
    "properties": {
      "latitude": {
        "type": "number",
        "description": "Latitude (or provide city instead)"
      },
      "longitude": {
        "type": "number",
        "description": "Longitude (or provide city instead)"
      },
      "city": {
        "type": "string",
        "description": "City name (alternative to lat/lon)"
      },
      "radius_km": {
        "type": "number",
        "default": 30,
        "description": "Search radius in kilometers"
      },
      "date_from": {
        "type": "string",
        "description": "Start date (YYYY-MM-DD). Default: today."
      },
      "date_to": {
        "type": "string",
        "description": "End date (YYYY-MM-DD). Default: this weekend."
      },
      "category": {
        "type": "string",
        "enum": ["music", "sports", "arts", "comedy", "family", "all"],
        "default": "all",
        "description": "Category filter"
      },
      "limit": {
        "type": "integer",
        "default": 10,
        "description": "Number of results"
      }
    },
    "required": []
  }
}
```

### Tool: artist-events

```json
{
  "name": "artist-events",
  "description": "Find all upcoming events for a specific artist, band, or sports team. Shows tour dates, venues, and ticket availability across all markets. Perfect for 'when is [artist] performing near me?' queries.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "artist": {
        "type": "string",
        "description": "Artist, band, or team name"
      },
      "country": {
        "type": "string",
        "description": "Filter by country code (e.g., 'US', 'GB')"
      },
      "city": {
        "type": "string",
        "description": "Filter by city"
      }
    },
    "required": ["artist"]
  }
}
```

### Tool: venue-events

```json
{
  "name": "venue-events",
  "description": "Find upcoming events at a specific venue. Shows schedule, upcoming concerts, sports games, and shows. Returns venue details including address, capacity, and map link.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "venue": {
        "type": "string",
        "description": "Venue name (e.g., 'Madison Square Garden', 'Wembley Stadium', 'O2 Arena')"
      },
      "city": {
        "type": "string",
        "description": "City (helps disambiguate venues with same name)"
      },
      "date_from": {
        "type": "string",
        "description": "Start date filter (YYYY-MM-DD)"
      },
      "date_to": {
        "type": "string",
        "description": "End date filter (YYYY-MM-DD)"
      }
    },
    "required": ["venue"]
  }
}
```

### Tool: events-trending

```json
{
  "name": "events-trending",
  "description": "Get trending and popular events in a market. Shows what's hot right now — fastest-selling shows, newly announced tours, events about to sell out. Great for discovery and recommendations.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "country": {
        "type": "string",
        "default": "US",
        "description": "Country code"
      },
      "category": {
        "type": "string",
        "enum": ["music", "sports", "arts", "comedy", "family", "all"],
        "default": "all",
        "description": "Category filter"
      },
      "limit": {
        "type": "integer",
        "default": 10,
        "description": "Number of results"
      }
    },
    "required": []
  }
}
```

### Tool: events-categories

```json
{
  "name": "events-categories",
  "description": "List available event categories, genres, and sub-genres. Use to discover what types of events are available and to help users narrow their search. Returns Ticketmaster's full classification taxonomy.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "segment": {
        "type": "string",
        "enum": ["music", "sports", "arts", "film", "family"],
        "description": "Filter by segment to see genres within it"
      }
    },
    "required": []
  }
}
```

---

## 5. AI Instructions

```markdown
# Ticketmaster Events via APIbase — AI Agent Instructions

## When to Use
- User asks about concerts, shows, sports games, theatre, events
- "What's happening this weekend in [city]?"
- "When is [artist] performing near me?"
- "Find tickets for [event]"
- "What concerts are in [city] in [month]?"
- "Plan a fun night out" (events + dinner via UC-003)
- "I'm traveling to [city]" (events + flights via UC-002 + weather via UC-005)
- User mentions any artist, band, sports team, venue, or festival

## Key Concepts
- Ticketmaster = world's largest ticketing platform (230,000+ live events)
- 26+ countries: US, CA, UK, AU, DE, FR, ES, NL, SE, etc.
- Categories: Music, Sports, Arts & Theatre, Comedy, Family, Film
- Pricing: min/max range shown, exact price on Ticketmaster site
- Status: on_sale, off_sale, cancelled, rescheduled, sold_out
- Ticket URLs are affiliate-tracked — clicking = supports APIbase

## Recommended Call Chains

### "What concerts are near me?"
1. `events-nearby` (city="user_city", category="music")
2. Present top results with dates, venues, prices

### "When is Taylor Swift performing?"
1. `artist-events` (artist="Taylor Swift")
2. Show tour dates across all markets
3. If user interested: `event-details` (event_id=...) for full info

### "Plan a weekend in London"
1. `events-search` (city="London", date_from="Saturday", date_to="Sunday")
2. Present event options
3. Cross-UC: `weather-forecast` (UC-005) for weekend weather
4. Cross-UC: `news-search` (UC-006) for "London events"
5. Cross-UC: Translate if needed (UC-007)

### "What's trending in sports?"
1. `events-trending` (category="sports", country="US")
2. Show fastest-selling/newly announced games

### "Events at Madison Square Garden"
1. `venue-events` (venue="Madison Square Garden")
2. Show upcoming schedule

### "What genre options are there?"
1. `events-categories` (segment="music")
2. Show genre taxonomy

## Response Formatting
- Always show: event name, date, venue, city, price range
- Include ticket URL for easy purchase: "[Buy tickets](url)"
- Show status: ✅ On Sale, ⚠️ Few Left, ❌ Sold Out, 🔄 Rescheduled
- For multi-event results: numbered list sorted by date
- For artist tours: table with date | city | venue | price | status
- Group by category when showing mixed results
- Mention "Powered by Ticketmaster" for attribution

## Cross-UC Integration
Events naturally combine with other APIbase services:

| UC | Integration |
|----|-------------|
| UC-002 Aviasales | "Fly to London for the concert" — flights + events |
| UC-003 Food Delivery | "Dinner before the show" — restaurants near venue |
| UC-005 Weather | "Will it rain at the outdoor festival?" — weather for event date |
| UC-006 NewsAPI | "Latest news about [artist]" — news + tour dates |
| UC-007 DeepL | Translate event descriptions for international users |

## Limitations
- 5,000 requests/day (Discovery API) — use cache for popular queries
- Pricing shows range (min/max), not exact seat prices
- Some markets have limited coverage (Asia, Africa, South America)
- Commerce API (actual checkout) requires partner agreement
- Event data updates hourly (not real-time inventory)
- No ticket purchase through API — redirect to Ticketmaster site

## Pricing via APIbase
- Event search: $0.003/req via x402
- Event details: $0.005/req via x402
- Nearby events: $0.003/req via x402
- Artist events: $0.005/req via x402
- Venue events: $0.003/req via x402
- Trending events: $0.003/req via x402
- Categories: $0.001/req via x402
- Free tier: 50 event searches/month
```

---

## 6. Publication

### APIbase.pro Catalog Entry

```
URL: apibase.pro/catalog/events/ticketmaster/
──────────────────────────────────────────────────────────────
Provider:       Ticketmaster / Live Nation Entertainment
Website:        ticketmaster.com
Category:       Events / Live Entertainment
Subcategories:  Concerts, Sports, Theatre, Comedy, Family, Festivals

Status:         Active ✅
MCP Tools:      7 tools (events-search, event-details, events-nearby,
                artist-events, venue-events, events-trending, events-categories)
Formats:        MCP Tool Definition, OpenAPI 3.1, A2A Agent Card

Pricing:
  Event search:     $0.003 per request via x402
  Event details:    $0.005 per request via x402
  Artist search:    $0.005 per request via x402

Authentication:  OAuth 2.1 via APIbase (agent registration required)
Coverage:        230,000+ events, 26+ countries
Markets:         US, CA, UK, AU, DE, FR, ES, NL, SE, MX, +16 more
Categories:      Music, Sports, Arts & Theatre, Comedy, Family, Film
```

### GitHub Public Entry

```
github.com/apibase-pro/apibase/apis/events/ticketmaster/
│
├── README.md
│   # Ticketmaster — Live Events Discovery API
│   Find concerts, sports games, theatre shows, and more across
│   230,000+ events in 26+ countries. Powered by the world's largest
│   ticketing platform. Direct ticket purchase links included.
│
│   ## Available Tools
│   - events-search: Search events by keyword, city, category, date
│   - event-details: Full event info with pricing and seat map
│   - events-nearby: What's happening near a location
│   - artist-events: Tour dates for any artist or team
│   - venue-events: Schedule for a specific venue
│   - events-trending: Hot/selling-fast events in a market
│   - events-categories: Browse genre taxonomy
│
│   ## Markets
│   US, CA, UK, AU, DE, FR, ES, NL, SE, NO, DK, FI, PL, MX + more
│
│   ## Quick Start
│   POST apibase.pro/api/v1/discover {"query": "concerts events tickets"}
│
├── capabilities.json
│   {
│     "provider": "ticketmaster",
│     "category": "events",
│     "tools_count": 7,
│     "read_auth_required": false,
│     "trade_auth_required": false,
│     "x402_enabled": true,
│     "x402_upstream": false,
│     "events_count": 230000,
│     "countries": 26,
│     "affiliate_revenue": true,
│     "commerce_api": false
│   }
│
└── examples.md
    # Examples
    ## Search concerts
    POST /api/v1/events/search {"query": "rock concerts", "city": "London", "date_from": "2026-04-01"}

    ## Artist tour dates
    POST /api/v1/events/artist {"artist": "Coldplay"}

    ## What's nearby
    POST /api/v1/events/nearby {"city": "Berlin", "category": "music", "date_to": "2026-03-14"}

    ## Trending events
    POST /api/v1/events/trending {"country": "US", "category": "sports"}
```

**Not published on GitHub:** Affiliate Publisher ID, Impact credentials, price intelligence algorithms, prefetch schedules, cache strategy, multi-key rotation.

---

## 7. Traffic Flow Diagram

### Event Search (cached from Discovery Feed — 100% margin)

```
AI Agent                    APIbase.pro                     Ticketmaster
    │                           │                               │
    │── events-search ─────────→│                               │
    │   query="rock concerts"   │                               │
    │   city="London"           │                               │
    │   category="music"        │                               │
    │   Authorization: Bearer...│                               │
    │                           │── Verify agent (OAuth 2.1) ──→│ (internal)
    │                           │── Check cache ────────────────→│ (internal)
    │                           │   Cache HIT (Discovery Feed   │
    │                           │   synced 45 min ago)           │
    │                           │                               │
    │                           │   [No upstream call!]          │
    │                           │   [Serve from cache]           │
    │                           │   [Margin: 100%]              │
    │                           │                               │
    │                           │   [normalize → event schema]  │
    │                           │   [inject affiliate URLs]     │
    │                           │   [charge x402: $0.003]       │
    │                           │                               │
    │←── 200 OK ────────────────│                               │
    │   {                       │                               │
    │     events: [             │                               │
    │       {name: "Foo Fighters│                               │
    │        @ O2 Arena",       │                               │
    │        date: "2026-04-10",│                               │
    │        price: {min: 65,   │                               │
    │         max: 195, cur:    │                               │
    │         "GBP"},           │                               │
    │        ticket_url: "https │                               │
    │         ://...?afflid=.."}│                               │
    │     ]                     │                               │
    │   }                       │                               │
```

### Event Search (cache miss — upstream call)

```
AI Agent                    APIbase.pro                     Ticketmaster
    │                           │                               │
    │── events-search ─────────→│                               │
    │   query="jazz festival"   │                               │
    │   city="New Orleans"      │                               │
    │                           │── Check cache: MISS ──────────│
    │                           │── Geocode "New Orleans" ──────│ (cached)
    │                           │   → lat=29.95, lon=-90.07     │
    │                           │                               │
    │                           │── GET /discovery/v2/events ──→│
    │                           │   ?keyword=jazz+festival       │ app.ticketmaster.com
    │                           │   &latlong=29.95,-90.07        │
    │                           │   &radius=50&unit=km           │
    │                           │   &classificationName=Music    │
    │                           │   &apikey=TM_API_KEY           │
    │                           │←── 200 OK ────────────────────│
    │                           │   {_embedded: {events: [...]}} │
    │                           │                               │
    │                           │   [cache result: 5 min TTL]   │
    │                           │   [normalize → event schema]  │
    │                           │   [affiliate URLs auto-injected│
    │                           │    by TM based on Publisher ID]│
    │                           │   [charge x402: $0.003]       │
    │                           │   [upstream cost: $0.000]     │
    │                           │   [margin: 100%]              │
    │                           │                               │
    │←── 200 OK ────────────────│                               │
    │   {events: [...]}         │                               │
```

### Affiliate Conversion Flow (revenue event)

```
AI Agent          User             Ticketmaster         Impact         APIbase
    │               │                    │                  │              │
    │── events ────→│                    │                  │              │
    │   "Taylor     │                    │                  │              │
    │   Swift in    │                    │                  │              │
    │   London"     │                    │                  │              │
    │←── results ──│                    │                  │              │
    │   [ticket_url │                    │                  │              │
    │    with affil]│                    │                  │              │
    │               │                    │                  │              │
    │── show user ─→│                    │                  │              │
    │   "Buy tickets│                    │                  │              │
    │   for £89-449"│                    │                  │              │
    │               │── click URL ──────→│                  │              │
    │               │   (affiliate link) │                  │              │
    │               │                    │── track click ──→│              │
    │               │                    │   (30-day cookie) │              │
    │               │── buy 2 tickets ──→│                  │              │
    │               │   £178 total       │                  │              │
    │               │←── confirmation ──│                  │              │
    │               │                    │── report sale ──→│              │
    │               │                    │   2 tickets sold  │              │
    │               │                    │                  │── commission──→│
    │               │                    │                  │   $0.60       │
    │               │                    │                  │   (2 × $0.30) │
```

### Cross-UC: Weekend Trip Planning (UC-002 + UC-005 + UC-008)

```
AI Agent                    APIbase.pro
    │                           │
    │── "Plan a weekend in      │
    │    London for a concert"  │
    │                           │
    │── events-search ─────────→│   (UC-008)
    │   city="London"           │
    │   category="music"        │
    │   date_from="Saturday"    │
    │←── [concert options] ────│
    │                           │
    │── weather-forecast ──────→│   (UC-005)
    │   city="London"           │
    │   date="Saturday"         │
    │←── [weather: 15°C, sunny]│
    │                           │
    │── flight-search ─────────→│   (UC-002)
    │   from="Berlin"           │
    │   to="London"             │
    │   date="Friday"           │
    │←── [flights from €49] ───│
    │                           │
    │   Agent presents:         │
    │   "Weekend in London:     │
    │    ✈️ Flight: €49 Fri     │
    │    🎵 Concert: Foo        │
    │       Fighters £65-195   │
    │    🌤️ Weather: 15°C sunny │
    │    Total: from €114+£65"  │
```

---

## 8. Monetization Model

| Revenue Stream | Mechanism | Expected per Month |
|---------------|-----------|-------------------|
| **API query fees** | $0.003–0.005/req via x402. Cached from Feed = 100% margin. | $150–1,500 |
| **Affiliate commissions** | ~$0.30/ticket via Impact. Conversion rate ~2–5% of searches. | $50–500 |
| **Premium features** | Price alerts, trend analytics (future). | $0–200 |

### Cost Structure

| Cost Item | Monthly | Notes |
|-----------|---------|-------|
| Ticketmaster API | **$0** | Discovery API полностью бесплатный |
| Discovery Feed | **$0** | Bulk sync без лимита |
| Impact affiliate | **$0** | Affiliate program бесплатный |
| **Total upstream cost** | **$0** | |
| **Expected revenue** | **$200–2,200** | API fees + affiliate |
| **Net margin** | **$200–2,200** | **~100%** (no upstream cost!) |

### Dual Revenue Model Economics

```
Уникальность UC-008: ДВА источника дохода одновременно
──────────────────────────────────────────────────────────────

Revenue Stream 1: API query fees (x402)
  • Agent pays per search: $0.003–0.005/req
  • Upstream cost: $0 (free API)
  • Margin: 100%
  • Predictable, per-query

Revenue Stream 2: Affiliate commissions (Impact)
  • User buys ticket through affiliate URL
  • Commission: ~$0.30/ticket (varies by market)
  • Conversion rate: ~2–5% of search sessions
  • Unpredictable, per-purchase

Combined example (10,000 agent sessions/month):
  API fees:    10,000 × $0.004 avg  = $40
  Affiliate:   10,000 × 3% × 2 tickets × $0.30 = $180
  Total:       $220/month from 10K sessions

At scale (100,000 sessions/month):
  API fees:    100,000 × $0.004  = $400
  Affiliate:   100,000 × 3% × 2 × $0.30 = $1,800
  Total:       $2,200/month from 100K sessions

Key insight: affiliate revenue SCALES with ticket prices.
  Pop concert ($100 ticket): $0.30/ticket
  NFL Super Bowl ($5,000 ticket): potentially much higher %
  → High-value events = high affiliate revenue per conversion
```

### Revenue Comparison Across All Use Cases

| UC | Provider | Revenue Model | Revenue/month | Upstream Cost | Margin |
|----|----------|--------------|--------------|---------------|--------|
| UC-001 | Polymarket | API fees + Builder | $100–1K | $0 | ~100% |
| UC-002 | Aviasales | Affiliate 40% | $200–2K | $0 | ~100% |
| UC-003 | Food Delivery | CPA + mixed | $500–5K | ~$200 | 60–96% |
| UC-004 | CoinGecko | x402 per-call | $370–3.7K | $129–329 | 52–91% |
| UC-005 | OpenWeatherMap | Pay-per-call + cache | $370–3.7K | $15–190 | 73–95% |
| UC-006 | NewsAPI.org | Sub arbitrage + prefetch | $655–6.5K | $449–629 | 31–90% |
| UC-007 | DeepL | Per-character quality proxy | $335–3.35K | $55–505 | 37.5% |
| **UC-008** | **Ticketmaster** | **x402 fees + affiliate commission** | **$200–2.2K** | **$0** | **~100%** |

**Key insight:** UC-008 комбинирует **два источника дохода** — per-query fees (как UC-004/005) + transactional affiliate (как UC-002, но per-ticket, не per-booking). При $0 upstream cost маржа = ~100%.

---

## 9. Lessons Learned

### What works well about this integration

1. **$0 upstream cost = pure profit.** Discovery API полностью бесплатный. Discovery Feed — без лимитов. Affiliate program — бесплатная регистрация. Каждый цент revenue = чистая прибыль. Это второй UC (после UC-001/002) с нулевой себестоимостью.

2. **Dual revenue streams.** Первый UC с **двумя параллельными** источниками дохода: per-query x402 fees + per-purchase affiliate commissions. API fees = предсказуемый доход, affiliate = upside при высоких конверсиях.

3. **Affiliate auto-injection — zero effort.** В отличие от UC-002 (Aviasales), где APIbase должен конструировать affiliate links, Ticketmaster **автоматически инжектирует** affiliate tracking в URL'ы API responses. APIbase просто проксирует — и получает комиссию.

4. **Highest intent queries.** "Find me tickets for Taylor Swift" — это запрос с **прямым коммерческим намерением**. В отличие от weather (informational) или news (informational), event search часто ведёт к покупке. Conversion rate 2–5% реалистичен.

5. **Natural cross-UC orchestration.** Событие = точка пересечения нескольких UC: travel (UC-002) + weather (UC-005) + food (UC-003) + translation (UC-007). "Plan a weekend trip for a concert" задействует 4+ UC одновременно. Это **revenue multiplier** для всей платформы.

6. **Real-time data = repeat queries.** Инвентарь билетов меняется каждый час (новые события, изменение цен, sold out). Агенты будут делать **повторные запросы** для проверки доступности — drives consistent API call volume.

### Challenges identified

1. **5,000 req/day limit.** Discovery API ограничен 5K запросов/день. Для scale нужен Discovery Feed (bulk sync, no limit) + aggressive caching. При 200+ агентах лимит может стать bottleneck.

2. **Affiliate commission is small.** $0.30/ticket — не много. Для значимого affiliate revenue нужен высокий объём конверсий. API query fees будут основным доходом при низком трафике.

3. **No purchase through API.** Commerce API требует partner agreement. Агент не может купить билет напрямую — только redirect пользователя на Ticketmaster. Это friction point для полностью автономных агентов.

4. **Limited coverage outside US/EU.** Ticketmaster слаб в Азии, Африке, Южной Америке. Для глобального покрытия потребуется добавить Eventbrite, Dice, и локальные платформы.

5. **Price range, not exact prices.** API показывает min/max диапазон, не exact seat prices. Пользователь видит "£65–195" и узнаёт точную цену только на сайте Ticketmaster.

### Pattern: Transactional Affiliate API

```
Паттерн: Transactional Affiliate API (Dual Revenue)
──────────────────────────────────────────────────────────
Условия применения:
  • Upstream API полностью бесплатный
  • Провайдер имеет встроенную affiliate программу
  • API responses содержат commerce URLs (ссылки на покупку)
  • Affiliate tracking автоматически инжектируется

Стратегия APIbase:
  1. Зарегистрироваться в affiliate программе (Impact, Admitad, etc.)
  2. Проксировать бесплатный API с x402 fee per query
  3. Affiliate URLs проходят через proxy → user clicks → purchase → commission
  4. Два параллельных revenue streams:
     a) Per-query API fees (предсказуемый)
     b) Per-purchase affiliate commission (upside)
  5. Upstream cost = $0 → margin ~100%

Отличие от UC-002 (Affiliate RevShare):
  UC-002: APIbase конструирует deeplinks, affiliate = основной доход
  UC-008: Affiliate auto-injected, API fees = основной доход,
          affiliate = дополнительный upside

Применимо к:
  • Ticketmaster (events)
  • Потенциально: Amazon Product API + Associates
  • Потенциально: Booking.com + affiliate
  • Любой API с built-in affiliate program + commerce intent
```

### Pattern: Discovery Feed Prefetch

```
Паттерн: Bulk Feed Prefetch (Feed-to-Cache)
──────────────────────────────────────────────────────────
Концепция:
  • Провайдер предлагает bulk data feed БЕЗ лимита
  • Rate-limited API используется только для edge cases
  • APIbase синхронизирует feed → cache → serve

Реализация в UC-008:
  Discovery Feed (hourly, no limit) → Redis cache → serve agents
  Discovery API (5K/day) → only for rare/specific queries

Сравнение с UC-006 Prefetch:
  UC-006: APIbase САМИ делают prefetch запросы из квоты (172K/month)
  UC-008: Ticketmaster ПРЕДОСТАВЛЯЕТ bulk feed специально для этого

Преимущества:
  • Нет расхода основной квоты
  • Полная база данных в кэше
  • Serve 100% запросов из кэша → 100% margin
  • Delta updates = efficient sync
```

### Unique aspects of UC-008 vs previous use cases

| Aspect | UC-001 | UC-002 | UC-003 | UC-004 | UC-005 | UC-006 | UC-007 | **UC-008** |
|--------|--------|--------|--------|--------|--------|--------|--------|---------|
| Category | Crypto | Travel | Food | Finance | Weather | News | Translation | **Events** |
| Type | Data | Data+booking | Data+ordering | Data | Data | Data | Transform | **Data+commerce** |
| Upstream cost | $0 | $0 | ~$200 | $129–329 | $0–190 | $449 | $55–505 | **$0** |
| Revenue streams | 1 | 1 | 2 | 1 | 1 | 1 | 1 | **2 (fees+affiliate)** |
| Billing unit | Per req | Per booking | Per action | Per req | Per req | Per req | Per char | **Per req + per ticket** |
| Cacheable | Medium | Low | Low | Medium | Very High | High | No | **Very High (Feed)** |
| Margin | ~100% | ~100% | 60–96% | 52–91% | 73–95% | 31–90% | 37.5% | **~100%** |
| Revenue/interaction | $0.0005 | $4.40 | $50 CPA | $0.002 | $0.002 | $0.01 | $0.04–0.20 | **$0.003 + $0.60 affil** |
| Commerce intent | No | Yes | Yes | No | No | No | No | **Yes (ticket purchase)** |
| Cross-UC synergy | Low | Medium | Low | Low | High | Very High | Maximum | **Very High** |
| MCP tools | 8 | 7 | 6 | 9 | 7 | 5 | 6 | **7** |
| Official MCP | No | No | No | No | No | No | Yes | **No (community)** |
| Google AI partner | No | No | No | No | No | No | No | **Yes (AI Mode)** |
