# UC-012: Geoapify + Valhalla (Maps / Navigation / Geolocation)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-012 |
| **Provider** | Geoapify (geocoding, POI, places) + Valhalla (routing, self-hosted) |
| **Category** | Maps & Navigation / Geolocation |
| **Date Added** | 2026-03-07 |
| **Status** | Reference |
| **Client** | APIbase (platform-level integration) |

---

## 1. Client Input Data

Интеграция на уровне платформы — APIbase объединяет hosted Geoapify API + self-hosted Valhalla routing:

```
Тип данных:          Значение:
──────────────────────────────────────────────────────────
Geoapify API Key     Free key (мгновенный, 3,000 credits/day)
Geoapify Paid Plan   $59-299/мес (10K-100K credits/day, при scale)
Valhalla Instance    Self-hosted (MIT license, ~$500-1500/мес infra)
OSM Planet Data      Free download (100+ GB, weekly updates)
```

### Sufficiency Assessment

| Data provided | What it enables | Sufficient? |
|---------------|----------------|-------------|
| Geoapify Free (3K credits/day) | Geocoding, reverse geocoding, 400+ POI categories, batch processing, isochrones, boundaries, postcodes, IP geolocation, geometry ops | **Yes** — 90K req/мес free tier |
| Geoapify Paid ($59-299/мес) | 10K-100K credits/day, priority support, SLA | **Yes** — scaling path |
| Valhalla Self-hosted (MIT) | Routing, directions, distance matrix, isochrones, time-distance matrices, turn-by-turn navigation | **Yes** — zero per-query cost |
| OSM Planet Data (ODbL) | Full planet geodata, weekly updates, permanent cache rights | **Yes** — foundation layer |

**Verdict:** Гибридная архитектура: Geoapify (hosted API с permissive data terms) для geocoding/POI + Valhalla (self-hosted MIT) для routing. Geoapify **явно разрешает permanent cache, storage и redistribution** результатов с OSM attribution. Это первый UC с **Cross-UC Enrichment Engine** — геолокация обогащает UC-002 (Travel), UC-003 (Food), UC-005 (Weather), UC-008 (Events), UC-011 (Health).

### Стратегический контекст: почему Geoapify+Valhalla, а не Google/Mapbox/HERE

```
Ситуация в Maps API (март 2026):
──────────────────────────────────────────────────────────────

DISQUALIFIED по ToS:
  × Google Maps:    "Will not sell, resell, sublicense, transfer,
                     or distribute the Services"
                     + 30-day cache limit on lat/lng
                     + bulk download запрещён

  × Mapbox:         "Not for resale, distribution, or sublicense"
                     + "shall not redistribute Licensed Map Content,
                       including from a cache, by PROXYING"
                     (!!слово "proxying" в ToS — прямо наш use case)

  × HERE:           ЯВНЫЙ AI/LLM BAN: "Use HERE Materials in
                     connection with AI system, including...
                     natural language processing... generative AI"
                     + 30-day cache limit

  × TomTom:         "machine learning or AI algorithm" запрещён
                     + "caching for purpose of scaling results
                       to serve multiple clients" запрещён

  × OpenRouteService: "May not redistribute hosted API services...
                       including by proxying" (public API only)

СТРАТЕГИЯ APIbase — ГИБРИД:
  ✓ Geoapify = hosted API, OSM-based, permissive data terms
    • Explicit: "cache, store, and redistribute" разрешено
    • 400+ POI categories
    • Batch geocoding (50% savings)
    • Geocoding NOT triggering ODbL share-alike (OSM Foundation ruling)

  ✓ Valhalla = self-hosted routing engine (MIT license)
    • $0 per query, zero ToS restrictions
    • Turn-by-turn, isochrones, distance matrices
    • Infrastructure: ~$500-1500/мес

  ✓ RESULT: 80-90% quality of Google Maps at 5-10% cost
    • AI agents can ask clarifying questions (compensates accuracy gap)
    • Permanent cache → accuracy improves over time
    • Cross-UC enabler для 5+ existing UCs
```

---

## 2. Provider API Analysis

### API Architecture

**Geoapify** — hosted geolocation platform built on OpenStreetMap с enriched data. Предоставляет geocoding, reverse geocoding, places search (400+ POI categories), routing, isochrones, batch processing, boundaries, postcodes, IP geolocation, и 40+ geometry operations. Data terms позволяют permanent cache и redistribution.

**Valhalla** — open source routing engine (MIT license, originally by Mapbox). Поддерживает turn-by-turn directions, distance matrices, isochrones, multiple transport modes (car, bike, pedestrian, public transit). Self-hosted на OSM planet data.

| Service | Base URL | Auth | Description |
|---------|----------|------|-------------|
| **Geocoding** | `https://api.geoapify.com/v1/geocode/search` | API Key | Address/place → coordinates |
| **Reverse Geocoding** | `https://api.geoapify.com/v1/geocode/reverse` | API Key | Coordinates → address |
| **Places** | `https://api.geoapify.com/v2/places` | API Key | POI search: 400+ categories |
| **Batch** | `https://api.geoapify.com/v1/batch` | API Key | Batch geocoding (50% discount) |
| **Routing** (Geoapify) | `https://api.geoapify.com/v1/routing` | API Key | Directions: car, bike, walk |
| **Routing** (Valhalla) | `self-hosted:8002/route` | None | Turn-by-turn, all modes |
| **Isochrone** | `self-hosted:8002/isochrone` | None | Reachable area by time/distance |
| **Distance Matrix** | `self-hosted:8002/sources_to_targets` | None | N×M travel times/distances |
| **Boundaries** | `https://api.geoapify.com/v1/boundaries` | API Key | Admin boundaries by point |
| **IP Geolocation** | `https://api.geoapify.com/v1/ipinfo` | API Key | IP → country/city/coordinates |

