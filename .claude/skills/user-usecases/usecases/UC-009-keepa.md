# UC-009: Keepa

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-009 |
| **Provider** | Keepa (keepa.com) |
| **Category** | E-commerce / Price Intelligence |
| **Date Added** | 2026-03-07 |
| **Status** | Reference |
| **Client** | APIbase (platform-level integration) |

---

## 1. Client Input Data

Интеграция на уровне платформы — APIbase подключает Keepa как upstream-провайдер:

```
Тип данных:          Значение:
──────────────────────────────────────────────────────────
Keepa API Key        Subscriber key (€49/мес minimum)
```

### Sufficiency Assessment

| Data provided | What it enables | Sufficient? |
|---------------|----------------|-------------|
| Free tier | **Не существует** — Keepa не имеет free tier. | **No** |
| Individual plan (€49/мес) | 20 tokens/min (28,800/day). Price history, BSR, deals, product finder. | **Yes** — достаточно для старта |
| Professional (€459/мес) | 250 tokens/min (360,000/day). Для scale. | **Yes** — для роста |
| Enterprise (€1,499/мес) | 1,000 tokens/min (1.44M/day). | **Yes** — для high volume |

**Verdict:** Keepa — чистый subscription service, нет free tier, нет affiliate. Старт с **Individual plan (€49/мес ≈ $53/мес)**. Это первый UC с **price intelligence** как standalone data product. Keepa отслеживает **3+ миллиарда Amazon товаров** с историей цен за годы — эти данные **недоступны** через Amazon собственный PA-API.

### Стратегический контекст: почему Keepa, а не Amazon/eBay/Etsy

```
Ситуация в e-commerce API (март 2026):
──────────────────────────────────────────────────────────────

DISQUALIFIED по ToS:
  × Amazon PA-API: запрещает proxy/redistribution, засудили Perplexity
  × eBay Browse API: запрещает commercializing data, LLM training
  × Etsy Open API: запрещает third-party API access/commercialization

STRUCTURAL LOCKDOWN:
  × OpenAI: ChatGPT Instant Checkout (Sep 2025) с Etsy, Shopify — 4% fee
  × Google: Universal Commerce Protocol (Jan 2026) с Etsy, Wayfair, Target
  × Транзакционный слой захватывается BigTech напрямую

СТРАТЕГИЯ APIbase:
  ✓ Keepa = DATA LAYER (price intelligence), не transactional layer
  ✓ Данные, которые НИ ОДИН BigTech не предоставляет
  ✓ "Is $89 a good price?" — OpenAI/Google НЕ отвечают на это
  ✓ Keepa = complementary к ChatGPT Checkout / Google UCP
```

---

## 2. Provider API Analysis

### API Architecture

Keepa — крупнейший трекер цен Amazon: **3+ миллиарда товаров**, история цен за годы, BSR (Best Seller Rank), данные о deals, review count history. Уникальный data provider — эта информация недоступна через Amazon PA-API.

| Service | Base URL | Auth | Description |
|---------|----------|------|-------------|
| **Product API** | `https://api.keepa.com/product` | API Key (query param) | Полные данные о товаре: цена, BSR, история |
| **Product Finder** | `https://api.keepa.com/search` | API Key | Поиск товаров по критериям (цена, BSR, категория) |
| **Deal API** | `https://api.keepa.com/deal` | API Key | Текущие скидки и deals на Amazon |
| **Category API** | `https://api.keepa.com/category` | API Key | Древо категорий Amazon (43,000+ категорий) |
| **Best Sellers** | `https://api.keepa.com/bestsellers` | API Key | Top sellers по категории |
| **Stats API** | `https://api.keepa.com/tracking` | API Key | Price alerts и tracking |

### Key Endpoints

#### Product API (Primary)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /product` | GET | Данные о товаре(ах) по ASIN(s) |

**Ключевые параметры:**
```
domain        — Amazon marketplace (1=com, 2=co.uk, 3=de, 4=fr, 5=co.jp,
                6=ca, 8=it, 9=es, 10=in, 11=com.mx, 12=com.br, ...)
asin          — один или несколько ASIN (до 100 в одном запросе)
stats         — период для статистики (1, 3, 7, 14, 30, 90, 180, 365 дней)
history       — включить историю цен (true/false)
days          — количество дней истории (по умолчанию: вся история)
offers        — включить данные о sellers (до 100 offers)
rating        — включить историю рейтинга
buybox        — включить историю Buy Box
rental        — включить цены аренды (книги)
```

**Возвращаемые данные (уникальные):**
```
Price History (CSV arrays, timestamps + values):
  csv[0]  — Amazon price history
  csv[1]  — Marketplace new price history
  csv[2]  — Marketplace used price history
  csv[3]  — Sales rank history (BSR)
  csv[4]  — Marketplace listing count (new)
  csv[5]  — Marketplace listing count (used)
  csv[7]  — New 3rd party FBA price
  csv[10] — Lightning Deal price
  csv[11] — Warehouse Deal price
  csv[16] — Buy Box price history
  csv[17] — Used Buy Box price
  csv[18] — Price per unit (e.g., per oz, per count)
  csv[20] — New offer count (FBA)
  csv[31] — Review count history
  csv[32] — Rating history (1-50, multiply by 0.1)

Stats (for requested period):
  current     — текущая цена
  avg         — средняя цена за период
  min         — минимальная цена за период (+ дата)
  max         — максимальная цена за период (+ дата)
  percentile  — [10th, 25th, 50th, 75th, 90th] percentiles
  outOfStock  — % времени out of stock за период
  atAmazon    — текущая цена у Amazon
  atThirdParty — текущая лучшая цена у 3rd party
```

