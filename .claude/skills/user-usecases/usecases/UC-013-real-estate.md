# UC-013: RentCast + US Census ACS (Real Estate / Property Intelligence)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-013 |
| **Provider** | RentCast (property data, AVM, listings) + US Census ACS (demographics) |
| **Category** | Real Estate / Property Intelligence |
| **Date Added** | 2026-03-07 |
| **Status** | Reference |
| **Client** | APIbase (platform-level integration) |

---

## 1. Client Input Data

Интеграция на уровне платформы — APIbase объединяет RentCast (commercial property data) + US Census (government demographics):

```
Тип данных:          Значение:
──────────────────────────────────────────────────────────
RentCast API Key     Paid key ($199-449/мес, self-serve)
US Census API Key    Free key от api.census.gov (мгновенный)
```

### Sufficiency Assessment

| Data provided | What it enables | Sufficient? |
|---------------|----------------|-------------|
| RentCast Growth ($199/мес) | 140M+ US properties: records, AVM (value + rent), active listings, market data, owner info, tax history. 5,000 calls/мес. Rate: 20 req/sec. | **Yes** — production доступ |
| RentCast Scale ($449/мес) | Всё выше + 25,000 calls/мес. Для scale. | **Yes** — scaling path |
| US Census ACS (free) | Demographics по каждому census tract/block group/ZIP: median income, home values, rent, education, population, commute, vacancy. | **Yes** — бесплатный enrichment |

**Verdict:** RentCast — **единственный** крупный RE data API, **явно разрешающий sublicensure, resale и redistribution** третьим лицам. Все остальные (Zillow, ATTOM, Mashvisor, Walk Score) запрещают. Census ACS — бесплатный government data для neighborhood intelligence. Комбинация даёт **Property + Neighborhood** intelligence, недоступный ни через один API по отдельности.

### Стратегический контекст: почему RentCast, а не Zillow/ATTOM/Redfin

```
Ситуация в Real Estate API (март 2026):
──────────────────────────────────────────────────────────────

DISQUALIFIED по ToS:
  × Zillow:          "May not use Zillow Data to provide a service
                      for other businesses" + "may not retain copies"
  × Realtor.com:     Enterprise-only, MLS redistribution rules
  × Redfin:          Нет public API вообще
  × ATTOM:           "No commercial exploitation or revenue generation"
                      + "may not resell or make derivative works"
  × HouseCanary:     Enterprise-gated, custom terms, no self-serve
  × Rightmove:       Нет developer API (UK only, agent feed)
  × Walk Score:      "Non-sublicensable, non-transferable", no caching
  × Mashvisor:       "Prohibits redistributing or commercially gaining"
  × Repliers/MLS:    Requires real estate license
  × SimplyRETS:      Adapter (нужна own MLS subscription)

СТРАТЕГИЯ APIbase:
  ✓ RentCast = ЕДИНСТВЕННЫЙ major RE API разрешающий:
    • "sublicensure, disclosure, display, resale and distribution
       of the API Data to third parties"
    • No attribution required
    • Can store data internally
    • Can create derivative works
  ✓ US Census ACS = free government data (commercial, redistributable)
  ✓ 140M+ US properties × Census demographics = fusion intelligence
  ✓ 2+ existing MCP серверов (proven demand)
  ✓ 30% recurring affiliate commission
  ✓ Real estate lifecycle CPA = highest in any vertical ($50-500/lead)
```

---

## 2. Provider API Analysis

### API Architecture

**RentCast** — self-serve real estate data API: 140M+ US property records (all 50 states, 38K+ ZIP codes). Предоставляет property records, AVM (Automated Valuation Model) для value и rent, active sale/rental listings, aggregate market statistics. Transparent pricing, no contracts.

**US Census ACS** — American Community Survey: 5-year estimates по каждому census tract, block group, county, MSA. Median home values, rent, income, education, demographics, commute patterns.

| Service | Base URL | Auth | Description |
|---------|----------|------|-------------|
| **Property Records** | `https://api.rentcast.io/v1/properties` | API Key (header) | Structural attributes, owner, tax, last sale |
| **Value Estimate** | `https://api.rentcast.io/v1/avm/value` | API Key | AVM: market value + comparables |
| **Rent Estimate** | `https://api.rentcast.io/v1/avm/rent` | API Key | Rent estimate + rental comparables |
| **Sale Listings** | `https://api.rentcast.io/v1/listings/sale` | API Key | Active for-sale listings |
| **Rental Listings** | `https://api.rentcast.io/v1/listings/rental` | API Key | Active rental listings |
| **Market Statistics** | `https://api.rentcast.io/v1/markets` | API Key | ZIP/city aggregate trends |
| **Census ACS** | `https://api.census.gov/data/2023/acs/acs5` | API Key (query) | Demographics by geography |