### Key Endpoints

#### Geocoding (Geoapify)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /v1/geocode/search` | GET | Forward geocoding: address/place → lat/lng |

**Параметры:**
```
text               — поисковый запрос ("Times Square, New York", "CDG airport")
lang               — язык результатов (en, ru, de, fr...)
limit              — макс. результатов (1-50)
type               — фильтр: city, street, amenity, country
filter             — geographic filter (rect, circle, countrycode)
bias               — proximity bias (lat,lon)
format             — json (default)
```

**Возвращает:**
```
lat, lon           — координаты
formatted          — полный адрес ("Times Square, New York, NY 10036, USA")
address_line1      — улица + номер
address_line2      — город, штат, страна
city               — город
state              — штат/регион
country            — страна
country_code       — ISO 3166-1 alpha-2
postcode           — почтовый индекс
timezone           — "America/New_York"
result_type        — amenity, street, city, country
rank               — confidence score
place_id           — unique place identifier
```

#### Places / POI (Geoapify)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /v2/places` | GET | POI search by category + location |

**400+ POI categories (examples):**
```
Catering:      restaurant, cafe, fast_food, bar, pub, ice_cream
Healthcare:    hospital, pharmacy, dentist, veterinary
Transport:     airport, bus_station, train_station, parking, fuel
Leisure:       cinema, theatre, museum, park, playground, gym
Commercial:    supermarket, mall, electronics, clothing, bookshop
Accommodation: hotel, hostel, motel, apartment
Tourism:       attraction, viewpoint, artwork, information
Service:       bank, atm, post_office, police, fire_station
Education:     school, university, library, kindergarten
Sport:         stadium, swimming_pool, tennis_court, golf_course
Charging:      ev_charging (electric vehicle chargers)
```

#### Routing (Valhalla, self-hosted)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /route` | POST | Turn-by-turn directions |

**Параметры:**
```
locations[]        — [{lat, lon}, {lat, lon}, ...] waypoints
costing            — auto, bicycle, pedestrian, bus, multimodal
directions_options — units (km/mi), language
date_time          — departure/arrival time (for traffic)
```

**Возвращает:**
```
trip.legs[].maneuvers[] — turn-by-turn instructions:
  instruction          — "Turn right onto Broadway"
  type                 — turn, depart, arrive, continue
  street_names         — ["Broadway", "7th Ave"]
  length               — distance (km)
  time                 — time (seconds)

trip.summary:
  length               — total distance (km)
  time                 — total time (seconds)
  has_toll             — bool
  has_highway          — bool
  min_lat/max_lat      — bounding box
```

#### Isochrone (Valhalla, self-hosted)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /isochrone` | POST | Reachable area polygon |

**Параметры:**
```
locations[]        — center point [{lat, lon}]
costing            — auto, bicycle, pedestrian
contours[]         — [{time: 15}, {time: 30}] minutes
                      or [{distance: 5}] km
polygons           — true → return GeoJSON polygons
```

**Возвращает:** GeoJSON FeatureCollection с полигонами reachable areas.

### Rate Limits & Pricing

| Service | Free Tier | Paid Plans | Per-Credit Cost |
|---------|-----------|-----------|----------------|
| **Geoapify** | 3,000 credits/day (~90K/мес) | $59/мес (10K/day), $179/мес (30K/day), $299/мес (100K/day) | ~$0.003-0.006/credit |
| **Valhalla** (self-hosted) | Unlimited | $500-1500/мес infra | ~$0.0001-0.001/query |
| **OSM Data** | Free | Free | $0 |

### Credit System (Geoapify)

```
1 credit = 1 basic geocoding/reverse geocoding request
1 credit = 1 places search
2 credits = 1 routing request (start + end)
5 credits = 1 isochrone request
Batch: 50% discount (0.5 credits per item)

Optimization: many queries can be routed to self-hosted Valhalla
instead of consuming Geoapify credits.
```

### Licensing & ToS

| Component | License | Commercial | Resale Data | AI Use | Cache |
|-----------|---------|-----------|-------------|--------|-------|
| **Geoapify API** | Proprietary SaaS | ✅ Yes | ✅ Yes (results) | ✅ Yes | **✅ Permanent** |
| **Geoapify Data** | ODbL (OSM) | ✅ Yes | ✅ Yes + attribution | ✅ Yes | **✅ Permanent** |
| **Valhalla** | MIT | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Full control |
| **OSM Data** | ODbL | ✅ Yes | ✅ Yes + share-alike* | ✅ Yes | ✅ Permanent |

*OSM Foundation ruling: geocoding results do NOT trigger ODbL share-alike.

**Key ToS distinction:** Geoapify API service = non-sublicensable (cannot resell access to their endpoint). BUT results/data from queries = can be cached, stored, redistributed with OSM attribution. APIbase uses its own API key → processes results → serves to agents via own MCP interface = legally clean.

