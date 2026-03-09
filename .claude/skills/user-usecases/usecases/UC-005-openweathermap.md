# UC-005: OpenWeatherMap

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-005 |
| **Provider** | OpenWeatherMap (openweathermap.org) |
| **Category** | Weather / Environment |
| **Date Added** | 2026-03-07 |
| **Status** | Reference |
| **Client** | APIbase (platform-level integration) |

---

## 1. Client Input Data

Интеграция на уровне платформы — APIbase подключает OpenWeatherMap как upstream-провайдер:

```
Тип данных:          Значение:
──────────────────────────────────────────────────────────
OWM API Key (free)   Бесплатный ключ (1,000 вызовов/день)
OWM One Call 3.0     Pay-per-call ключ (~$0.0015/вызов)
OWM Startup Plan     Опционально: $35–40/мес (10M вызовов)
```

### Sufficiency Assessment

| Data provided | What it enables | Sufficient? |
|---------------|----------------|-------------|
| Free API Key | 1,000 calls/day, 60/min. Current weather, 5-day forecast, air quality, geocoding. | **Yes** — для MVP (30K req/month) |
| One Call 3.0 Key | Pay-per-call ~$0.0015/req. Current + minutely + hourly (48h) + daily (8d) + alerts в одном вызове. | **Yes** — для production, масштабируемо |
| Startup Plan ($35/mo) | 10M calls/month, 600 req/min. Все сервисы. | **Yes** — для высокой нагрузки, снижение per-call cost |

**Verdict:** OpenWeatherMap предлагает **уникальную pay-per-call модель** (One Call 3.0) — в отличие от большинства погодных API, где нужна подписка. Это позволяет APIbase стартовать с $0 фиксированных расходов и масштабироваться линейно.

---

## 2. Provider API Analysis

### API Architecture

OpenWeatherMap — крупнейший погодный API в мире: 8M+ разработчиков, 2B прогнозов/день.

| Service | Base URL | Auth | Description |
|---------|----------|------|-------------|
| **Current Weather** | `https://api.openweathermap.org/data/2.5/weather` | API Key | Текущая погода по городу/координатам |
| **5-day Forecast** | `https://api.openweathermap.org/data/2.5/forecast` | API Key | 5-дневный прогноз с шагом 3 часа |
| **One Call 3.0** | `https://api.openweathermap.org/data/3.0/onecall` | API Key | Всё в одном: current + minutely + hourly + daily + alerts |
| **Air Pollution** | `https://api.openweathermap.org/data/2.5/air_pollution` | API Key | AQI + PM2.5, PM10, NO2, O3, SO2, CO |
| **Geocoding** | `https://api.openweathermap.org/geo/1.0` | API Key | Прямое и обратное геокодирование |
| **Weather Maps** | `https://tile.openweathermap.org/map` | API Key | 15 типов погодных тайлов (карты) |
| **Historical** | `https://api.openweathermap.org/data/3.0/onecall/timemachine` | API Key | Исторические данные (47+ лет) |
| **Daily Aggregation** | `https://api.openweathermap.org/data/3.0/onecall/day_summary` | API Key | Сводка по дню: min/max/mean |
| **Road Risk** | `https://api.openweathermap.org/data/2.5/roadrisk` | API Key | Дорожные условия для логистики |
| **Solar Irradiance** | `https://api.openweathermap.org/energy/1.0/solar` | API Key | Солнечная энергия и прогноз |

### Key Endpoints

#### Current Weather (Free Tier)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/data/2.5/weather?q={city}` | GET | Погода по названию города |
| `/data/2.5/weather?lat={lat}&lon={lon}` | GET | Погода по координатам |
| `/data/2.5/weather?id={city_id}` | GET | Погода по ID города |
| `/data/2.5/group?id={id1},{id2},...` | GET | Погода для нескольких городов (до 20) |

#### 5-Day Forecast (Free Tier)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/data/2.5/forecast?q={city}` | GET | 5-дневный прогноз, шаг 3 часа (40 точек) |
| `/data/2.5/forecast?lat={lat}&lon={lon}` | GET | По координатам |

#### One Call API 3.0 (Pay-per-call, ~$0.0015/req)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/data/3.0/onecall?lat={lat}&lon={lon}` | GET | Текущая + minutely (1h) + hourly (48h) + daily (8d) + alerts |
| `/data/3.0/onecall/timemachine?lat={lat}&lon={lon}&dt={unix}` | GET | Историческая погода для конкретной даты |
| `/data/3.0/onecall/day_summary?lat={lat}&lon={lon}&date={YYYY-MM-DD}` | GET | Агрегированная сводка по дню |
| `/data/3.0/onecall/overview?lat={lat}&lon={lon}` | GET | AI-генерированный текстовый обзор погоды |