#### Product Finder (Search)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /search` | GET | Поиск товаров по параметрам |

**Ключевые параметры:**
```
domain           — Amazon marketplace
current_X        — текущая цена (min/max для типа X)
avg30_X          — средняя цена за 30 дней (min/max)
avg90_X          — средняя цена за 90 дней (min/max)
salesRank_current — текущий BSR (min/max)
deltaPercent_X   — изменение цены в % (за 1/3/7/14/30/90 дней)
title            — поиск по названию
categoryId       — ID категории Amazon
sort             — сортировка (price, salesRank, delta)
```

#### Deal API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /deal` | GET | Текущие deals/скидки |

**Параметры:**
```
domain        — Amazon marketplace
page          — страница результатов
dealTypes     — lightning, warehouse, coupon, priceHistory
percentRange  — диапазон скидки (e.g., 30-90 = от 30% до 90% скидки)
priceRange    — диапазон цены (min-max в центах)
categoryId    — фильтр по категории
sortType      — dateNew, dateOld, percentOff, price
```

#### Category API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /category` | GET | Древо категорий Amazon |

**Данные:** 43,000+ категорий с иерархией, названиями, product counts.

#### Best Sellers API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /bestsellers` | GET | Top sellers по категории |

**Данные:** До 100 top ASIN per category, обновляется hourly.

### Authentication Model

```
Простая модель:
  Query parameter: ?key=YOUR_API_KEY
  Нет OAuth, нет headers — только query parameter.

Token-based rate limiting:
  Каждый запрос "стоит" определённое количество tokens:
  • Product (1 ASIN, no history):  1 token
  • Product (1 ASIN, with history): 2 tokens
  • Product (1 ASIN, with offers):  3 tokens
  • Product Finder:                 variable
  • Deal:                           1 token per page
  • Category:                       1 token
  • Best Sellers:                   1 token
```

### Rate Limits & Pricing

| Plan | Tokens/min | Tokens/day | Price | Per-token cost |
|------|-----------|-----------|-------|----------------|
| Individual | 20 | 28,800 | €49/мес ($53) | $0.00184 |
| Professional | 250 | 360,000 | €459/мес ($497) | $0.00138 |
| Enterprise | 1,000 | 1,440,000 | €1,499/мес ($1,623) | $0.00113 |
| Mega | 4,000 | 5,760,000 | €4,499/мес ($4,870) | $0.00085 |

### Supported Marketplaces

```
14 Amazon marketplaces:
  1  — amazon.com (US)
  2  — amazon.co.uk (UK)
  3  — amazon.de (Germany)
  4  — amazon.fr (France)
  5  — amazon.co.jp (Japan)
  6  — amazon.ca (Canada)
  8  — amazon.it (Italy)
  9  — amazon.es (Spain)
  10 — amazon.in (India)
  11 — amazon.com.mx (Mexico)
  12 — amazon.com.br (Brazil)
  13 — amazon.com.au (Australia)
  14 — amazon.nl (Netherlands)
  15 — amazon.sa (Saudi Arabia)
```

### Data Uniqueness

```
Данные, которых НЕТ в Amazon PA-API:
──────────────────────────────────────────────────────────────
✓ Полная история цен (годы назад) — PA-API показывает только текущую
✓ BSR (Best Seller Rank) история — PA-API не предоставляет
✓ Buy Box price history — кто и когда владел Buy Box
✓ Lightning Deal / Warehouse Deal pricing — только во время deal
✓ Review count history — как росло количество отзывов
✓ Rating history — как менялся средний рейтинг
✓ Out-of-stock percentage — как часто товар был недоступен
✓ Seller offer count history — конкурентная динамика
✓ Price percentiles — статистический анализ ценовой истории
✓ Price drop alerts — настройка уведомлений о снижении цены

Данные, которые ЕСТЬ в Amazon PA-API (и нет в Keepa):
✓ Product images (Keepa не хранит)
✓ Product descriptions
✓ Related products / recommendations
✓ Customer reviews text
```

---

## 3. APIbase Wrapper Design

### Level 1: Protocol Adapter