---

## 3. APIbase Wrapper Design

### Architecture: Hybrid Geo Intelligence Layer

```
┌─────────────────────────────────────────────────────────────┐
│                 APIbase Geo Intelligence Layer                │
│                                                               │
│  ┌────────────────────┐  ┌──────────────────────────────────┐│
│  │ Geoapify (hosted)  │  │ Valhalla (self-hosted, MIT)      ││
│  │ • Geocoding        │  │ • Routing/Directions             ││
│  │ • Reverse geocoding│  │ • Distance matrices              ││
│  │ • Places/POI (400+)│  │ • Isochrones                     ││
│  │ • Boundaries       │  │ • Turn-by-turn navigation        ││
│  │ • IP geolocation   │  │ • Multi-modal (car/bike/walk)    ││
│  │ • Batch processing │  │ • Zero per-query cost            ││
│  └────────┬───────────┘  └──────────────┬───────────────────┘│
│           │                              │                    │
│           └──────────┬───────────────────┘                    │
│                      │                                        │
│         ┌────────────▼────────────────────────────────────┐  │
│         │        PERMANENT LOCATION CACHE                 │  │
│         │                                                 │  │
│         │  • Geocoding results (address → lat/lng)        │  │
│         │  • POI data (restaurants, pharmacies, etc.)     │  │
│         │  • Routing cache (popular origin-destination)   │  │
│         │  • Pre-computed isochrones (airports, cities)   │  │
│         │  • Growing knowledge base (never expires)       │  │
│         │  • PostGIS spatial indexing for nearby queries   │  │
│         └────────────────────┬────────────────────────────┘  │
│                              │                                │
│         ┌────────────────────▼────────────────────────────┐  │
│         │     CROSS-UC ENRICHMENT ENGINE                  │  │
│         │                                                 │  │
│         │  UC-002 (Travel):  airport proximity, ground    │  │
│         │  UC-003 (Food):    restaurants near, delivery   │  │
│         │  UC-005 (Weather): location → coords for OWM   │  │
│         │  UC-008 (Events):  venue directions, parking    │  │
│         │  UC-011 (Health):  nearest pharmacy/gym         │  │
│         │  UC-006 (News):    location context for news    │  │
│         └────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Wrapper Layers

#### Layer 1: Protocol Adapter

```
Upstream APIs:
  Geoapify:  REST + API key (query param) + JSON
  Valhalla:  REST + no auth + JSON (self-hosted)
  OSM Data:  PBF/XML files (bulk download)

APIbase unified:
  REST + x402 Bearer Token + normalized JSON
```

**Адаптация:**
- Geoapify JSON → normalized location objects with confidence scores
- Valhalla routing → simplified directions with time/distance/steps
- Smart routing: geocoding → Geoapify, routing → Valhalla (cost optimization)

#### Layer 2: Semantic Normalizer

```
Geoapify geocoding response (raw):
{
  "results": [{
    "datasource": {"sourcename": "openstreetmap"},
    "country": "United States",
    "country_code": "us",
    "state": "New York",
    "city": "New York",
    "suburb": "Manhattan",
    "street": "Broadway",
    "housenumber": "",
    "lon": -73.985131,
    "lat": 40.758896,
    "formatted": "Times Square, Manhattan, New York, NY, USA",
    "address_line1": "Times Square",
    "address_line2": "Manhattan, New York, NY, USA",
    "timezone": {"name": "America/New_York", "offset_STD": "-05:00"},
    "result_type": "amenity",
    "rank": {"confidence": 1, "match_type": "full_match"},
    "place_id": "5196..."
  }]
}

APIbase response (normalized):
{
  "location": {
    "name": "Times Square",
    "type": "landmark",
    "coordinates": {"lat": 40.758896, "lng": -73.985131},
    "address": {
      "full": "Times Square, Manhattan, New York, NY, USA",
      "street": "Broadway",
      "district": "Manhattan",
      "city": "New York",
      "state": "New York",
      "country": "United States",
      "country_code": "US",
      "postcode": "10036"
    },
    "timezone": {
      "name": "America/New_York",
      "utc_offset": "-05:00",
      "current_time": "2026-03-07T14:23:00-05:00"
    },
    "confidence": 1.0,
    "match_type": "exact"
  },
  "context": {
    "weather_coords": {"lat": 40.76, "lng": -73.99},
    "nearest_airport": {"code": "JFK", "name": "John F. Kennedy", "distance_km": 24.1},
    "currency": "USD",
    "driving_side": "right",
    "emergency_number": "911"
  }
}
```

#### Layer 3: Value-Add (Cross-UC Enrichment)

```
APIbase unique value — location intelligence enriching ALL UCs:

1. GEOCODING + CONTEXT
   "Times Square" →
     Coordinates: 40.7589, -73.9851
     Timezone: America/New_York
     Weather station: nearest OWM grid point
     Nearest airport: JFK (24 km), LGA (12 km), EWR (19 km)
     Currency: USD
     → Ready to feed UC-002 (flights), UC-005 (weather)