#### Air Pollution (Free Tier)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/data/2.5/air_pollution?lat={lat}&lon={lon}` | GET | Текущий AQI + компоненты (PM2.5, PM10, NO2, O3, SO2, CO) |
| `/data/2.5/air_pollution/forecast?lat={lat}&lon={lon}` | GET | Прогноз качества воздуха |
| `/data/2.5/air_pollution/history?lat={lat}&lon={lon}&start={unix}&end={unix}` | GET | Историческое качество воздуха |

#### Geocoding (Free Tier)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/geo/1.0/direct?q={city}` | GET | Город → координаты (до 5 результатов) |
| `/geo/1.0/reverse?lat={lat}&lon={lon}` | GET | Координаты → город/адрес |
| `/geo/1.0/zip?zip={zip},{country}` | GET | ZIP-код → координаты |

### Authentication Model

**Простая модель:**

```
Все эндпоинты: API Key в query string
  ?appid=YOUR_API_KEY

Получение ключа: мгновенная регистрация на openweathermap.org
Активация: ключ активен через 2 часа после создания

One Call 3.0: тот же ключ, но отдельная подписка
  (бесплатно 1,000 вызовов/день, далее pay-per-call)
```

### Rate Limits

| Plan | req/min | req/day | req/month | Cost |
|------|---------|---------|-----------|------|
| Free | 60 | 1,000 | ~30,000 | $0 |
| One Call 3.0 (pay) | 60 | Unlimited | Unlimited | ~$0.0015/req |
| Startup | 600 | Unlimited | 10,000,000 | ~$35–40/mo |
| Developer | 3,000 | Unlimited | 100,000,000 | ~$160/mo |
| Professional | 30,000 | Unlimited | 1,000,000,000 | ~$470/mo |

### Official SDKs & Integrations

- Python: `pyowm` (community, popular)
- Node.js: `openweathermap-api` (community)
- Official: REST API only (no official SDK)
- MCP: Несколько community MCP серверов (`jezweb/weather-mcp-server`, `robertn702/mcp-openweathermap`)
- Docs: `openweathermap.org/api`

---

## 3. APIbase Wrapper Design

### Level 1: Protocol Adapter

```
What the adapter does:
──────────────────────────────────────────────────────────────
• Unifies 10 OWM сервисов → единый APIbase endpoint
  apibase.pro/api/v1/weather/...

• Smart upstream routing:
  /weather/now         → One Call 3.0 (current only) ИЛИ /data/2.5/weather
  /weather/forecast    → One Call 3.0 (hourly + daily) ИЛИ /data/2.5/forecast
  /weather/history     → One Call 3.0 timemachine
  /weather/air-quality → /data/2.5/air_pollution
  /weather/geocode     → /geo/1.0/direct or /reverse
  /weather/alerts      → One Call 3.0 (alerts component)

• Intelligent endpoint selection:
  - Если агенту нужно ТОЛЬКО current weather → /data/2.5/weather (free tier, $0)
  - Если нужно current + forecast + alerts → One Call 3.0 (1 запрос = всё)
  - Экономия: One Call 3.0 заменяет 3-4 отдельных запроса

• Geocoding layer:
  - Агент отправляет "Moscow" или "New York"
  - APIbase автоматически геокодирует через /geo/1.0/direct
  - Кэш геокодирования: 30 дней TTL (координаты городов не меняются)
  - Передаёт lat/lon в погодный endpoint

• Caching strategy:
  - Current weather: 2 min TTL
  - Hourly forecast: 30 min TTL
  - Daily forecast: 1 hour TTL
  - Alerts: 5 min TTL (критично!)
  - Air quality: 10 min TTL
  - Geocoding: 30 days TTL
  - Historical data: ∞ (immutable)

• Error normalization:
  OWM errors → APIbase standard format
  {"error": "weather_city_not_found", "message": "City 'Xyz' not found"}
  {"error": "weather_rate_limited", "retry_after": 60}
```

### Level 2: Semantic Normalizer

**Domain model: `weather`**