### Key Endpoints

#### Property Records (RentCast)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /v1/properties` | GET | Property details by address or ID |

**Параметры:**
```
address            — полный адрес ("123 Main St, Austin, TX 78701")
latitude/longitude — координаты (альтернатива address)
radius             — радиус поиска (для nearby properties)
```

**Возвращает:**
```
id                 — unique property ID
formattedAddress   — нормализованный адрес
city, state, zip   — геолокация
county             — округ
propertyType       — Single Family, Condo, Multi-Family, Townhouse...
bedrooms           — количество спален
bathrooms          — количество ванных
squareFootage      — площадь (sqft)
lotSize            — размер участка
yearBuilt          — год постройки
lastSalePrice      — цена последней продажи
lastSaleDate       — дата последней продажи
taxAssessedValue   — налоговая оценка
taxAmount          — годовой налог
ownerName          — имя владельца (public record)
```

#### AVM Value Estimate (RentCast)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /v1/avm/value` | GET | Market value estimate + comps |

**Возвращает:**
```
price              — estimated market value ($)
priceRangeLow      — нижняя граница
priceRangeHigh     — верхняя граница
pricePerSquareFoot — $/sqft
comparables[]      — 5-10 recent sales:
  address, price, sqft, beds, baths, distance, saleDate
```

#### AVM Rent Estimate (RentCast)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /v1/avm/rent` | GET | Rent estimate + rental comps |

**Возвращает:**
```
rent               — estimated monthly rent ($)
rentRangeLow       — нижняя граница
rentRangeHigh      — верхняя граница
rentPerSquareFoot  — $/sqft/month
comparables[]      — 5-10 active rentals:
  address, rent, sqft, beds, baths, distance, listDate
```

#### Market Statistics (RentCast)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /v1/markets` | GET | Aggregate market data by ZIP/city |

**Возвращает:**
```
zipCode/city       — geography
medianSalePrice    — медианная цена продажи
medianRent         — медианная аренда
daysOnMarket       — avg days on market
saleToListRatio    — % от запрашиваемой цены
inventory          — текущее предложение
priceChange12m     — изменение цен за 12 мес (%)
rentChange12m      — изменение аренды за 12 мес (%)
```