2. POI DISCOVERY + UC CROSS-SELL
   "Find restaurants near me" →
     Geoapify Places: 15 restaurants within 500m
     → UC-003 (food delivery): "Order from any of these?"
     → UC-011 (health): "This restaurant's avg meal: 850 kcal"
     → UC-009 (price): "Menu prices comparison"

3. ROUTING + EVENT CONTEXT
   "How do I get to Madison Square Garden?" →
     Valhalla routing: driving 18 min, subway 25 min, walk 42 min
     → UC-008 (events): "Tonight's Knicks game starts at 7:30 PM"
     → Parking POI: "Nearest parking: Icon Parking, 2 min walk"

4. ISOCHRONE + LOCATION IQ
   "What can I reach in 15 min by car?" →
     Valhalla isochrone: GeoJSON polygon
     → POI within polygon: 43 restaurants, 12 pharmacies, 3 hospitals
     → UC-003: delivery coverage area
     → UC-011: nearest health facilities

5. BATCH ENRICHMENT FOR OTHER UCs
   When UC-008 returns event list:
     → Batch geocode all venues → add lat/lng to each event
     → Pre-compute directions from user's location
     → Zero marginal cost (Geoapify batch = 50% discount, Valhalla = $0)
```

### Caching Strategy: Permanent Location Knowledge Base

```
Data Type              Cache Strategy           TTL
──────────────────────────────────────────────────────
Geocoding results      Permanent cache          ∞ (addresses stable)
Reverse geocoding      Permanent cache          ∞
POI data               Cache + refresh          30 days (businesses change)
Routing (popular)      Pre-compute + cache      7 days (road changes)
Routing (rare)         On-demand + cache        24 hours
Isochrones             Pre-compute (cities)     7 days
Distance matrices      Cache popular pairs      24 hours
IP geolocation         Cache                    7 days
Boundaries             Bulk download            90 days

Cache growth model:
  Day 1:    Seed with top-1000 cities geocoded + airport coords
  Month 1:  ~60% cache hit rate (popular locations cached)
  Month 3:  ~75% (growing knowledge base)
  Month 6:  ~85% (most queries = known locations)
  Month 12: ~90%+ (mature cache, rare misses)
  Year 2:   ~95% (like P10 TMDB, but for locations)

Key insight: addresses and coordinates DON'T CHANGE.
"Times Square" will always be at 40.7589, -73.9851.
Like TMDB (P10), geocoding data = permanent.
But POI data changes (restaurants open/close) → 30-day refresh.
```

### Error Handling

```
Upstream errors:
  Geoapify 429 (rate limit) → serve from permanent cache
  Geoapify 503 (service down) → serve from cache + Valhalla for routing
  Valhalla timeout → retry on secondary instance or queue

Graceful degradation:
  If Geoapify down → geocoding from permanent cache (90%+ hit rate at maturity)
  If Valhalla down → Geoapify routing endpoint (uses credits but works)
  If both down → cache-only mode (geocoding works, routing queued)

  APIbase geo layer RARELY fully fails — permanent cache + dual upstreams.