```
What the adapter does:
──────────────────────────────────────────────────────────────
• Wraps 6 Keepa сервисов → unified price intelligence interface
  apibase.pro/api/v1/prices/...

• Request routing:
  /prices/history         → keepa.com /product (with history=true)
  /prices/check           → keepa.com /product (stats only, no history)
  /prices/search          → keepa.com /search
  /prices/deals           → keepa.com /deal
  /prices/bestsellers     → keepa.com /bestsellers
  /prices/categories      → keepa.com /category
  /prices/track           → keepa.com /tracking

• ASIN resolution:
  - Агент отправляет product name, не ASIN
  - APIbase ищет ASIN через Product Finder
  - Cached ASIN → product name mapping (30 days)
  - "AirPods Pro" → B0D1XD1ZV3

• Smart caching (ASIN-level):
  - Price history: 60 min TTL (цены меняются медленно)
  - Current price check: 15 min TTL
  - BSR/rank data: 4 hours TTL
  - Deals: 15 min TTL (deals expire)
  - Best sellers: 1 hour TTL
  - Categories: 30 days TTL (stable)

  Cache multiplier:
    Popular ASINs (AirPods, PS5): 20-50x multiplier
    Average ASINs: 5-10x multiplier
    Rare ASINs: 1-2x multiplier

• Human-readable price analysis:
  - Keepa returns raw CSV arrays (timestamps + cents)
  - APIbase transforms → structured JSON:
    {current: $89, avg30d: $95, min90d: $79, max90d: $119,
     recommendation: "good_price", percentile: "below_25th"}
  - "Is this a good price?" → computed from percentiles

• Multi-marketplace routing:
  - Агент спрашивает "AirPods Pro price history"
  - APIbase определяет marketplace по context/IP/preference
  - Может запросить несколько marketplace'ов параллельно
  - "Cheapest in US, UK, or DE?" → 3 upstream calls → merge

• Error normalization:
  Keepa errors → APIbase standard format:
  {"error": "price_product_not_found", "message": "ASIN not tracked by Keepa"}
  {"error": "price_tokens_exhausted", "message": "Rate limit reached, retry in 60s"}
  {"error": "price_marketplace_unsupported", "message": "Marketplace not available"}
```

### Level 2: Semantic Normalizer

**Domain model: `price-intelligence`**

```json
// === Keepa original (simplified — actual is CSV arrays) ===
{
  "products": [{
    "asin": "B0D1XD1ZV3",
    "title": "Apple AirPods Pro (2nd Generation)",
    "stats": {
      "current": [17900, 18900, 15900, 234, ...],
      "avg30": [18500, 19200, 16500, 245, ...],
      "min90": [14900, 16500, 13900, 189, ...],
      "max90": [24900, 25900, 22900, 312, ...]
    },
    "csv": [[timestamp, price], [timestamp, price], ...]
  }]
}

// === APIbase normalized (price-intelligence schema) ===
{
  "provider": "keepa",
  "product": {
    "asin": "B0D1XD1ZV3",
    "title": "Apple AirPods Pro (2nd Generation)",
    "marketplace": "amazon.com",
    "category": "Electronics > Headphones",
    "url": "https://www.amazon.com/dp/B0D1XD1ZV3"
  },
  "price": {
    "current": {
      "amazon": 179.00,
      "third_party_new": 189.00,
      "third_party_used": 159.00,
      "buy_box": 179.00,
      "currency": "USD"
    },
    "stats_30d": {
      "avg": 185.00,
      "min": 149.00,
      "min_date": "2026-02-14",
      "max": 249.00,
      "max_date": "2026-02-28",
      "percentile_25": 169.00,
      "percentile_50": 185.00,
      "percentile_75": 199.00
    },
    "stats_90d": {
      "avg": 192.00,
      "min": 149.00,
      "max": 249.00,
      "out_of_stock_pct": 3.2
    }
  },
  "analysis": {
    "is_good_price": true,
    "price_position": "below_25th_percentile",
    "vs_avg_30d": -3.2,
    "vs_avg_90d": -6.8,
    "recommendation": "Good price — currently $6 below 30-day average. This is in the bottom 25% of prices seen in the last 90 days.",
    "typical_sale_price": 169.00,
    "all_time_low": 139.00,
    "all_time_low_date": "2025-11-29"
  },
  "rank": {
    "bsr_current": 234,
    "bsr_category": "Electronics",
    "bsr_30d_avg": 245,
    "bsr_trend": "improving"
  },
  "sellers": {
    "new_offer_count": 47,
    "used_offer_count": 23,
    "fba_offer_count": 31
  },
  "reviews": {
    "count": 156432,
    "rating": 4.7,
    "rating_trend": "stable"
  },
  "billing": {
    "tokens_used": 2,
    "cost_x402": 0.008
  },
  "timestamp": "2026-03-07T14:30:00Z"
}
```

### Level 3: Price Intelligence & Value-Add

```
APIbase добавляет ценность поверх прямого Keepa API:
──────────────────────────────────────────────────────────────

1. Price Recommendation Engine:
   - "Is this a good price?" — computed from percentile analysis
   - below 10th percentile → "exceptional_deal"
   - below 25th percentile → "good_price"
   - 25th-75th percentile → "fair_price"
   - above 75th percentile → "overpriced"
   - above 90th percentile → "avoid_buying"

2. Best Time to Buy prediction:
   - Historical seasonal patterns (Black Friday, Prime Day, etc.)
   - "When does this typically go on sale?" from price history
   - "Wait 2 weeks — this product drops 20% during Prime Day"

3. Cross-marketplace comparison:
   - Same ASIN on amazon.com vs amazon.co.uk vs amazon.de
   - Currency conversion + shipping estimate
   - "Cheapest in Germany at €149 (vs $179 in US)"

4. Deal alerts aggregation:
   - Lightning Deals + Warehouse Deals + Coupons + Price Drops
   - Curated by category and discount percentage
   - "Top 10 electronics deals right now (>30% off)"

5. Product comparison:
   - Side-by-side price history for 2-5 competing products
   - "AirPods Pro vs Sony WF-1000XM5 vs Samsung Galaxy Buds"
   - Price trends, rating comparison, BSR comparison

6. Enrichment with external data:
   - Cross-UC: translate product title (UC-007)
   - Cross-UC: related news about product (UC-006)
```

---

## 4. MCP Tool Definitions

### Tool: price-history