#### Census ACS Demographics

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /data/2023/acs/acs5` | GET | 5-year estimates by geography |

**Key variables:**
```
B25077_001E        — Median home value
B25064_001E        — Median gross rent
B19013_001E        — Median household income
B15003_022E+023E+025E — % with bachelor's degree+
B01003_001E        — Total population
B25003_002E        — % owner-occupied housing
B25002_003E        — Vacancy rate
B08303_001E        — Mean commute time (minutes)
B17001_002E        — Poverty rate
```

### Rate Limits & Pricing

| Plan | Price | Calls/month | Per-call effective |
|------|-------|------------|-------------------|
| **RentCast Free** | $0 | 50 | $0 (testing only) |
| **RentCast Starter** | $74/мес | 1,000 | $0.074 |
| **RentCast Growth** | $199/мес | 5,000 | $0.040 |
| **RentCast Scale** | $449/мес | 25,000 | $0.018 |
| **US Census ACS** | $0 | Unlimited* | $0 |

*Census: no hard daily limit, reasonable use policy.

### Licensing & ToS

| Component | License | Commercial | Resale | AI Use | Cache |
|-----------|---------|-----------|--------|--------|-------|
| **RentCast API** | Commercial SaaS | ✅ Yes | **✅ Explicitly Yes** | ✅ Yes | ✅ Can store internally |
| **RentCast Data** | Proprietary | ✅ Yes | **✅ "sublicensure, resale, distribution to 3rd parties"** | ✅ Yes | ✅ Yes |
| **US Census ACS** | US Government | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Permanent |

**RentCast ToS — ключевая цитата:**
> "Subject to the terms and conditions of this Agreement, we grant you a non-exclusive, worldwide, royalty-free license to use, reproduce, display, perform, and distribute the API Data, including the rights of **sublicensure, disclosure, display, resale and distribution of the API Data to third parties**."

Это **уникальная** формулировка среди всех RE API. Ни один конкурент (Zillow, ATTOM, Mashvisor) не разрешает resale/sublicensure.

---

## 3. APIbase Wrapper Design

### Architecture: Property Intelligence Fusion

```
┌─────────────────────────────────────────────────────────────┐
│               APIbase Property Intelligence Layer            │
│                                                               │
│  ┌─────────────────────┐  ┌────────────────────────────────┐│
│  │ RentCast ($199-449)  │  │ US Census ACS (free)           ││
│  │ • Property records   │  │ • Median income by tract       ││
│  │ • AVM value/rent     │  │ • Median home value/rent       ││
│  │ • Active listings    │  │ • Education levels             ││
│  │ • Market statistics  │  │ • Population demographics      ││
│  │ • Owner info         │  │ • Commute patterns             ││
│  │ • Tax history        │  │ • Vacancy rates                ││
│  └──────────┬──────────┘  └──────────────┬─────────────────┘│
│             │                             │                   │
│             └──────────┬──────────────────┘                   │
│                        │                                      │
│         ┌──────────────▼──────────────────────────────────┐  │
│         │        FUSION ENGINE                            │  │
│         │                                                 │  │
│         │  • Property record + neighborhood demographics  │  │
│         │  • Value estimate + Census median (context)     │  │
│         │  • Rent estimate + Census rental market data    │  │
│         │  • Investment analysis (cap rate, cash flow)    │  │
│         │  • Neighborhood grade (computed from Census)    │  │
│         └────────────────────┬────────────────────────────┘  │
│                              │                                │
│         ┌────────────────────▼────────────────────────────┐  │
│         │     LIFECYCLE AFFILIATE COMMERCE                │  │
│         │                                                 │  │
│         │  Mortgage:    LendingTree ($85/lead), SoFi      │  │
│         │  Insurance:   Policygenius ($20-50/lead)        │  │
│         │  Moving:      Moving.com ($15-30/lead)          │  │
│         │  Management:  TurboTenant ($25-100/signup)      │  │
│         │  RentCast:    30% recurring affiliate           │  │
│         │                                                 │  │
│         │  Property query → lifecycle triggers:           │  │
│         │  Buy intent → mortgage + insurance + moving     │  │
│         │  Rent intent → screening + management          │  │
│         │  Invest intent → funding + property mgmt       │  │
│         └────────────────────────────────────────────────┘  │
│                                                               │
│         ┌────────────────────────────────────────────────────┐│
│         │     CROSS-UC ENRICHMENT                            ││
│         │                                                    ││
│         │  UC-012 (Maps): geocode, POI near, isochrone       ││
│         │  UC-005 (Weather): climate risk, flood zone        ││
│         │  UC-011 (Health): nearby grocery/pharmacy/gym      ││
│         │  UC-006 (News): local development news             ││
│         └────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Wrapper Layers

#### Layer 1: Protocol Adapter

```
Upstream APIs:
  RentCast:   REST + API key (X-Api-Key header) + JSON
  Census ACS: REST + API key (query param) + JSON (complex query syntax)

APIbase unified:
  REST + x402 Bearer Token + normalized JSON
```

#### Layer 2: Semantic Normalizer

```
RentCast property response (raw):
{
  "id": "6e-27-52...",
  "formattedAddress": "123 Main St, Austin, TX 78701",
  "propertyType": "Single Family",
  "bedrooms": 3,
  "bathrooms": 2,
  "squareFootage": 1850,
  "yearBuilt": 1995,
  "lastSalePrice": 385000,
  "lastSaleDate": "2022-03-15",
  "taxAssessedValue": 362000,
  "taxAmount": 7240,
  "ownerName": "John Smith"
}

Census ACS (raw, by tract):
{
  "B19013_001E": "78500",
  "B25077_001E": "425000",
  "B25064_001E": "1650",
  "B15003_022E": "12500",
  "B01003_001E": "45200"
}

APIbase response (normalized + fused):
{
  "property": {
    "address": "123 Main St, Austin, TX 78701",
    "type": "Single Family",
    "specs": {"bedrooms": 3, "bathrooms": 2, "sqft": 1850, "lot_sqft": 6500},
    "year_built": 1995,
    "last_sale": {"price": 385000, "date": "2022-03-15"},
    "tax": {"assessed_value": 362000, "annual": 7240},
    "owner": "John Smith (public record)"
  },
  "neighborhood": {
    "median_income": 78500,
    "median_home_value": 425000,
    "median_rent": 1650,
    "college_educated_pct": 42.3,
    "population": 45200,
    "owner_occupied_pct": 61.2,
    "vacancy_rate": 5.8,
    "mean_commute_min": 24,
    "grade": "B+"
  },
  "context": {
    "property_vs_neighborhood": {
      "price_vs_median": "-9.4% below median (good value)",
      "relative_position": "below_average"
    }
  }
}
```