```

---

## 4. MCP Tool Definitions

### Tool 1: `geo-geocode`

```json
{
  "name": "geo-geocode",
  "description": "Преобразование адреса, названия места или ориентира в географические координаты (lat/lng). Возвращает точные координаты, структурированный адрес, timezone, country info и confidence score. Поддерживает fuzzy matching и неполные запросы. Powered by Geoapify + OSM.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Адрес, место, ориентир: 'Times Square', '221B Baker Street, London', 'CDG Airport', 'Tokyo Tower'"
      },
      "language": {
        "type": "string",
        "description": "Язык результатов (ISO 639-1): 'en', 'ru', 'de', 'fr', 'ja'. Default: 'en'"
      },
      "country_filter": {
        "type": "string",
        "description": "Фильтр по стране (ISO 3166-1 alpha-2): 'US', 'GB', 'DE'. Улучшает точность."
      },
      "limit": {
        "type": "integer",
        "description": "Количество результатов (1-5). Default: 1"
      }
    },
    "required": ["query"]
  }
}
```

**Pricing:** $0.001/request (x402)

**Upstream:** 1 Geoapify credit (cached permanently after first query)

### Tool 2: `geo-reverse`

```json
{
  "name": "geo-reverse",
  "description": "Преобразование географических координат в человекочитаемый адрес. Возвращает structured address (street, city, state, country, postcode), timezone, и nearby landmarks. 'Что находится в этой точке?'",
  "inputSchema": {
    "type": "object",
    "properties": {
      "lat": {
        "type": "number",
        "description": "Latitude (-90 to 90)"
      },
      "lng": {
        "type": "number",
        "description": "Longitude (-180 to 180)"
      },
      "language": {
        "type": "string",
        "description": "Язык результатов. Default: 'en'"
      }
    },
    "required": ["lat", "lng"]
  }
}
```

**Pricing:** $0.001/request (x402)

### Tool 3: `geo-places`

```json
{
  "name": "geo-places",
  "description": "Поиск точек интереса (POI) рядом с указанным местом. 400+ категорий: рестораны, аптеки, АЗС, EV-зарядки, банкоматы, парковки, отели, музеи, парки и др. Возвращает название, адрес, расстояние, категорию. Фильтрация по радиусу или времени в пути.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "location": {
        "type": "string",
        "description": "Место поиска: 'Times Square', координаты '40.7589,-73.9851', или адрес"
      },
      "category": {
        "type": "string",
        "description": "Категория POI: 'restaurant', 'pharmacy', 'gas_station', 'ev_charging', 'atm', 'parking', 'hotel', 'hospital', 'gym', 'supermarket', 'cinema', 'museum', 'park'. Полный список: 400+ категорий."
      },
      "radius_meters": {
        "type": "integer",
        "description": "Радиус поиска в метрах (100-50000). Default: 1000"
      },
      "limit": {
        "type": "integer",
        "description": "Максимум результатов (1-50). Default: 10"
      }
    },
    "required": ["location", "category"]
  }
}
```

**Pricing:** $0.003/request (x402)

### Tool 4: `geo-directions`

```json
{
  "name": "geo-directions",
  "description": "Построение оптимального маршрута между двумя или более точками с пошаговыми инструкциями. Поддерживает автомобиль, велосипед, пешком, общественный транспорт. Возвращает distance, time, turn-by-turn навигацию. Powered by Valhalla routing engine.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "origin": {
        "type": "string",
        "description": "Точка отправления: адрес, название или координаты"
      },
      "destination": {
        "type": "string",
        "description": "Точка назначения"
      },
      "mode": {
        "type": "string",
        "enum": ["drive", "walk", "bicycle", "transit"],
        "description": "Способ передвижения. Default: 'drive'"
      },
      "waypoints": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Промежуточные точки (до 5)"
      },
      "alternatives": {
        "type": "boolean",
        "description": "Показать альтернативные маршруты. Default: false"
      }
    },
    "required": ["origin", "destination"]
  }
}
```

**Pricing:** $0.005/request (x402)

**Upstream:** Geocoding (Geoapify, 0-2 credits, cached) + Valhalla routing ($0)

### Tool 5: `geo-distance-matrix`

```json
{
  "name": "geo-distance-matrix",
  "description": "Расчёт времени и расстояния между несколькими точками (N×M матрица). Используется для 'какой ближе?', оптимизации логистики, выбора лучшего варианта. Возвращает матрицу durations и distances для всех пар origin-destination.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "origins": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Точки отправления (1-10): адреса, названия или координаты"
      },
      "destinations": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Точки назначения (1-10)"
      },
      "mode": {
        "type": "string",
        "enum": ["drive", "walk", "bicycle"],
        "description": "Способ передвижения. Default: 'drive'"
      }
    },
    "required": ["origins", "destinations"]
  }
}
```

**Pricing:** $0.008/request (x402)

### Tool 6: `geo-reachable-area`

```json
{
  "name": "geo-reachable-area",
  "description": "Построение isochrone — области, достижимой за указанное время или расстояние. Отвечает на 'Что я могу достичь за 15 минут на машине?'. Возвращает GeoJSON polygon + количество POI разных категорий внутри области. Powered by Valhalla.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "location": {
        "type": "string",
        "description": "Центральная точка: адрес, название или координаты"
      },
      "time_minutes": {
        "type": "integer",
        "description": "Время в минутах (5-60). Default: 15"
      },
      "mode": {
        "type": "string",
        "enum": ["drive", "walk", "bicycle"],
        "description": "Способ передвижения. Default: 'drive'"
      },
      "include_poi_summary": {
        "type": "boolean",
        "description": "Включить summary POI внутри области (рестораны, аптеки и т.д.). Default: true"
      }
    },
    "required": ["location"]
  }
}
```

**Pricing:** $0.005/request (x402)

### Tool 7: `geo-enrich`

```json
{
  "name": "geo-enrich",
  "description": "Всестороннее обогащение локации: по минимальному контексту (город, координаты, адрес) возвращает полную location intelligence. Координаты, timezone, валюта, ближайший аэропорт, ближайшие рестораны, аптеки, события — cross-UC данные для UC-002 (Travel), UC-003 (Food), UC-005 (Weather), UC-008 (Events), UC-011 (Health).",
  "inputSchema": {
    "type": "object",
    "properties": {
      "location": {
        "type": "string",
        "description": "Любой location input: 'Paris', '40.7128,-74.0060', '221B Baker Street'"
      },
      "enrich_categories": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["airports", "restaurants", "pharmacies", "hospitals", "hotels", "attractions", "weather_station", "transit", "all"]
        },
        "description": "Категории для enrichment. Default: ['all']"
      },
      "radius_km": {
        "type": "number",
        "description": "Радиус enrichment в км (1-50). Default: 5"
      }
    },
    "required": ["location"]
  }
}
```

**Pricing:** $0.005/request (x402)

**Upstream:** 1 geocoding (cached) + 3-5 POI queries (cached) + 0 routing (Valhalla)

---

## 5. AI Instructions for Agents

### System Prompt Addition

```
You have access to APIbase Geo Intelligence tools powered by Geoapify + Valhalla
(OSM-based, global coverage, 400+ POI categories).

TOOLS AVAILABLE:
• geo-geocode: address/place → coordinates + timezone + country info
• geo-reverse: coordinates → human-readable address
• geo-places: find nearby POI (restaurants, pharmacies, ATMs, parking...)
• geo-directions: optimal route with turn-by-turn (drive/walk/bike/transit)
• geo-distance-matrix: travel time/distance between multiple points
• geo-reachable-area: isochrone — what's reachable in N minutes
• geo-enrich: comprehensive location intelligence (cross-UC data)