```json
// === OpenWeatherMap original (One Call 3.0) ===
{
  "lat": 55.7558,
  "lon": 37.6173,
  "timezone": "Europe/Moscow",
  "timezone_offset": 10800,
  "current": {
    "dt": 1741348200,
    "sunrise": 1741322400,
    "sunset": 1741359600,
    "temp": -5.2,
    "feels_like": -11.8,
    "pressure": 1025,
    "humidity": 72,
    "dew_point": -9.1,
    "uvi": 0.5,
    "clouds": 40,
    "visibility": 10000,
    "wind_speed": 5.4,
    "wind_deg": 210,
    "wind_gust": 9.1,
    "weather": [{"id": 802, "main": "Clouds", "description": "scattered clouds", "icon": "03d"}]
  },
  "minutely": [...],
  "hourly": [...],
  "daily": [...],
  "alerts": [...]
}

// === APIbase normalized (weather schema) ===
{
  "provider": "openweathermap",
  "location": {
    "lat": 55.7558,
    "lon": 37.6173,
    "city": "Moscow",
    "country": "RU",
    "timezone": "Europe/Moscow",
    "utc_offset": "+03:00"
  },
  "current": {
    "timestamp": "2026-03-07T14:30:00+03:00",
    "temperature_c": -5.2,
    "feels_like_c": -11.8,
    "condition": "Scattered Clouds",
    "condition_code": "partly_cloudy",
    "icon": "partly_cloudy_day",
    "humidity_pct": 72,
    "pressure_hpa": 1025,
    "wind": {
      "speed_ms": 5.4,
      "speed_kmh": 19.4,
      "direction_deg": 210,
      "direction": "SSW",
      "gust_ms": 9.1
    },
    "visibility_km": 10.0,
    "uv_index": 0.5,
    "cloud_cover_pct": 40,
    "sunrise": "2026-03-07T07:00:00+03:00",
    "sunset": "2026-03-07T17:20:00+03:00"
  },
  "forecast_hourly": [
    {
      "timestamp": "2026-03-07T15:00:00+03:00",
      "temperature_c": -4.8,
      "condition": "Clouds",
      "precipitation_mm": 0,
      "wind_speed_ms": 5.1
    }
  ],
  "forecast_daily": [
    {
      "date": "2026-03-08",
      "temp_min_c": -8.2,
      "temp_max_c": -2.1,
      "condition": "Light Snow",
      "precipitation_mm": 2.5,
      "humidity_pct": 80
    }
  ],
  "alerts": [],
  "air_quality": null,
  "last_updated": "2026-03-07T14:30:00+03:00"
}
```

### Level 3: Cost Optimizer

```
Уникальная модель: APIbase оптимизирует upstream costs
──────────────────────────────────────────────────────────────

OpenWeatherMap — первый UC с натуральной pay-per-call upstream моделью.
APIbase оптимизирует через интеллектуальный маршрутизатор:

Стратегия 1: Free Tier First
  - Геокодирование → всегда free tier (0 стоимость)
  - Current weather only → /data/2.5/weather (free, 1000/day)
  - Air quality → /data/2.5/air_pollution (free)
  - Используем 1,000 free calls/day как первый слой

Стратегия 2: One Call Batching
  - Если агенту нужно current + forecast → 1 вызов One Call 3.0
  - Один вызов $0.0015 заменяет 3–4 отдельных free-tier вызова
  - Но free tier не тратится!

Стратегия 3: Cache Multiplication
  - Current weather Moscow → кэш 2 мин
  - 100 агентов спрашивают "погода в Москве" за 2 мин
  - 1 upstream вызов → 100 downstream ответов
  - Cost per served request: $0.0015 / 100 = $0.000015
  - Agent pays: $0.002 → margin 99.25%!

Реальная unit economics:
  Без кэша:    $0.003 downstream − $0.0015 upstream = $0.0015 (50%)
  С кэшем x10: $0.003 − $0.00015 = $0.00285 (95%)
  С кэшем x50: $0.003 − $0.00003 = $0.00297 (99%)
```

---

## 4. MCP Tool Definitions

### Tool: weather-now

```json
{
  "name": "weather-now",
  "description": "Get current weather conditions for any location worldwide. Returns temperature, humidity, wind, visibility, UV index, cloud cover, and conditions description. Accepts city names, coordinates, or ZIP codes.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "location": {
        "type": "string",
        "description": "City name ('Moscow'), city+country ('Paris, FR'), coordinates ('55.75,37.62'), or ZIP code ('10001, US')"
      },
      "units": {
        "type": "string",
        "enum": ["metric", "imperial"],
        "default": "metric",
        "description": "Temperature units: metric (°C, m/s) or imperial (°F, mph)"
      }
    },
    "required": ["location"]
  }
}
```

### Tool: weather-forecast