#### Layer 3: Value-Add (Investment Intelligence + Lifecycle Commerce)

```
APIbase unique value — property + neighborhood + investment intelligence:

1. PROPERTY + NEIGHBORHOOD FUSION
   "Tell me about 123 Main St, Austin" →
     RentCast: property record (3bd/2ba, 1850sqft, last sold $385K)
     Census: neighborhood (median income $78.5K, 42% college, grade B+)
     APIbase: "This property is 9.4% below neighborhood median.
              Neighborhood is upper-middle class, improving."

2. INVESTMENT ANALYSIS
   "Is this a good investment?" →
     RentCast: value $425K + rent $1,850/mo
     Census: vacancy 5.8%, income growth
     APIbase compute:
       Cap rate: 4.2%
       Cash flow: $312/mo (at 20% down, 6.5% rate)
       Price-to-rent ratio: 19.1 (moderately priced)
       Neighborhood investment grade: B+
       Verdict: "Moderate investment. Positive cash flow, stable neighborhood."

3. LIFECYCLE AFFILIATE TRIGGERS
   Buy intent detected → "Get mortgage pre-approval? [LendingTree]" ($85 CPA)
   Investment property → "Need property management? [TurboTenant]" ($25 CPA)
   Moving → "Compare movers? [Moving.com]" ($15 CPA)
   Insurance → "Get home insurance quotes? [Policygenius]" ($30 CPA)

4. CROSS-UC ENRICHMENT
   Property address → UC-012 geocode → UC-012 POI (schools, parks nearby)
   Property location → UC-005 weather → climate risk assessment
   Neighborhood → UC-011 health → grocery store quality (food desert?)
```

### Caching Strategy

```
Data Type              Cache Strategy           TTL
──────────────────────────────────────────────────────
Property records       Cache + refresh          30 days (structures stable)
AVM value estimate     Cache                    7 days (values change slowly)
AVM rent estimate      Cache                    7 days (rents change slowly)
Active listings        Cache                    24 hours (listings dynamic)
Market statistics      Cache                    7 days (monthly aggregate)
Census demographics    Permanent cache          12 months (annual release)
Owner info             Cache                    90 days (ownership changes)

Cache growth model:
  Month 1:  Seed Census data for all ZIP codes (free bulk download)
  Month 3:  ~50% cache hit rate (popular areas cached)
  Month 6:  ~65% (most queried properties + neighborhoods cached)
  Month 12: ~75% (mature cache)

  Property data = semi-static (bedrooms/sqft don't change).
  Values/rents = slow-moving (update weekly).
  Census = permanent (annual refresh).
```

---

## 4. MCP Tool Definitions

### Tool 1: `property-lookup`

```json
{
  "name": "property-lookup",
  "description": "Полные данные о недвижимости по адресу: характеристики (спальни, ванные, площадь, год), история продаж, налоговая оценка, owner info, PLUS neighborhood demographics (income, education, vacancy). 140M+ US properties.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "address": {
        "type": "string",
        "description": "Полный адрес: '123 Main St, Austin, TX 78701'"
      },
      "include_neighborhood": {
        "type": "boolean",
        "description": "Включить Census demographics (income, education, vacancy). Default: true"
      }
    },
    "required": ["address"]
  }
}
```

**Pricing:** $0.04/request (x402)

### Tool 2: `property-valuation`

```json
{
  "name": "property-valuation",
  "description": "Оценка рыночной стоимости (AVM): estimated value, price range, $/sqft, 5-10 comparable recent sales, confidence score. Сравнение с медианой района (Census). 'Сколько стоит этот дом?'",
  "inputSchema": {
    "type": "object",
    "properties": {
      "address": {
        "type": "string",
        "description": "Адрес объекта"
      },
      "include_comps": {
        "type": "boolean",
        "description": "Включить comparable sales (5-10 recent). Default: true"
      }
    },
    "required": ["address"]
  }
}
```

**Pricing:** $0.08/request (x402)

### Tool 3: `rent-estimate`

```json
{
  "name": "rent-estimate",
  "description": "Оценка ежемесячной аренды: estimated rent, range, $/sqft, 5-10 comparable rentals. Сравнение с медианой района. 'Сколько можно сдать за этот дом?'",
  "inputSchema": {
    "type": "object",
    "properties": {
      "address": {
        "type": "string",
        "description": "Адрес объекта"
      },
      "bedrooms": {
        "type": "integer",
        "description": "Количество спален (уточняет оценку)"
      },
      "bathrooms": {
        "type": "number",
        "description": "Количество ванных"
      }
    },
    "required": ["address"]
  }
}
```