```json
{
  "name": "price-history",
  "description": "Get Amazon price history for any product. Shows current price, 30/90-day stats (avg, min, max), percentile analysis, and a 'good price' recommendation. Tracks 3+ billion Amazon products across 14 marketplaces. This data is NOT available through Amazon's own API — it's unique intelligence.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "product": {
        "type": "string",
        "description": "Product name or Amazon ASIN (e.g., 'AirPods Pro' or 'B0D1XD1ZV3')"
      },
      "marketplace": {
        "type": "string",
        "enum": ["us", "uk", "de", "fr", "jp", "ca", "it", "es", "in", "mx", "br", "au"],
        "default": "us",
        "description": "Amazon marketplace"
      },
      "period_days": {
        "type": "integer",
        "enum": [30, 90, 180, 365],
        "default": 90,
        "description": "Price history period in days"
      }
    },
    "required": ["product"]
  }
}
```

### Tool: price-check

```json
{
  "name": "price-check",
  "description": "Quick price check: is the current price good, fair, or overpriced? Returns current price, 30-day average, and a recommendation (exceptional_deal / good_price / fair_price / overpriced). Much faster than full price-history — use for quick buy/wait decisions.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "product": {
        "type": "string",
        "description": "Product name or ASIN"
      },
      "marketplace": {
        "type": "string",
        "enum": ["us", "uk", "de", "fr", "jp", "ca"],
        "default": "us"
      }
    },
    "required": ["product"]
  }
}
```

### Tool: price-deals

```json
{
  "name": "price-deals",
  "description": "Find current deals and discounts on Amazon. Filter by category, discount percentage, and price range. Includes Lightning Deals, Warehouse Deals, Coupons, and significant price drops. Updated every 15 minutes.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "category": {
        "type": "string",
        "description": "Product category (e.g., 'Electronics', 'Home & Kitchen', 'Books')"
      },
      "min_discount_pct": {
        "type": "integer",
        "default": 20,
        "description": "Minimum discount percentage (e.g., 30 = 30% off or more)"
      },
      "max_price": {
        "type": "number",
        "description": "Maximum price in USD"
      },
      "marketplace": {
        "type": "string",
        "enum": ["us", "uk", "de", "fr", "jp", "ca"],
        "default": "us"
      },
      "limit": {
        "type": "integer",
        "default": 10,
        "description": "Number of deals to return (max 50)"
      }
    },
    "required": []
  }
}
```

### Tool: price-compare

```json
{
  "name": "price-compare",
  "description": "Compare prices of 2-5 products side by side. Shows current price, 90-day range, rating, BSR rank, and which product offers the best value. Perfect for 'AirPods vs Sony vs Samsung' comparisons.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "products": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Product names or ASINs to compare (2-5 items)",
        "minItems": 2,
        "maxItems": 5
      },
      "marketplace": {
        "type": "string",
        "enum": ["us", "uk", "de", "fr", "jp", "ca"],
        "default": "us"
      }
    },
    "required": ["products"]
  }
}
```

### Tool: price-search

```json
{
  "name": "price-search",
  "description": "Search Amazon products by criteria: price range, discount percentage, BSR rank, category. Find products that match specific price/quality requirements. Great for 'find headphones under $100 with >4.5 rating' queries.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Product search keywords"
      },
      "category": {
        "type": "string",
        "description": "Amazon category name"
      },
      "price_min": {
        "type": "number",
        "description": "Minimum price in USD"
      },
      "price_max": {
        "type": "number",
        "description": "Maximum price in USD"
      },
      "min_rating": {
        "type": "number",
        "description": "Minimum rating (1.0-5.0)"
      },
      "min_discount_pct": {
        "type": "integer",
        "description": "Products currently discounted by at least X%"
      },
      "marketplace": {
        "type": "string",
        "enum": ["us", "uk", "de", "fr", "jp", "ca"],
        "default": "us"
      },
      "sort": {
        "type": "string",
        "enum": ["price_asc", "price_desc", "rating", "discount", "bestseller"],
        "default": "bestseller"
      },
      "limit": {
        "type": "integer",
        "default": 10
      }
    },
    "required": []
  }
}
```

### Tool: price-bestsellers

```json
{
  "name": "price-bestsellers",
  "description": "Get Amazon Best Sellers for any category. Shows top products with current prices, ratings, and BSR trends. Updated hourly. Covers 43,000+ Amazon categories.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "category": {
        "type": "string",
        "description": "Amazon category (e.g., 'Electronics', 'Books', 'Toys & Games')"
      },
      "marketplace": {
        "type": "string",
        "enum": ["us", "uk", "de", "fr", "jp", "ca"],
        "default": "us"
      },
      "limit": {
        "type": "integer",
        "default": 10,
        "description": "Number of bestsellers (max 100)"
      }
    },
    "required": ["category"]
  }
}
```

### Tool: price-alert

```json
{
  "name": "price-alert",
  "description": "Set up a price drop alert for a product. Get notified when the price drops below your target. Useful for 'tell me when AirPods go below $150'. Returns alert ID for tracking.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "product": {
        "type": "string",
        "description": "Product name or ASIN"
      },
      "target_price": {
        "type": "number",
        "description": "Target price in local currency"
      },
      "marketplace": {
        "type": "string",
        "enum": ["us", "uk", "de", "fr", "jp", "ca"],
        "default": "us"
      }
    },
    "required": ["product", "target_price"]
  }
}
```

---

## 5. AI Instructions