```json
{
  "name": "weather-forecast",
  "description": "Get weather forecast: hourly (48 hours) and daily (8 days). Includes temperature, conditions, precipitation, wind, humidity. One call returns everything needed for planning.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "location": {
        "type": "string",
        "description": "City name, coordinates, or ZIP code"
      },
      "type": {
        "type": "string",
        "enum": ["hourly", "daily", "both"],
        "default": "both",
        "description": "Forecast type: hourly (48h), daily (8d), or both"
      },
      "units": {
        "type": "string",
        "enum": ["metric", "imperial"],
        "default": "metric"
      }
    },
    "required": ["location"]
  }
}
```

### Tool: weather-alerts

```json
{
  "name": "weather-alerts",
  "description": "Get active weather alerts and warnings for a location. Returns severe weather alerts from national weather services: storms, floods, extreme temperatures, etc.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "location": {
        "type": "string",
        "description": "City name or coordinates"
      }
    },
    "required": ["location"]
  }
}
```

### Tool: weather-history

```json
{
  "name": "weather-history",
  "description": "Get historical weather data for a specific date and location. Covers 47+ years of weather history. Useful for analysis, comparisons, and research.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "location": {
        "type": "string",
        "description": "City name or coordinates"
      },
      "date": {
        "type": "string",
        "description": "Date in YYYY-MM-DD format, e.g. '2025-12-25'"
      },
      "units": {
        "type": "string",
        "enum": ["metric", "imperial"],
        "default": "metric"
      }
    },
    "required": ["location", "date"]
  }
}
```

### Tool: air-quality

```json
{
  "name": "air-quality",
  "description": "Get air quality index (AQI) and pollutant concentrations for a location. Returns AQI level (1-5), PM2.5, PM10, NO2, O3, SO2, CO values. Includes forecast.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "location": {
        "type": "string",
        "description": "City name or coordinates"
      },
      "include_forecast": {
        "type": "boolean",
        "default": false,
        "description": "Include air quality forecast (next 5 days)"
      }
    },
    "required": ["location"]
  }
}
```

### Tool: weather-geocode

```json
{
  "name": "weather-geocode",
  "description": "Convert location names to coordinates and vice versa. Forward geocoding (city → lat/lon) and reverse geocoding (lat/lon → city name). Essential utility for other weather tools.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "City name for forward geocoding ('London') or coordinates for reverse ('51.51,-0.13')"
      },
      "type": {
        "type": "string",
        "enum": ["forward", "reverse"],
        "default": "forward",
        "description": "Geocoding direction"
      },
      "limit": {
        "type": "integer",
        "default": 1,
        "maximum": 5,
        "description": "Number of results (forward only)"
      }
    },
    "required": ["query"]
  }
}
```

### Tool: weather-compare

```json
{
  "name": "weather-compare",
  "description": "Compare current weather between 2-5 locations. Returns side-by-side comparison of temperature, conditions, humidity, and wind. Perfect for travel planning or relocation decisions.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "locations": {
        "type": "array",
        "items": {"type": "string"},
        "description": "List of locations to compare, e.g. ['Moscow', 'Dubai', 'Tokyo']",
        "minItems": 2,
        "maxItems": 5
      },
      "units": {
        "type": "string",
        "enum": ["metric", "imperial"],
        "default": "metric"
      }
    },
    "required": ["locations"]
  }
}
```

---

## 5. AI Instructions