**Pricing:** $0.08/request (x402)

### Tool 4: `market-analysis`

```json
{
  "name": "market-analysis",
  "description": "Анализ рынка по ZIP-коду или городу: медианные цены продажи/аренды, тренды за 12 мес, days on market, inventory, sale-to-list ratio, PLUS полная демография (Census: income, population, education, commute, vacancy).",
  "inputSchema": {
    "type": "object",
    "properties": {
      "zip_code": {
        "type": "string",
        "description": "ZIP-код: '78701'"
      },
      "city": {
        "type": "string",
        "description": "Город (альтернатива ZIP): 'Austin'"
      },
      "state": {
        "type": "string",
        "description": "Штат: 'TX' (required with city)"
      }
    }
  }
}
```

**Pricing:** $0.04/request (x402)

### Tool 5: `listing-search`

```json
{
  "name": "listing-search",
  "description": "Поиск активных объявлений о продаже или аренде: цена, адрес, характеристики, days on market, фото. Фильтры по цене, спальням, типу объекта.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "location": {
        "type": "string",
        "description": "ZIP-код, город или адрес для поиска"
      },
      "type": {
        "type": "string",
        "enum": ["sale", "rent"],
        "description": "Тип: продажа или аренда. Default: 'sale'"
      },
      "min_price": {"type": "integer", "description": "Минимальная цена ($)"},
      "max_price": {"type": "integer", "description": "Максимальная цена ($)"},
      "bedrooms_min": {"type": "integer", "description": "Минимум спален"},
      "property_type": {
        "type": "string",
        "enum": ["single_family", "condo", "townhouse", "multi_family", "any"],
        "description": "Тип объекта. Default: 'any'"
      },
      "limit": {"type": "integer", "description": "Количество результатов (1-50). Default: 10"}
    },
    "required": ["location"]
  }
}
```

**Pricing:** $0.03/request (x402)

### Tool 6: `investment-analysis`

```json
{
  "name": "investment-analysis",
  "description": "Инвестиционный анализ объекта: cap rate, cash flow, cash-on-cash return, price-to-rent ratio, neighborhood investment grade. Рассчитывает mortgage payment, сравнивает с rental income. 'Стоит ли покупать этот дом как инвестицию?'",
  "inputSchema": {
    "type": "object",
    "properties": {
      "address": {
        "type": "string",
        "description": "Адрес объекта"
      },
      "purchase_price": {
        "type": "integer",
        "description": "Цена покупки ($). Default: current AVM estimate"
      },
      "down_payment_pct": {
        "type": "number",
        "description": "Первоначальный взнос (%). Default: 20"
      },
      "interest_rate": {
        "type": "number",
        "description": "Процентная ставка (%). Default: current avg 30yr fixed"
      }
    },
    "required": ["address"]
  }
}
```

**Pricing:** $0.12/request (x402)

**Upstream:** 2 RentCast calls (value + rent) + Census data (cached)

### Tool 7: `neighborhood-profile`

```json
{
  "name": "neighborhood-profile",
  "description": "Полный профиль района: demographics (income, education, age, population), housing (ownership %, vacancy, median value/rent, trends), economics (employment, poverty, commute), nearby amenities (via UC-012 cross-UC). Computed neighborhood grade (A-F).",
  "inputSchema": {
    "type": "object",
    "properties": {
      "zip_code": {
        "type": "string",
        "description": "ZIP-код"
      },
      "address": {
        "type": "string",
        "description": "Адрес (альтернатива ZIP — определит tract автоматически)"
      },
      "include_amenities": {
        "type": "boolean",
        "description": "Включить nearby POI из UC-012 Maps (schools, parks, transit). Default: true"
      }
    }
  }
}
```

**Pricing:** $0.06/request (x402)

**Upstream:** Census ACS (cached) + RentCast market data (cached) + UC-012 POI (cross-UC)

---

## 5. AI Instructions for Agents

### System Prompt Addition