```markdown
# Keepa Price Intelligence via APIbase — AI Agent Instructions

## When to Use
- User asks "Is this a good price?" or "Should I buy now or wait?"
- User wants Amazon price history for a product
- User asks "When do [product] typically go on sale?"
- User wants to compare prices of competing products
- User asks "What are the best deals on Amazon right now?"
- User says "Find me [product] under $[amount]"
- User asks about Black Friday / Prime Day pricing
- User wants to track a price drop: "Tell me when X goes below $Y"
- Cross-UC: price context for any product mention

## Key Concepts
- Keepa tracks 3+ BILLION Amazon products with years of price history
- This data is NOT available through Amazon's own API
- 14 Amazon marketplaces (US, UK, DE, FR, JP, CA, IT, ES, IN, MX, BR, AU, NL, SA)
- Price analysis: current vs avg vs min vs max + percentile position
- BSR (Best Seller Rank) = popularity metric
- Billing: per-request x402, NOT per-character

## Recommendations Guide
- below 10th percentile → "Exceptional deal! Rarely this cheap."
- below 25th percentile → "Good price — below average."
- 25th-75th percentile → "Fair price — typical range."
- above 75th percentile → "Above average — consider waiting."
- above 90th percentile → "Overpriced — wait for a sale."

## Recommended Call Chains

### "Is $89 a good price for AirPods Pro?"
1. `price-check` (product="AirPods Pro") → quick recommendation
2. Present: current price, 30-day avg, recommendation

### "Show me price history for PlayStation 5"
1. `price-history` (product="PlayStation 5", period_days=365)
2. Present: price chart description, min/max/avg, seasonal patterns

### "AirPods vs Sony WF-1000XM5 — which is better value?"
1. `price-compare` (products=["AirPods Pro", "Sony WF-1000XM5"])
2. Present: side-by-side prices, ratings, BSR, value analysis

### "Best electronics deals right now"
1. `price-deals` (category="Electronics", min_discount_pct=30)
2. Present: top deals with original price, discount, recommendation

### "Find noise-cancelling headphones under $200"
1. `price-search` (query="noise cancelling headphones", price_max=200, min_rating=4.0)
2. Present: products sorted by value (price + rating + BSR)

### "Tell me when MacBook Air goes below $900"
1. `price-alert` (product="MacBook Air M3", target_price=900)
2. Confirm: "Alert set. I'll notify you when MacBook Air drops below $900."

### "Should I buy now or wait for Prime Day?" (seasonal analysis)
1. `price-history` (product="...", period_days=365)
2. Analyze: seasonal dips (Nov = Black Friday, Jul = Prime Day)
3. Present: "Last Prime Day this was $X (Y% lower). Prime Day is in ~4 months."

## Response Formatting
- Always show: product name, current price, recommendation
- For price history: describe trend (rising/falling/stable)
- For deals: show original price, sale price, discount %
- For comparisons: table format with key metrics
- Include marketplace: "Amazon US" / "Amazon UK"
- Attribution: "Price data by Keepa (3B+ products tracked)"

## Cross-UC Integration
Price intelligence enhances shopping-adjacent queries:

| UC | Integration |
|----|-------------|
| UC-006 NewsAPI | "iPhone 16 price drop" news + actual price data |
| UC-007 DeepL | Translate product descriptions from other marketplaces |
| UC-008 Ticketmaster | "Cheapest PS5 + concert tickets" multi-purchase planning |

## Limitations
- Amazon products ONLY (no eBay, Walmart, etc.)
- No product images (use Amazon product page)
- No review TEXT (only count and rating)
- No product descriptions (only titles)
- Price alerts are polling-based (checked every ~30 min)
- Historical data availability varies by product age
- Some marketplace coverage is limited (SA, NL newer)

## Pricing via APIbase
- Price history (full, 90 days): $0.008/req via x402
- Price history (full, 1 year): $0.015/req via x402
- Price check (quick): $0.005/req via x402
- Deals search: $0.008/req via x402
- Product compare (2-5 items): $0.015/req via x402
- Product search: $0.010/req via x402
- Best sellers: $0.005/req via x402
- Price alert setup: $0.003/req via x402
- Free tier: 20 price checks/month
```

---

## 6. Publication

### APIbase.pro Catalog Entry

```
URL: apibase.pro/catalog/ecommerce/keepa/
──────────────────────────────────────────────────────────────
Provider:       Keepa
Website:        keepa.com
Category:       E-commerce / Price Intelligence
Subcategories:  Price History, Deals, Price Tracking, Product Comparison

Status:         Active ✅
MCP Tools:      7 tools (price-history, price-check, price-deals,
                price-compare, price-search, price-bestsellers, price-alert)
Formats:        MCP Tool Definition, OpenAPI 3.1, A2A Agent Card

Pricing:
  Price history:     $0.008 per request via x402
  Price check:       $0.005 per request via x402
  Product compare:   $0.015 per request via x402

Authentication:  OAuth 2.1 via APIbase (agent registration required)
Coverage:        3+ billion Amazon products, 14 marketplaces
Data:            Price history (years), BSR, deals, ratings, seller counts
Unique:          Data NOT available through Amazon's own API
```

### GitHub Public Entry