```markdown
# OpenWeatherMap via APIbase — AI Agent Instructions

## When to Use
- User asks about weather ("What's the weather in Moscow?")
- User plans a trip and needs weather info (cross-sell with UC-002 Aviasales)
- User asks about air quality ("Is the air clean in Beijing?")
- User needs historical weather ("Weather in NYC on Christmas 2024")
- User compares locations ("Where is warmer — Dubai or Bangkok?")
- User asks about severe weather ("Any storm warnings in Florida?")
- User needs weather for decision-making ("Should I bring an umbrella?")

## Key Concepts
- Temperature: always show °C (metric) by default, add °F if user is in US
- Wind: m/s (metric) or mph (imperial)
- AQI scale: 1=Good, 2=Fair, 3=Moderate, 4=Poor, 5=Very Poor
- UV Index: 0-2 Low, 3-5 Moderate, 6-7 High, 8-10 Very High, 11+ Extreme
- Hourly forecast: 48 hours ahead, good for "will it rain today?"
- Daily forecast: 8 days ahead, good for "weather next week"

## Recommended Call Chains

### "What's the weather in X?"
1. `weather-now` (location="X") → current conditions
2. Done — single tool call is sufficient

### "Will it rain tomorrow in X?"
1. `weather-forecast` (location="X", type="hourly") → check hourly precipitation
2. Analyze precipitation probability in the 24-48h window

### "Weather for my trip to X next week"
1. `weather-forecast` (location="X", type="daily") → 8-day forecast
2. Optionally: `weather-alerts` (location="X") → check severe weather
3. Summarize day-by-day with packing recommendations

### "Compare weather: X vs Y vs Z"
1. `weather-compare` (locations=["X", "Y", "Z"]) → side-by-side
2. Highlight key differences

### "Is the air safe to run outside?"
1. `air-quality` (location="user_location") → AQI + pollutants
2. Advise based on AQI: 1-2 safe for sports, 3 moderate caution, 4-5 avoid outdoor exercise

### "What was the weather in X on [date]?"
1. `weather-history` (location="X", date="2025-12-25") → historical data
2. Present the historical conditions

### Travel planning (cross-UC with Aviasales)
1. `weather-forecast` (location="destination") → weather at destination
2. If agent has access: `flight-search` (from UC-002) → find flights
3. Combined response: "Great weather in Barcelona next week! Here are flights..."

## Response Formatting
- Lead with the most relevant info: temperature + condition
- Use weather emojis ONLY if user prefers them: ☀️ 🌧️ 🌨️ ❄️ ⛈️
- Show "feels like" when it differs significantly (>3°C) from actual temp
- For wind: include direction ("SW 5.4 m/s") and mention gusts if >10 m/s
- For alerts: use WARNING prefix and urgency level
- Always mention data freshness: "Updated 2 minutes ago"
- For forecasts: use table format for multi-day view

## Cross-Selling with Other UC Tools
- Weather + Flights (UC-002): "Good weather in destination, here are flight options"
- Weather + Food Delivery (UC-003): "Rainy day — great time to order in!"
- Weather + Crypto (UC-004): "Weather data is also useful for agricultural commodity analysis"

## Limitations
- Forecast accuracy decreases beyond 3 days
- Minutely precipitation data available only for some regions
- Historical data goes back ~47 years (from ~1979)
- Air quality data coverage varies by region (best in US, EU, China)
- Weather alerts depend on national weather services (not all countries covered)
- Updates every 2 minutes (not real-time)

## Pricing via APIbase
- Current weather: $0.002/req via x402
- Forecast (hourly + daily): $0.003/req via x402
- Weather alerts: $0.001/req via x402
- Historical data: $0.005/req via x402
- Air quality: $0.002/req via x402
- Geocoding: $0.001/req via x402
- Compare (2-5 locations): $0.005/req via x402
- Free tier: 200 req/month (current weather only)
```

---

## 6. Publication

### APIbase.pro Catalog Entry

```
URL: apibase.pro/catalog/weather/openweathermap/
──────────────────────────────────────────────────────────────
Provider:       OpenWeatherMap
Website:        openweathermap.org
Category:       Weather / Environment
Subcategories:  Forecast, Air Quality, Historical, Alerts, Geocoding

Status:         Active ✅
MCP Tools:      7 tools (weather-now, forecast, alerts, history,
                air-quality, geocode, compare)
Formats:        MCP Tool Definition, OpenAPI 3.1, A2A Agent Card

Pricing:
  Current weather:     $0.002/req via x402
  Forecast:            $0.003/req via x402
  Historical:          $0.005/req via x402
  Air quality:         $0.002/req via x402

Authentication:  OAuth 2.1 via APIbase (agent registration required)
Data freshness:  Current: 2 min | Forecast: 30 min | Alerts: 5 min
Rate limits:     Per-agent, based on KYA level
Auto-sync:       Current: 2 min | Forecast: 30 min | City list: monthly
Coverage:        Global (200,000+ cities, any lat/lon coordinates)
```

### GitHub Public Entry