```
You have access to APIbase Property Intelligence tools powered by
RentCast (140M+ US properties) + US Census demographics.

TOOLS AVAILABLE:
• property-lookup: full property record + neighborhood demographics
• property-valuation: market value estimate + comparable sales
• rent-estimate: monthly rent estimate + comparable rentals
• market-analysis: ZIP/city-level market stats + demographics
• listing-search: active for-sale/rental listings with filters
• investment-analysis: cap rate, cash flow, cash-on-cash ROI
• neighborhood-profile: comprehensive neighborhood intelligence

USAGE GUIDELINES:

1. PROPERTY QUERIES
   "Tell me about 123 Main St, Austin" → property-lookup
   "How much is this house worth?" → property-valuation
   "What rent can I charge?" → rent-estimate
   "What's the market like in 78701?" → market-analysis

2. INVESTMENT QUERIES
   "Is this a good investment?" → investment-analysis
   "Compare these 2 properties" → investment-analysis × 2
   "Find investment properties" → listing-search + investment-analysis

3. NEIGHBORHOOD QUERIES
   "What's this neighborhood like?" → neighborhood-profile
   "Is this a good area?" → neighborhood-profile (focus on grade)
   "Demographics of ZIP 78701" → neighborhood-profile

4. LISTING QUERIES
   "Show me houses for sale in Austin under $400K" → listing-search
   "Rentals near downtown" → listing-search(type="rent")

5. LIFECYCLE TRIGGERS (affiliate)
   After property valuation → offer mortgage pre-approval
   After investment analysis → offer property management
   After listing search → offer insurance quotes
   Always disclose: "Affiliate links included"

IMPORTANT:
• Data covers US only (all 50 states, 140M+ properties)
• Property records from public sources (not MLS)
• AVM estimates are algorithmic — recommend professional appraisal for final decisions
• Census data = 5-year estimates, updated annually
• For medical/legal/financial advice → recommend consulting professional
• Owner info is public record — handle responsibly
```

---

## 6. Publication Strategy

### MCP Server Configuration

```json
{
  "name": "apibase-property",
  "version": "1.0.0",
  "description": "US property intelligence: records, valuations, rent estimates, market analysis, investment ROI, neighborhood demographics. 140M+ properties. RentCast + US Census.",
  "tools": [
    "property-lookup",
    "property-valuation",
    "rent-estimate",
    "market-analysis",
    "listing-search",
    "investment-analysis",
    "neighborhood-profile"
  ],
  "auth": {
    "type": "x402",
    "network": "base",
    "currency": "USDC"
  },
  "pricing": {
    "property-lookup": "$0.04",
    "property-valuation": "$0.08",
    "rent-estimate": "$0.08",
    "market-analysis": "$0.04",
    "listing-search": "$0.03",
    "investment-analysis": "$0.12",
    "neighborhood-profile": "$0.06"
  }
}
```

---

## 7. Traffic Flow Diagram

```
Agent request flow (example: investment-analysis):

Agent                APIbase                    RentCast      Census ACS
  │                    │                           │               │
  │ ── x402 $0.12 ───→│                           │               │
  │  investment-       │                           │               │
  │  analysis          │                           │               │
  │  "123 Main St,     │                           │               │
  │   Austin TX"       │                           │               │
  │                    │                           │               │
  │                    │── AVM value ─────────────→│               │
  │                    │←── $425K (range $400-450K)│               │
  │                    │                           │               │
  │                    │── AVM rent ──────────────→│               │
  │                    │←── $1,850/mo              │               │
  │                    │                           │               │
  │                    │── Census tract ──────────────────────────→│
  │                    │   check cache: ✅ cached   │               │
  │                    │   median income $78.5K    │               │
  │                    │   median home value $425K │               │
  │                    │                           │               │
  │                    │── COMPUTE ───→            │               │
  │                    │   Purchase: $425,000      │               │
  │                    │   Down (20%): $85,000     │               │
  │                    │   Mortgage: $340,000 @ 6.5%               │
  │                    │   Monthly payment: $2,149 │               │
  │                    │   Monthly rent: $1,850    │               │
  │                    │   Cash flow: -$299/mo     │               │
  │                    │   Cap rate: 4.2%          │               │
  │                    │   P/R ratio: 19.1         │               │
  │                    │   Neighborhood grade: B+  │               │
  │                    │                           │               │
  │←── response ───────│                           │               │
  │  {                 │                           │               │
  │    property: {...}, │                          │               │
  │    valuation: $425K,│                          │               │
  │    rent: $1,850/mo, │                          │               │
  │    investment: {    │                          │               │
  │      cap_rate: 4.2%,│                          │               │
  │      cash_flow: -$299/mo,                      │               │
  │      verdict: "Negative cash flow at 20% down.                │
  │                Consider 25% down or negotiate price.",         │
  │      neighborhood_grade: "B+"                  │               │
  │    },                                          │               │
  │    lifecycle: {                                │               │
  │      mortgage: "Get pre-approved [LendingTree]",              │
  │      insurance: "Compare quotes [Policygenius]"│               │
  │    }                                           │               │
  │  }                 │                           │               │

Revenue flow:
  x402 payment:     $0.12 per investment analysis
  Upstream cost:    $0.04 (RentCast value) + $0.04 (rent) + $0 (Census)
  Margin:           33% on API fees

  Lifecycle affiliate (potential per query):
    Mortgage lead:  $85 (LendingTree CPA)
    Insurance:      $30 (Policygenius CPA)
    = $115 additional revenue per conversion

  1% conversion rate → $1.15 avg affiliate per query
  Total effective revenue per query: $0.12 + $1.15 = $1.27
  Total margin: 93.7%
```