USAGE GUIDELINES:

1. LOCATION RESOLUTION
   "Where is Times Square?" → geo-geocode(query="Times Square")
   "What's at 40.7589, -73.9851?" → geo-reverse(lat=40.7589, lng=-73.9851)
   Always resolve location first before other queries.

2. NEARBY DISCOVERY
   "Find restaurants near me" → geo-places(location=..., category="restaurant")
   "Nearest pharmacy" → geo-places(location=..., category="pharmacy", limit=3)
   "EV charging stations nearby" → geo-places(category="ev_charging")

3. NAVIGATION
   "How do I get to the airport?" → geo-directions(origin=..., destination=..., mode="drive")
   "Walking directions to Central Park" → geo-directions(mode="walk")
   Compare modes: call geo-directions multiple times with different modes.

4. DISTANCE COMPARISON
   "Which hotel is closest to the venue?" → geo-distance-matrix
   "Compare travel times to 3 restaurants" → geo-distance-matrix

5. AREA ANALYSIS
   "What can I reach in 15 min?" → geo-reachable-area(time_minutes=15)
   "Show me what's within walking distance" → geo-reachable-area(mode="walk", time_minutes=20)

6. CROSS-UC ENRICHMENT
   When user mentions a location in any context → use geo-enrich to provide context
   "Weather in Berlin" → geo-geocode → pass coords to weather API
   "Events near me" → geo-enrich → cross-reference with events API
   "Restaurants for delivery" → geo-places → cross-reference with food delivery

IMPORTANT:
• Data is based on OpenStreetMap (community-maintained, global)
• Accuracy is excellent for cities and well-mapped areas
• For very specific rural addresses, confidence may be lower — check confidence score
• POI data updated monthly — recently opened businesses may not appear yet
• Routing does NOT include real-time traffic (use estimated times)
• Always include attribution: "Map data © OpenStreetMap contributors"
```

---

## 6. Publication Strategy

### MCP Server Configuration

```json
{
  "name": "apibase-geo",
  "version": "1.0.0",
  "description": "Location intelligence: geocoding, places/POI, routing, isochrones, distance matrix. Global coverage, 400+ POI categories. Powered by OSM + Valhalla.",
  "tools": [
    "geo-geocode",
    "geo-reverse",
    "geo-places",
    "geo-directions",
    "geo-distance-matrix",
    "geo-reachable-area",
    "geo-enrich"
  ],
  "auth": {
    "type": "x402",
    "network": "base",
    "currency": "USDC"
  },
  "pricing": {
    "geo-geocode": "$0.001",
    "geo-reverse": "$0.001",
    "geo-places": "$0.003",
    "geo-directions": "$0.005",
    "geo-distance-matrix": "$0.008",
    "geo-reachable-area": "$0.005",
    "geo-enrich": "$0.005"
  }
}
```

### Discovery Tags

```
Categories: maps, navigation, geolocation, geocoding, routing, places, POI
Keywords: address-lookup, coordinates, nearby, directions, distance, isochrone,
          reachable-area, turn-by-turn, restaurant-finder, pharmacy-nearby,
          airport-distance, EV-charging, parking, timezone, reverse-geocoding
```

---

## 7. Traffic Flow Diagram

```
Agent request flow (example: geo-directions with cross-UC enrichment):

Agent                APIbase                    Geoapify         Valhalla
  │                    │                           │               │
  │ ── x402 $0.005 ──→│                           │               │
  │  geo-directions    │                           │               │
  │  origin: "my hotel"│                           │               │
  │  dest: "MSG arena" │                           │               │
  │  mode: "drive"     │                           │               │
  │                    │                           │               │
  │                    │── geocode "my hotel" ─→   │               │
  │                    │   check cache: ✅ cached   │               │
  │                    │   → 40.7505, -73.9934     │               │
  │                    │                           │               │
  │                    │── geocode "MSG arena" ─→  │               │
  │                    │   check cache: ✅ cached   │               │
  │                    │   → 40.7505, -73.9934     │               │
  │                    │                           │               │
  │                    │── route ──────────────────────────────────→│
  │                    │   origin: 40.7505,-73.9934│               │
  │                    │   dest: 40.7505,-73.9934  │               │
  │                    │   costing: auto            │               │
  │                    │←─── route response ──────────────────────│
  │                    │   18 min, 4.2 km, 12 steps│               │
  │                    │                           │               │
  │                    │── POI: parking near MSG ──→│               │
  │                    │   check cache: ✅ cached   │               │
  │                    │   3 parking garages nearby │               │
  │                    │                           │               │
  │←── response ───────│                           │               │
  │  {                 │                           │               │
  │    route: {        │                           │               │
  │      distance: "4.2 km",                       │               │
  │      time: "18 min",                           │               │
  │      steps: [...],                             │               │
  │      alternatives: [walk: "42 min", subway: "25 min"]         │
  │    },                                          │               │
  │    context: {                                  │               │
  │      parking: [{name: "Icon Parking", walk: "2 min"}],        │
  │      event_tonight: "Knicks vs Lakers, 7:30 PM (UC-008)"     │
  │    }                                           │               │
  │  }                 │                           │               │