```
github.com/apibase-pro/apibase/apis/ecommerce/keepa/
│
├── README.md
│   # Keepa — Amazon Price Intelligence API
│   Track prices, find deals, and make smart purchase decisions
│   with data from 3+ billion Amazon products across 14 marketplaces.
│   Includes price history, BSR tracking, and deal alerts —
│   data that's NOT available through Amazon's own API.
│
│   ## Available Tools
│   - price-history: Full price history with percentile analysis
│   - price-check: Quick "is this a good price?" recommendation
│   - price-deals: Current deals and discounts (30%+ off)
│   - price-compare: Side-by-side comparison of 2-5 products
│   - price-search: Find products by price, rating, discount
│   - price-bestsellers: Amazon Best Sellers by category
│   - price-alert: Set price drop notifications
│
│   ## Unique Value
│   Data unavailable elsewhere: full price history, BSR trends,
│   Buy Box history, out-of-stock tracking, price percentiles.
│
│   ## Quick Start
│   POST apibase.pro/api/v1/discover {"query": "amazon price history"}
│
├── capabilities.json
│   {
│     "provider": "keepa",
│     "category": "ecommerce",
│     "subcategory": "price-intelligence",
│     "tools_count": 7,
│     "read_auth_required": false,
│     "trade_auth_required": false,
│     "x402_enabled": true,
│     "x402_upstream": false,
│     "products_tracked": "3B+",
│     "marketplaces": 14,
│     "data_unique": true,
│     "price_history": true,
│     "bsr_tracking": true
│   }
│
└── examples.md
    # Examples
    ## Price history
    POST /api/v1/prices/history {"product": "AirPods Pro", "period_days": 90}

    ## Quick price check
    POST /api/v1/prices/check {"product": "B0D1XD1ZV3"}

    ## Current deals
    POST /api/v1/prices/deals {"category": "Electronics", "min_discount_pct": 30}

    ## Compare products
    POST /api/v1/prices/compare {"products": ["AirPods Pro", "Sony WF-1000XM5"]}
```

**Not published on GitHub:** Keepa API key, token allocation logic, cache TTLs, price recommendation algorithm, ASIN resolution database, multi-marketplace routing.

---

## 7. Traffic Flow Diagram

### Price Check (cached — high margin)

```
AI Agent                    APIbase.pro                     Keepa
    │                           │                               │
    │── price-check ───────────→│                               │
    │   product="AirPods Pro"   │                               │
    │   Authorization: Bearer...│                               │
    │                           │── Verify agent (OAuth 2.1) ──→│ (internal)
    │                           │── Resolve "AirPods Pro" ─────→│ (internal)
    │                           │   Cache hit! ASIN=B0D1XD1ZV3  │
    │                           │                               │
    │                           │── Check price cache ──────────→│ (internal)
    │                           │   Cache HIT (queried 8 min ago)│
    │                           │                               │
    │                           │   [No upstream call!]          │
    │                           │   [Serve from cache]           │
    │                           │   [Margin: 100%]              │
    │                           │                               │
    │                           │   [compute recommendation]    │
    │                           │   [charge x402: $0.005]       │
    │                           │                               │
    │←── 200 OK ────────────────│                               │
    │   {                       │                               │
    │     product: "AirPods Pro"│                               │
    │     current: $179,        │                               │
    │     avg_30d: $185,        │                               │
    │     recommendation:       │                               │
    │       "good_price"        │                               │
    │   }                       │                               │
```

### Price History (cache miss — upstream call)

```
AI Agent                    APIbase.pro                     Keepa
    │                           │                               │
    │── price-history ─────────→│                               │
    │   product="PlayStation 5" │                               │
    │   period_days=365         │                               │
    │                           │── Resolve ASIN ──────────────→│ (internal)
    │                           │   "PlayStation 5" →            │
    │                           │   B0CL61F39H (cache hit)      │
    │                           │                               │
    │                           │── Check cache: MISS ──────────│
    │                           │                               │
    │                           │── GET /product ──────────────→│
    │                           │   ?asin=B0CL61F39H            │ api.keepa.com
    │                           │   &domain=1&history=1          │
    │                           │   &days=365&stats=90           │
    │                           │   &key=KEEPA_API_KEY           │
    │                           │←── 200 OK ────────────────────│
    │                           │   {products: [{csv: [...],     │
    │                           │     stats: {...}}]}            │
    │                           │                               │
    │                           │   [parse CSV → JSON]          │
    │                           │   [compute percentiles]       │
    │                           │   [generate recommendation]   │
    │                           │   [cache result: 60 min TTL]  │
    │                           │   [tokens used: 2]            │
    │                           │   [upstream cost: $0.00368]   │
    │                           │   [charge x402: $0.015]       │
    │                           │   [margin: $0.01132 = 75.5%]  │
    │                           │                               │
    │←── 200 OK ────────────────│                               │
    │   {                       │                               │
    │     product: "PS5",       │                               │
    │     current: $449,        │                               │
    │     stats_90d: {          │                               │
    │       avg: $465,          │                               │
    │       min: $399 (Nov 29), │                               │
    │       max: $499           │                               │
    │     },                    │                               │
    │     recommendation:       │                               │
    │       "fair_price",       │                               │
    │     seasonal: "Drops ~$50 │                               │
    │       on Black Friday and │                               │
    │       Prime Day"          │                               │
    │   }                       │                               │
```

### Product Comparison (multi-ASIN — revenue multiplier)