---

## 8. Monetization Model

### Pattern P13: Property Intelligence Fusion + Lifecycle Affiliate Commerce

```
Уникальность паттерна:
  • TRIPLE revenue: x402 + API affiliate (30% recurring) + lifecycle CPA
  • FUSION: paid commercial API + free government data
  • LIFECYCLE COMMERCE: property query → predictable chain of high-CPA leads
    (mortgage → insurance → moving → management)
  • HIGHEST CPA rates of any vertical ($50-500 per qualified lead)
  • 30% RECURRING affiliate (RentCast) — passive income after referral

Отличия от существующих паттернов:
  vs P2 (Affiliate RevShare):
    P2: one-shot affiliate (flight booking → commission)
    P13: LIFECYCLE affiliate (1 property query → mortgage + insurance + moving)
    P2: affiliate = primary revenue
    P13: x402 + affiliate + lifecycle CPA = TRIPLE revenue

  vs P8 (Transactional Affiliate):
    P8: auto-injected affiliate URLs (Ticketmaster)
    P13: LIFECYCLE chain triggered by data context (property → services)
    P8: one CPA per action ($0.30/ticket)
    P13: MULTIPLE CPAs per action ($115-342 lifecycle)

  vs P9 (Price History Oracle):
    P9: compute intelligence from subscription data
    P13: compute investment analysis + fuse government demographics

  vs P11 (Gov Data Fusion):
    P11: government-only data ($0 upstream)
    P13: government + commercial fusion ($199-449 upstream)
    P11: health affiliate (supplements, recurring)
    P13: RE lifecycle affiliate (mortgage, one-time but $50-500/lead)
```

### Revenue Streams

| Stream | Source | Monthly Revenue |
|--------|--------|-----------------|
| x402 micropayments | 5K-50K queries × $0.05 avg | $250–2,500 |
| RentCast affiliate | 5-50 referrals × $30 avg recurring | $150–1,500 |
| Mortgage CPA | 50-500 leads × $85 avg | $4,250–42,500 |
| Insurance CPA | 25-250 leads × $30 avg | $750–7,500 |
| Moving CPA | 10-100 leads × $20 avg | $200–2,000 |
| Property mgmt CPA | 5-50 signups × $50 avg | $250–2,500 |
| **TOTAL** | | **$5,850–58,500** |

### Unit Economics

```
Per property-lookup query:
  Revenue:       $0.04
  Upstream cost: $0.04 (RentCast) + $0 (Census, cached)
  Margin:        ~0% on API (loss leader)
  But: 1% chance of lifecycle conversion = +$1.15 avg
  Effective margin: ~96%

Per investment-analysis query:
  Revenue:       $0.12
  Upstream cost: $0.08 (2 RentCast calls) + $0 (Census)
  Margin on API: 33%
  Lifecycle conversion value: $1.15 avg
  Effective margin: 93%

Per mortgage lead (lifecycle CPA):
  CPA revenue:   $85 (LendingTree)
  Cost to generate: ~$4 (100 queries × $0.04 upstream at 1% conversion)
  ROI per lead:  2,025%

Break-even (API-only, no affiliate):
  $199/мес ÷ $0.01 avg margin ≈ 19,900 req/мес
  = ~663 req/day

Break-even (with lifecycle affiliate):
  ~50 req/day (1% conversion × $85 CPA covers $199 RentCast easily)
```

---

## 9. Lessons Learned

### Lesson 1: Real Estate = Most Protected Data Category

```
Открытие:
  Real Estate API — НАИБОЛЕЕ защищённая категория из всех 13 UC.
  Даже Maps (UC-012) менее враждебен.

  11 из 18 кандидатов DISQUALIFIED:
  Zillow, Realtor.com, Redfin, ATTOM, HouseCanary,
  Rightmove, Walk Score, Mashvisor, Repliers, SimplyRETS, CIAN

  Причина: real estate data = core business asset.
  Zillow's Zestimate — это ИХ продукт.
  ATTOM's property records — стоят $billions.
  Walk Score (Redfin) — competitive advantage.

  RentCast = ЕДИНСТВЕННЫЙ major RE API с resale rights.
  Это не совпадение — это бизнес-модель:
  RentCast ЗАРАБАТЫВАЕТ на распространении (30% affiliate),
  а не на ограничении.

Правило: ищи провайдеров, чья бизнес-модель ВЫИГРЫВАЕТ
         от redistribution (как Travelpayouts в UC-002).
```