```
github.com/apibase-pro/apibase/apis/weather/openweathermap/
│
├── README.md
│   # OpenWeatherMap — Weather & Environment API
│   OpenWeatherMap provides global weather data: current conditions,
│   forecasts, air quality, alerts, and 47+ years of historical data.
│   Through APIbase, AI agents get instant access to weather intelligence.
│
│   ## Available Tools
│   - weather-now: Current conditions for any location
│   - weather-forecast: Hourly (48h) and daily (8d) forecast
│   - weather-alerts: Severe weather warnings
│   - weather-history: Historical data (47+ years)
│   - air-quality: AQI and pollutant concentrations
│   - weather-geocode: City name ↔ coordinates
│   - weather-compare: Side-by-side comparison of 2-5 locations
│
│   ## Quick Start
│   POST apibase.pro/api/v1/discover {"query": "weather forecast"}
│
│   ## Coverage
│   Global — 200,000+ cities, any latitude/longitude
│
├── capabilities.json
│   {
│     "provider": "openweathermap",
│     "category": "weather",
│     "subcategory": "forecast-and-environment",
│     "tools_count": 7,
│     "read_auth_required": false,
│     "trade_auth_required": false,
│     "x402_enabled": true,
│     "x402_upstream": false,
│     "real_time": false,
│     "data_delay": "2 minutes",
│     "coverage": {
│       "cities": 200000,
│       "global": true,
│       "historical_years": 47
│     }
│   }
│
└── examples.md
    # Examples
    ## Current weather in Moscow
    POST /api/v1/weather/now {"location": "Moscow", "units": "metric"}

    ## 8-day forecast for New York
    POST /api/v1/weather/forecast {"location": "New York", "type": "daily"}

    ## Air quality in Beijing
    POST /api/v1/weather/air-quality {"location": "Beijing"}

    ## Compare cities
    POST /api/v1/weather/compare {"locations": ["Dubai", "Bangkok", "Bali"]}

    ## Historical weather
    POST /api/v1/weather/history {"location": "London", "date": "2025-12-25"}
```

**Not published on GitHub:** API keys, upstream routing logic, caching algorithms, cost optimization strategy, rate limit distribution.

---

## 7. Traffic Flow Diagram

### Standard Request (current weather)

```
AI Agent                    APIbase.pro                  OpenWeatherMap
    │                           │                               │
    │── weather-now ───────────→│                               │
    │   location="Tokyo"        │                               │
    │   units="metric"          │                               │
    │   Authorization: Bearer...│                               │
    │                           │── Verify agent (OAuth 2.1) ──→│ (internal)
    │                           │── Check rate limit ──────────→│ (internal)
    │                           │                               │
    │                           │── Geocode "Tokyo" ──────────→│ (internal)
    │                           │   Cache hit! lat=35.68,       │
    │                           │   lon=139.69 (30-day cache)   │
    │                           │                               │
    │                           │── Check weather cache ───────→│ (internal)
    │                           │   Cache miss (>2 min old)     │
    │                           │                               │
    │                           │── GET /data/2.5/weather ─────→│
    │                           │   ?lat=35.68&lon=139.69       │ api.openweathermap.org
    │                           │   &appid=FREE_KEY             │ (free tier!)
    │                           │←── 200 OK [OWM JSON] ────────│
    │                           │                               │
    │                           │   [normalize → weather schema]│
    │                           │   [cache result, TTL=2min]    │
    │                           │   [charge x402: $0.002]       │
    │                           │   [upstream cost: $0.00!]     │
    │                           │                               │
    │←── 200 OK ────────────────│                               │
    │   {                       │                               │
    │     location: {city:      │                               │
    │       "Tokyo", country:   │                               │
    │       "JP"},              │                               │
    │     current: {            │                               │
    │       temperature_c: 12.4,│                               │
    │       condition: "Clear", │                               │
    │       humidity_pct: 55    │                               │
    │     }                     │                               │
    │   }                       │                               │
```

### One Call Request (forecast — pay-per-call)

```
AI Agent                    APIbase.pro                  OpenWeatherMap
    │                           │                               │
    │── weather-forecast ──────→│                               │
    │   location="Paris"        │                               │
    │   type="both"             │                               │
    │                           │── Verify + geocode (cached) ─→│ (internal)
    │                           │── Check forecast cache ──────→│ (internal)
    │                           │   Cache miss (>30 min old)    │
    │                           │                               │
    │                           │── GET /data/3.0/onecall ─────→│
    │                           │   ?lat=48.86&lon=2.35         │ api.openweathermap.org
    │                           │   &appid=ONECALL_KEY          │ (pay-per-call!)
    │                           │←── 200 OK [full weather] ────│
    │                           │                               │
    │                           │   [extract: current+hourly    │
    │                           │    +daily+minutely+alerts]    │
    │                           │   [normalize all components]  │
    │                           │   [cache: current 2min,       │
    │                           │    forecast 30min, alerts 5min│
    │                           │   [charge x402: $0.003]       │
    │                           │   [upstream cost: $0.0015]    │
    │                           │                               │
    │←── 200 OK ────────────────│                               │
    │   {                       │                               │
    │     current: {...},       │                               │
    │     forecast_hourly: [...],│                              │
    │     forecast_daily: [...],│                               │
    │     alerts: []            │                               │
    │   }                       │                               │
```