```
AI Agent                    APIbase.pro                     Keepa
    │                           │                               │
    │── price-compare ─────────→│                               │
    │   products=["AirPods Pro",│                               │
    │    "Sony WF-1000XM5",     │                               │
    │    "Samsung Galaxy Buds3"]│                               │
    │                           │── Resolve 3 ASINs ───────────→│ (internal)
    │                           │── Check cache per ASIN ──────→│ (internal)
    │                           │   AirPods: cache HIT          │
    │                           │   Sony: cache MISS             │
    │                           │   Samsung: cache MISS          │
    │                           │                               │
    │                           │── GET /product ──────────────→│
    │                           │   ?asin=B0XYZ,B0ABC            │ 2 upstream calls
    │                           │   (batch 2 ASINs)              │ (AirPods cached)
    │                           │←── 200 OK ────────────────────│
    │                           │                               │
    │                           │   [merge cached + fresh data] │
    │                           │   [compute comparison table]  │
    │                           │   [tokens used: 4]            │
    │                           │   [upstream cost: $0.00736]   │
    │                           │   [charge x402: $0.015]       │
    │                           │   [margin: $0.00764 = 50.9%]  │
    │                           │                               │
    │←── 200 OK ────────────────│                               │
    │   {                       │                               │
    │     comparison: [         │                               │
    │       {name: "AirPods Pro"│                               │
    │        price: $179,       │                               │
    │        rating: 4.7,       │                               │
    │        value: "best_deal"}│                               │
    │       {name: "Sony...",   │                               │
    │        price: $228,       │                               │
    │        rating: 4.5,       │                               │
    │        value: "premium"}  │                               │
    │       {name: "Samsung...",│                               │
    │        price: $179,       │                               │
    │        rating: 4.3,       │                               │
    │        value: "good"}     │                               │
    │     ],                    │                               │
    │     recommendation:       │                               │
    │       "AirPods Pro offers │                               │
    │        best value: same   │                               │
    │        price as Samsung   │                               │
    │        but higher rating" │                               │
    │   }                       │                               │
```

---

## 8. Monetization Model

| Revenue Stream | Mechanism | Expected per Month |
|---------------|-----------|-------------------|
| **Price history** | $0.008–0.015/req via x402 (tokens: 2) | $100–1,000 |
| **Price check (quick)** | $0.005/req via x402 (tokens: 1) | $50–500 |
| **Deals search** | $0.008/req via x402 (tokens: 1) | $30–300 |
| **Product compare** | $0.015/req via x402 (tokens: 2-10) | $30–300 |
| **Product search** | $0.010/req via x402 (tokens: variable) | $30–300 |
| **Best sellers** | $0.005/req via x402 (tokens: 1) | $20–200 |
| **Price alerts** | $0.003/req setup via x402 | $10–100 |

### Cost Structure

| Cost Item | Monthly | Notes |
|-----------|---------|-------|
| Keepa Individual plan | €49 ($53) | 20 tokens/min, 28,800/day |
| Keepa Professional (at scale) | €459 ($497) | 250 tokens/min |
| **Total upstream cost** | **$53–497** | Based on volume |
| **Expected revenue** | **$270–2,700** | |
| **Net margin** | **$217–2,203** | **51–90%** |

### Token Economics

```
Unit economics (per Keepa token):
──────────────────────────────────────────────────────────────

Individual plan (€49/month):
  Cost per token: $53 / 28,800 tokens/day / 30 days = $0.0000614
  But realistic daily usage = ~5,000 tokens/day:
  Cost per token: $53 / (5,000 × 30) = $0.000353

  Price history (2 tokens): upstream $0.000706 → charge $0.008 → margin 91%
  Price check (1 token):    upstream $0.000353 → charge $0.005 → margin 93%

Professional plan (€459/month):
  At 50K tokens/day usage:
  Cost per token: $497 / (50,000 × 30) = $0.000331

  Similar margins but 10x capacity

Cache effect:
  Popular ASINs (AirPods, PS5, iPhone): 20-50x cache multiplier
  → 1 upstream call serves 20-50 agents
  → Effective cost per served request: $0.000015-0.000035
  → Margin: 99%+ on cached popular products

Break-even:
  Individual plan: $53/month ÷ $0.008 avg price = 6,625 req/month
  = ~221 req/day (vs 28,800 token capacity = 0.8% utilization)
  → VERY low break-even threshold
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
| UC-008 | Ticketmaster | x402 fees + affiliate | $200–2.2K | $0 | ~100% |
| **UC-009** | **Keepa** | **Price intel subscription arbitrage** | **$270–2.7K** | **$53–497** | **51–90%** |

**Key insight:** UC-009 — первый UC с **derived intelligence** (вычисленные аналитические данные). Все предыдущие UC передают upstream данные с нормализацией/обогащением. UC-009 ВЫЧИСЛЯЕТ рекомендации ("good price?", percentiles, seasonal patterns) из raw data — это **compute value-add**, не просто pass-through.

---

## 9. Lessons Learned

### What works well about this integration

1. **Unique, defensible data.** Keepa's price history за годы недоступна через Amazon PA-API или любой другой public API. Это **data monopoly** — ни один конкурент не может предложить "покажи историю цен AirPods за год". APIbase с Keepa = единственный путь для агентов получить эту информацию.

2. **Compute value-add (не pass-through).** В отличие от UC-001..008, где APIbase нормализует/обогащает upstream данные, UC-009 **вычисляет** рекомендации: percentile analysis, seasonal patterns, good/bad price determination. Это создаёт ценность, которой нет в raw Keepa data.

3. **Very low break-even.** При €49/мес upstream и $0.008/req average price, break-even = 6,625 запросов/месяц (~221/день). Это менее 1% от capacity. Даже при минимальном трафике APIbase profitable.

4. **ASIN-level caching = high multiplier.** Popular products (AirPods, PS5, iPhone) будут запрашиваться десятками агентов. 1 upstream call → 20-50 cached responses. На popular ASINs margin = 99%.

5. **Strategic positioning vs BigTech.** OpenAI (ChatGPT Checkout) и Google (UCP) захватывают transactional layer. Keepa/APIbase владеет **intelligence layer** — complementary, не competitive. Агент может use ChatGPT для покупки + APIbase для ценового анализа.

### Challenges identified

1. **Amazon-only coverage.** Keepa отслеживает только Amazon. Для eBay, Walmart, AliExpress нужны другие провайдеры. Это ограничивает utility для агентов вне Amazon ecosystem.

2. **No product images/descriptions.** Keepa хранит только pricing data. Для полного product card нужен дополнительный source (Amazon PA-API, web scraping). APIbase отдаёт title + price + stats, но не визуальные данные.

3. **Token costs increase with features.** Product + history = 2 tokens. Product + history + offers = 3+ tokens. Complex queries eat token budget faster. Need careful token management at scale.

4. **Keepa ToS verification needed.** Коммерческое использование subscription API не запрещено явно, но нет и явного разрешения на resale. Нужно верифицировать с Keepa напрямую перед production launch.

5. **Seasonal demand volatility.** Шопинг-запросы пикуют в Nov-Dec (Black Friday, Christmas) и Jul (Prime Day). Остальное время — lower demand. Revenue будет cyclical.

### Pattern: P9 — Price History Oracle (Subscription Intel per Query)

```
Паттерн: Price History Oracle (Subscription Intel per Query)
──────────────────────────────────────────────────────────
Условия применения:
  • Upstream = subscription service (€49-4,499/мес)
  • Данные = derived intelligence (не raw content)
  • Данные частично кэшируемы (по product ID/ASIN)
  • No affiliate — pure data service
  • Высокая ценность per query ("should I buy?")