### Lesson 2: Lifecycle Commerce = Highest Revenue Pattern

```
Открытие:
  P13 потенциально = САМЫЙ доходный паттерн в портфеле.

  Сравнение CPA rates:
  UC-002 (flights):     $1-5 per booking
  UC-008 (tickets):     $0.30 per ticket
  UC-009 (supplements): $1-2.50 per order
  UC-010 (streaming):   $2-3 per signup
  UC-013 (mortgage):    $85-500 per lead ← 17-500x выше!

  Real estate = high-ticket, low-frequency = massive CPA.
  Один mortgage lead покрывает МЕСЯЦЫ upstream costs.

  Но ключевое отличие — LIFECYCLE:
  Один property query запускает ЦЕПОЧКУ:
  1. Mortgage pre-qualification ($85 CPA)
  2. Home insurance quote ($30 CPA)
  3. Moving estimate ($20 CPA)
  4. Property management ($50 CPA)
  = $185 total per lifecycle vs $0.30 per ticket (UC-008)

  Lifecycle commerce = predictable chain of conversions.
  Не one-shot, а ПОСЛЕДОВАТЕЛЬНОСТЬ affiliate actions.
```

### Lesson 3: Government Data as Free Intelligence Layer

```
Открытие:
  US Census ACS = бесплатный enrichment для commercial data.

  RentCast: "House is worth $425K"
  Census: "Neighborhood median = $425K → average property"

  RentCast alone: property record
  RentCast + Census: property + neighborhood CONTEXT

  Это паттерн для других UC:
  • Property data + Census demographics (UC-013)
  • Health data + Census socioeconomic (UC-011)
  • Food delivery + Census income (UC-003 future)

  Government data = free contextualizer для commercial APIs.
  Второй UC (после UC-011 Health) с government fusion.
```

### Lesson 4: First UC with US-Only Coverage

```
Открытие:
  UC-013 = первый UC ограниченный ОДНОЙ страной (US only).

  Все предыдущие UC — глобальные или мультирегиональные:
  UC-002 (Travel): global
  UC-004 (Crypto): global
  UC-005 (Weather): global
  UC-008 (Events): 26+ countries
  UC-010 (TMDB): global

  Real estate = inherently local.
  Нет ни одного RE API с global coverage + permissive ToS.

  Стратегия для будущего расширения:
  US first (RentCast) → добавить UK (Zoopla?), EU (Idealista?)
  как P3-style Multi-Provider Router по регионам.

  Но US market alone = достаточно (140M properties, $50T+ total value).
```

### Lesson 5: Broker Alignment = ToS Freedom

```
Открытие:
  RentCast разрешает resale ПОТОМУ ЧТО их бизнес-модель
  = distribution platform, не walled garden.

  Аналогии в портфеле:
  • Travelpayouts (UC-002): ХОТЯТ чтобы affiliate ссылки распространялись
  • Ticketmaster (UC-008): ХОТЯТ чтобы tickets покупались через partners
  • RentCast (UC-013): ХОТЯТ чтобы API data использовался ВЕЗДЕ
    (30% affiliate = they win when APIbase grows)

  vs Zillow/Redfin: их бизнес-модель = "приходите к НАМ на сайт"
  → redistribution = потеря трафика → запрещают.

  Правило: ЛУЧШИЕ upstream partners — те, кто ЗАРАБАТЫВАЕТ
           на вашем росте (alignment of incentives).
```

### Competitive Landscape Note

```
Real Estate + AI (март 2026):
  • Zillow: внутренний AI (Zestimate ML), нет external API для agents
  • Redfin: AI property search assistant, нет API
  • Realtor.com: MLS-locked, enterprise only
  • OpenAI: no real estate data partnership announced
  • Google: real estate data in Knowledge Graph, не через API

  APIbase opportunity:
  НИКТО не предоставляет real estate data для AI agents через MCP/x402.
  2+ existing MCP серверов для RentCast = proven demand.
  APIbase = first AI-native real estate intelligence API.

  Key differentiator: neighborhood context (Census fusion).
  No existing MCP server combines property data + demographics.
  APIbase UC-013 = first to do this fusion.
```