### Cache Hit (100% margin)

```
AI Agent #2                 APIbase.pro                  OpenWeatherMap
    │                           │                               │
    │── weather-now ───────────→│                               │
    │   location="Tokyo"        │                               │
    │                           │── Verify agent ──────────────→│ (internal)
    │                           │── Check weather cache ───────→│ (internal)
    │                           │   ✅ CACHE HIT! (<2 min old) │
    │                           │                               │
    │                           │   [return cached response]    │
    │                           │   [charge x402: $0.002]       │
    │                           │   [upstream cost: $0.00!]     │
    │                           │   [100% margin!]              │
    │                           │                               │
    │←── 200 OK ────────────────│                               │
    │   {same Tokyo weather}    │     (no upstream call!)       │
```

---

## 8. Monetization Model

| Revenue Stream | Mechanism | Expected per Month |
|---------------|-----------|-------------------|
| **Current weather (cached)** | $0.002/req. High cache hit for popular cities. Upstream often $0 (free tier or cache). | $100–1,000 |
| **Forecast** | $0.003/req. Upstream ~$0.0015 (One Call 3.0). Cache 30 min. | $150–1,500 |
| **Historical data** | $0.005/req. Premium price, cacheable ∞ (immutable data). | $50–500 |
| **Air quality** | $0.002/req. Free upstream. | $30–300 |
| **Alerts** | $0.001/req. Extracted from One Call (no separate upstream cost). | $10–100 |
| **Geocoding** | $0.001/req. Free upstream, 30-day cache. | $10–100 |
| **Compare** | $0.005/req. Multiple upstream calls batched. | $20–200 |

### Cost Structure

| Cost Item | Monthly | Notes |
|-----------|---------|-------|
| OWM Free Tier | $0 | 1,000 calls/day = 30K free |
| OWM One Call 3.0 pay-per-call | $15–150 | ~$0.0015/req, only for forecasts |
| OWM Startup Plan (optional) | $35–40 | When traffic exceeds 10K calls/day |
| **Total upstream cost** | **$15–190** | |
| **Expected revenue** | **$370–3,700** | |
| **Net margin** | **$355–3,510** | **73–95% margin** |

### Key Economics: Cache Multiplier Effect

```
Погода — уникальная категория для кэширования:
──────────────────────────────────────────────────────────────

"Погода в Москве" — один из самых частых запросов.
100 агентов спрашивают в течение 2 минут → 1 upstream вызов.

Популярные города (top 100):
  Москва, Нью-Йорк, Лондон, Токио, Париж, Дубай...
  → предварительный fetch каждые 2 мин
  → 100 городов × 30 раз/час × 24ч = 72K upstream вызовов/день
  → Обслуживают миллионы downstream запросов
  → Per-served-request cost: ~$0.00001

Непопулярные города:
  → on-demand fetch, кэш 2 мин
  → Первый запрос: $0.0015 upstream
  → Следующие 2 мин: $0.00 upstream

Average effective upstream cost: ~$0.0002/served request
Average downstream price: $0.002/request
→ Effective margin: ~90%
```

### Revenue Comparison Across All Use Cases

| UC | Provider | Revenue Model | Revenue/month | Upstream Cost | Margin |
|----|----------|--------------|--------------|---------------|--------|
| UC-001 | Polymarket | API fees + Builder rewards | $100–1K | $0 | ~100% |
| UC-002 | Aviasales | Affiliate 40% RevShare | $200–2K | $0 | ~100% |
| UC-003 | Food Delivery | CPA + mixed | $500–5K | ~$200 | 60–96% |
| UC-004 | CoinGecko | x402 per-call margin | $370–3.7K | $129–329 | 52–91% |
| **UC-005** | **OpenWeatherMap** | **Pay-per-call + cache** | **$370–3.7K** | **$15–190** | **73–95%** |

**Key insight:** UC-005 имеет **самую высокую маржу среди UC с ненулевым upstream** благодаря двум факторам: (1) pay-per-call upstream без фиксированных расходов, (2) высокий cache hit ratio для популярных локаций.

---

## 9. Lessons Learned

### What works well about this integration

1. **Pay-per-call upstream = zero fixed cost.** В отличие от CoinGecko ($129/мес подписка), OWM One Call 3.0 позволяет платить только за реальные запросы. APIbase стартует с $0 и масштабируется линейно.

2. **Cache multiplier = killer economics.** Погода — идеальная категория для кэширования: данные обновляются каждые 2 мин, но 100+ агентов могут спрашивать одно и то же. Cache hit ratio для top-100 городов может достигать 99%.