Стратегия APIbase:
  1. Купить subscription (€49/мес minimum)
  2. Обернуть raw data в computed recommendations
  3. Кэшировать по product ID (ASIN) с 15-60 min TTL
  4. Продавать per-query через x402 ($0.005-0.015/req)
  5. Маржа = subscription amortization + cache multiplier

Отличие от P6 (Subscription Arbitrage + Prefetch):
  P6: Кэширует pre-fetched CONTENT (news headlines)
  P9: Кэширует computed INTELLIGENCE (price analysis)
  P6: Prefetch predictable categories
  P9: Cache on-demand by product ID (reactive, not proactive)
  P6: Value = content delivery
  P9: Value = computed recommendation ("buy now" / "wait")

Отличие от P7 (Premium Quality Proxy):
  P7: Pass-through + markup (translation = same text, different language)
  P9: Raw data → computed insight (CSV → "good_price" recommendation)
  P7: No caching possible
  P9: ASIN-level caching possible (high multiplier on popular products)

Применимо к:
  • Keepa (Amazon price intelligence)
  • Потенциально: SimilarWeb (website traffic analytics)
  • Потенциально: SEMrush (SEO intelligence)
  • Потенциально: Crunchbase (company intelligence)
  • Любой subscription data provider с per-entity queryable data
```

### Unique aspects of UC-009 vs previous use cases

| Aspect | UC-001 | UC-002 | UC-003 | UC-004 | UC-005 | UC-006 | UC-007 | UC-008 | **UC-009** |
|--------|--------|--------|--------|--------|--------|--------|--------|--------|---------|
| Category | Crypto | Travel | Food | Finance | Weather | News | Translation | Events | **E-commerce** |
| Type | Data | Data+booking | Data+ordering | Data | Data | Data | Transform | Data+commerce | **Intelligence** |
| Upstream cost | $0 | $0 | ~$200 | $129–329 | $0–190 | $449 | $55–505 | $0 | **$53–497** |
| Revenue streams | 1 | 1 | 2 | 1 | 1 | 1 | 1 | 2 | **1** |
| Billing unit | Per req | Per booking | Per action | Per req | Per req | Per req | Per char | Per req+ticket | **Per query** |
| Cacheable | Medium | Low | Low | Medium | Very High | High | No | Very High | **High (per ASIN)** |
| Margin | ~100% | ~100% | 60–96% | 52–91% | 73–95% | 31–90% | 37.5% | ~100% | **51–90%** |
| Value-add type | Normalize | Deeplink | Routing | Bridge | Auto-geo | Enrichment | Quality | Price intel | **Compute** |
| Data uniqueness | Exclusive | Shared | Mixed | Shared | Shared | Shared | Shared | Shared | **Exclusive** |
| Revenue/interaction | $0.0005 | $4.40 | $50 CPA | $0.002 | $0.002 | $0.01 | $0.04-0.20 | $0.003+$0.60 | **$0.005-0.015** |
| Cross-UC synergy | Low | Medium | Low | Low | High | Very High | Maximum | Very High | **Medium** |
| MCP tools | 8 | 7 | 6 | 9 | 7 | 5 | 6 | 7 | **7** |
| BigTech competition | No | No | Yes | No | No | No | Yes (LLMs) | Yes (Google) | **No (unique data)** |