Revenue flow:
  x402 payment:     $0.005 per directions request
  Upstream cost:    $0.001 (Geoapify POI, if not cached) + $0 (Valhalla)
  Margin:           80-99% (growing with cache)

Cross-UC enrichment:
  Agent doing UC-008 (events) query → location enrichment is automatic
  Agent doing UC-003 (food) query → nearby restaurants via geo-places
  No additional x402 charge for cross-UC context (increases value)
```

---

## 8. Monetization Model

### Pattern P12: Location Intelligence Cache + Cross-UC Enrichment Engine

```
Уникальность паттерна:
  • Low upstream ($0-299/мес Geoapify + $500-1500 infra)
  • Hybrid architecture: hosted API + self-hosted engine
  • Permanent cache for geocoding (addresses don't change)
  • Growing knowledge base → margin increases monthly
  • CROSS-UC ENRICHMENT — location data повышает ценность ВСЕХ других UC
  • First UC designed as INFRASTRUCTURE layer, not standalone product

Отличия от существующих паттернов:
  vs P1 (Builder Key):  P12 = dual upstream (hosted + self-hosted), not single
  vs P5 (Cache Multiplier): P5 = temporary cache. P12 = permanent cache
                            + self-hosted routing ($0 per query)
  vs P10 (Permanent Cache): P10 = single source, standalone.
                            P12 = multi-source hybrid + cross-UC enrichment
  vs P11 (Gov Data Fusion): P11 = government data, health domain.
                            P12 = commercial + OSM, location domain.
                            P11 = standalone intelligence.
                            P12 = INFRASTRUCTURE enriching all UCs.

Key innovation: Location UC is not just a product — it's an ENABLER.
  Every other UC becomes more valuable with location context.
  "Weather in Moscow" → geo-geocode → coords → UC-005 OWM
  "Events near me" → geo-places → venue locations → UC-008 Ticketmaster
  "Deliver food" → geo-directions → delivery estimate → UC-003 Food
```

### Revenue Streams

| Stream | Price | Expected Volume | Monthly Revenue |
|--------|-------|----------------|-----------------|
| geo-geocode | $0.001/req | 100K-1M req | $100–1,000 |
| geo-reverse | $0.001/req | 20K-200K req | $20–200 |
| geo-places | $0.003/req | 50K-500K req | $150–1,500 |
| geo-directions | $0.005/req | 30K-300K req | $150–1,500 |
| geo-distance-matrix | $0.008/req | 10K-100K req | $80–800 |
| geo-reachable-area | $0.005/req | 10K-100K req | $50–500 |
| geo-enrich | $0.005/req | 20K-200K req | $100–1,000 |
| **TOTAL** | | | **$650–6,500** |

### Unit Economics

```
Per geocoding query:
  Revenue:          $0.001
  Upstream cost:    $0.003 (Geoapify credit) → $0 after cached
  Margin (first):   -200% (loss leader on first query)
  Margin (cached):  100% (permanent cache)
  Break-even:       3 queries per unique location

Per directions query:
  Revenue:          $0.005
  Upstream cost:    $0.001 (geocoding, if not cached) + $0 (Valhalla)
  Margin:           80-100%

Per geo-enrich query:
  Revenue:          $0.005
  Upstream cost:    $0.003-0.010 (geocode + POIs, partially cached)
  Margin:           50-100% (growing with cache)

Infrastructure:
  Geoapify plan:    $0-299/мес
  Valhalla server:  $500-1500/мес
  Cache (PostGIS):  $100-300/мес
  TOTAL infra:      $600-2,100/мес

Break-even (at $59/mo Geoapify + $700 infra):
  $759/мес ÷ $0.003 avg revenue/req ≈ 253,000 req/мес
  = ~8,400 req/day

At maturity (cache 90%+):
  1M queries/month: $3,000-5,000 revenue
  Upstream: ~$100 (only cache misses hit Geoapify)
  Infra: ~$800
  Margin: 82-94%
```

### Comparison with Alternatives

```
What an agent pays elsewhere:

Google Maps Platform:
  Geocoding: $5/1K after free tier
  Directions: $5-10/1K
  ToS: PROHIBITS proxy/resale
  Cache: 30-day max

Mapbox:
  Geocoding: $5/1K after 100K free
  Directions: $5/1K after 100K free
  ToS: PROHIBITS proxy ("by proxying")
  Cache: prohibited

HERE:
  250K free/mo, then $1/1K
  ToS: BANS AI/LLM use entirely
  Cache: 30-day max

APIbase Geo (UC-012):
  Geocoding: $0.001 per query ($1/1K)
  Directions: $0.005 per query ($5/1K)
  No ToS restrictions on AI agents
  Cache: PERMANENT (addresses don't change)
  Bonus: cross-UC enrichment included
  80-90% Google quality at 20% price
```

---

## 9. Lessons Learned

### Lesson 1: Maps = The Most ToS-Hostile Category

```
Открытие:
  Maps/Navigation — САМАЯ враждебная категория по ToS из всех 12 UC.

  Google Maps: "will not sell, resell, sublicense, transfer, or distribute"
  Mapbox: "not for resale... shall not redistribute by PROXYING"
  HERE: ПОЛНЫЙ BAN на AI/LLM use (самый жёсткий anti-AI clause)
  TomTom: AI ban + "caching for scaling to serve multiple clients" запрещён
  OpenRouteService: "may not redistribute by proxying"

  5 из 5 коммерческих провайдеров ЗАПРЕЩАЮТ proxy/resale.
  Это даже жёстче, чем E-commerce (UC-009) или Entertainment (UC-010).

Причина:
  Geo data = extremely high-value, capital-intensive to collect.
  $1-10B invested in mapping → companies fiercely protect.
  AI boom → providers tighten ToS preemptively.

Вывод: OSM-based решения — ЕДИНСТВЕННЫЙ viable upstream для geo proxy.
```

### Lesson 2: Location = Universal Infrastructure Layer

```
Открытие:
  Maps/Navigation — НЕ standalone product. Это INFRASTRUCTURE.

  Каждый существующий UC выигрывает от location context:
  UC-002: "How far is the airport?" (геоконтекст для travel)
  UC-003: "What restaurants deliver here?" (delivery radius)
  UC-005: "Weather at this address" (geocode → coords → OWM)
  UC-008: "How to get to the venue?" (routing + parking POI)
  UC-011: "Nearest pharmacy" (POI search)

  Аналогия: UC-007 (Translation) — тоже universal enrichment layer.
  Translation enriches content. Location enriches context.

  Два "горизонтальных" UC в портфеле:
  UC-007: Content Transform layer (Translation)
  UC-012: Location Context layer (Maps)

  Все остальные UC — "вертикальные" (один домен).
```

### Lesson 3: Hybrid Architecture = Best of Both Worlds

```
Открытие:
  Первый UC с HYBRID upstream архитектурой:
  • Hosted API (Geoapify) — для geocoding, POI, batch
  • Self-hosted engine (Valhalla) — для routing, isochrones
  • Permanent cache (PostGIS) — для повторных запросов

  Преимущество:
  • Geocoding: Geoapify + cache → $0.001 effective cost
  • Routing: Valhalla → $0 per query (only infra cost)
  • Комбинация: 80-90% Google quality at 5-10% cost

  Первый UC, где часть upstream = self-hosted.
  Новая категория затрат: infrastructure ($500-1500/мес)
  vs subscription/per-call.

  Это может стать паттерном для других UC:
  • Self-hosted LLM для enrichment? (future)
  • Self-hosted image processing? (future)
```

### Lesson 4: OSM Foundation Geocoding Ruling = Legal Key

```
Открытие:
  Главный юридический вопрос: ODbL share-alike.
  OSM data = ODbL license → adapted databases must be shared.

  НО: OSM Foundation OFFICIALLY ruled:
  "Geocoding results do NOT trigger share-alike."

  Это значит:
  • APIbase может кэшировать geocoding results НАВСЕГДА
  • Может redistibute без open-sourcing кэша
  • Только attribution required: "© OpenStreetMap contributors"

  Без этого ruling — весь UC-012 был бы юридически рискованным.
  Geoapify строит на этом же ruling.

  Вывод: всегда проверять не только ToS провайдера,
         но и underlying data license + official rulings.
```

### Lesson 5: Geocoding Cache = Fastest to 100% Hit Rate

```
Открытие:
  Сравнение cache trajectories по UC:

  UC-005 (Weather): TTL 2 min → never reaches 100% (always refreshing)
  UC-006 (News): Prefetch 70% → on-demand 30% → ~70% hit rate
  UC-010 (TMDB): Permanent, grows organically → 95% at year 1
  UC-011 (Health): Bulk seed 90% day 1 → 99% at year 1

  UC-012 (Maps):
  • Geocoding: permanent (addresses stable) → like TMDB
  • BUT: Zipf's law applies heavily to location queries
  • Top 100 cities = 80% of all queries → seed immediately
  • Top 1000 locations = 95% of queries
  • Day 1 seed: geocode top-1000 cities via batch (0.5 credits each = 500 credits)
  • Effective day 1 hit rate for geocoding: ~80%
  • Month 3: ~90% | Month 6: ~95% | Year 1: ~98%

  Fastest-growing cache after UC-011 (bulk seed).
  But unlike UC-011, even without bulk download, Zipf's law
  guarantees rapid convergence (popular locations = few unique entries).
```

### Competitive Landscape Note

```
HERE's AI Ban = Market Signal:
  HERE Section 6.4(f) explicitly bans ALL AI use cases.
  This is the first provider to write "generative AI" in their prohibited list.

  → Maps providers see AI agents as THREAT to their business model.
  → They expect AI agents to consume maps data at scale without paying.
  → Their response: ban AI entirely (HERE) or ban proxy (Google, Mapbox, TomTom).

  APIbase opportunity: ONLY OSM-based solutions work.
  But most AI developers don't know this.
  APIbase becomes the "legal bridge" between AI agents and geo data.

MCP Ecosystem:
  Google Maps: 5+ MCP servers (but ToS prohibits proxy use)
  Mapbox: 3+ MCP servers + official MCP DevKit (but ToS prohibits)
  TomTom: Official MCP server (but ToS prohibits at scale)
  Geoapify: 2 MCP servers (ToS allows data redistribution)
  OSM/Nominatim: 3+ MCP servers (ODbL allows with attribution)

  Paradox: most popular MCP servers are for providers
  whose ToS PROHIBITS the proxy use case.
  Developers building with Google Maps MCP may face legal issues.
  APIbase = safe, legal alternative.
```