3. **Cross-UC synergy.** Weather data дополняет каждый другой UC:
   - UC-002 (Aviasales): "Погода в пункте назначения" → мотивирует покупку билетов
   - UC-003 (Food Delivery): "Дождь → закажи доставку" → повышает конверсию
   - UC-004 (CoinGecko): "Заморозки → влияние на commodity prices"

4. **Highest-frequency agent queries.** Weather — один из top-3 типов запросов AI агентов. Каждый "утренний briefing" агент начинает с погоды. Это обеспечивает стабильный daily трафик.

5. **Auto-geocoding = developer experience.** Агент отправляет "Moscow", APIbase автоматически геокодирует и кэширует координаты на 30 дней. Upstream OWM API требует координаты — APIbase скрывает эту сложность.

### Challenges identified

1. **Low per-request revenue.** При $0.002/req нужен большой объём для значимой выручки. 100K req/month = $200. Это utility pricing, не premium pricing.

2. **Competition from free alternatives.** Open-Meteo (бесплатный, open-source) и несколько MCP серверов уже обеспечивают базовый weather доступ. APIbase должен предоставить premium value: нормализация, кэширование, multi-provider, air quality, alerts.

3. **Forecast accuracy claims.** APIbase не может гарантировать точность прогноза — это ответственность OWM. Нужен disclaimer.

4. **Seasonal demand.** Погодные запросы имеют сезонность: больше перед праздниками, в сезон ураганов, при экстремальной погоде. Revenue не будет стабильным помесячно.

5. **Rate limit on free tier.** 60 req/min на free tier может стать bottleneck при росте. Переход на Startup план ($35/мес) нужен рано.

### Pattern: Pay-per-call Upstream Passthrough

```
Паттерн: Pay-per-call Upstream Passthrough
──────────────────────────────────────────────────────────
Условия применения:
  • Upstream провайдер предлагает pay-per-call модель
  • Нет фиксированных ежемесячных расходов
  • Данные кэшируемы (одинаковые запросы частые)

Стратегия APIbase:
  1. $0 startup cost — платим upstream только за реальные запросы
  2. Downstream цена = 2-3x upstream cost
  3. Кэширование мультиплицирует маржу (1 upstream → N downstream)
  4. По мере роста → подписка cheaper per-call

Применимо к:
  • OpenWeatherMap One Call 3.0 ($0.0015/call)
  • Любые pay-per-use API (AWS, Google Cloud APIs)
  • Потенциально: API с x402 upstream (UC-004 pattern)
```

### Pattern: Cross-UC Synergy (Weather as Utility)

```
Паттерн: Cross-UC Utility Layer
──────────────────────────────────────────────────────────
Концепция:
  • Некоторые API создают ценность НЕ сами по себе,
    а в комбинации с другими UC
  • Погода — универсальный контекст для любого решения

Примеры synergy:
  • Agent books flight (UC-002) → auto-append weather at destination
  • Agent orders food (UC-003) → "bad weather → order delivery"
  • Agent analyzes crypto (UC-004) → "cold snap → natural gas futures"
  • Agent checks predictions (UC-001) → "hurricane → prediction market impact"

Монетизация synergy:
  • Combo discount: weather + flight = $0.001 weather (vs $0.002 standalone)
  • But total revenue per session increases (2 tools instead of 1)
  • Retention: agents with 3+ tools have higher stickiness
```

### Unique aspects of UC-005 vs previous use cases

| Aspect | UC-001 | UC-002 | UC-003 | UC-004 | **UC-005** |
|--------|--------|--------|--------|--------|---------|
| Category | Crypto | Travel | Food | Finance | **Weather** |
| Upstream cost model | Free | Free | Subscription | Subscription+x402 | **Pay-per-call** |
| Fixed monthly cost | $0 | $0 | ~$200 | $129 | **$0 (start)** |
| Cache effectiveness | Medium | Low | Low | Medium | **Very High** |
| Cross-UC synergy | Low | Medium | Low | Low | **High (all UCs)** |
| Query frequency | Medium | Low (seasonal) | High (daily) | High | **Very High (hourly)** |
| Data type | Financial | Booking | Commerce | Market data | **Environmental** |
| Revenue per req | $0.0005 | $4.40/booking | $50 CPA | $0.002 | **$0.002** |
| Margin (effective) | ~100% | ~100% | 60-96% | 52-91% | **73-95%** |
| MCP tools | 8 | 7 | 6 | 9 | **7** |
