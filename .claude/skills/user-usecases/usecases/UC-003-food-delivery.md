# UC-003: Food Delivery (MealMe + DoorDash + Yandex Eda)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-003 |
| **Provider** | MealMe (US/CA), DoorDash (US), Yandex Eda (RU/CIS) |
| **Category** | Food Delivery / Groceries |
| **Date Added** | 2026-03-07 |
| **Status** | Reference |
| **Client** | FoodAgent Inc. (агрегатор доставки еды) |

---

## 1. Проблема: у еды нет единого API

В отличие от авиабилетов (Aviasales = единый API для всех авиакомпаний) или предсказательных рынков (Polymarket = один API), в food delivery **нет единого consumer-facing API**. Каждый крупный сервис предоставляет API только для ресторанов-партнёров.

### Ландшафт food delivery API (реальность рынка)

| Сервис | Consumer API? | Что есть | Affiliate |
|--------|--------------|----------|-----------|
| **Yandex Eda** | Нет | Vendor API (для ресторанов) | 700₽/новый пользователь (только юрлица) |
| **Samokat** | Нет | Нет вообще | Нет |
| **Delivery Club** | Мертв | Слит с Yandex Eda в 2022 | — |
| **Glovo** | Нет | Partner API (для ресторанов) | Influencer-программа |
| **Wolt** | Нет | Vendor API + Wolt Drive | TradeDoubler affiliate (~4.4%) |
| **DoorDash** | Частично | Drive API (доставка-как-сервис) | **$50 CPA** через Impact |
| **Uber Eats** | Нет | Vendor API (нужно одобрение) | $5–10/новый пользователь |
| **Grubhub** | Нет | POS API (для ресторанов) | $5/новый клиент |
| **MealMe** | **Да!** | Поиск, меню, заказ, курьер | Enterprise pricing |

**Вывод:** единственный реальный consumer-facing API — **MealMe** (агрегатор 1M+ ресторанов и магазинов в US/Canada). Это и есть наш основной провайдер для категории Food.

### Стратегия APIbase: multi-provider

```
Регион          Провайдер         Тип интеграции
──────────────────────────────────────────────────────────
US / Canada     MealMe API        Полный (поиск + меню + заказ)
US              DoorDash Drive    Доставка-как-сервис
EU              Wolt affiliate    Affiliate ссылки + TradeDoubler
RU / CIS        Yandex Eda        Affiliate ссылки (юрлицо)
Global          Uber Eats         Affiliate (после одобрения)
Global          Grubhub           Affiliate ($5 CPA)
```

---

## 2. Client Input Data

Клиент **FoodAgent Inc.** предоставил APIbase:

```
Провайдер         Данные                               Статус
──────────────────────────────────────────────────────────────
MealMe            API Key: meal_sk_a1b2c3d4e5f6...     Active
                  Plan: Startup tier

DoorDash          developer_id: d1e2f3...              Active
                  key_id: k4l5m6...
                  signing_secret: s7e8c9...
                  Affiliate ID (Impact): aff_dd_789

Yandex Eda        Affiliate Partner ID: ye_partner_456  Active
                  (требуется юрлицо клиента)

Wolt              TradeDoubler Publisher ID: td_112233   Active
```

### Sufficiency Assessment

| Provider | Data | Enables | Sufficient? |
|----------|------|---------|-------------|
| MealMe API Key | Full API access | Search restaurants, menus, place orders, track delivery | **Yes — полный цикл** |
| DoorDash credentials | Drive API + Affiliate | Request deliveries + $50 CPA per new user | **Yes** |
| Yandex Eda affiliate | Referral links | 700₽ per first order (Russia only) | **Yes (ограниченно)** |
| Wolt TradeDoubler ID | Affiliate links | ~4.4% commission (Europe) | **Yes (ограниченно)** |

**Verdict:** MealMe API Key — основной инструмент. Остальные — региональные affiliate-дополнения. Вместе покрывают US, EU, RU.

---

## 3. Provider API Analysis

### 3.1 MealMe API (Primary — US/Canada)

**Что это:** Единственный consumer-facing агрегатор food delivery API. 1M+ ресторанов и магазинов. Агрегирует DoorDash, Uber Eats, Grubhub, Postmates и 100K+ ресторанов с собственной доставкой.

**Base URL:** `https://api.mealme.ai`

**Auth:** API Key в заголовке `Id-Token: YOUR_API_KEY`

#### Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/restaurants/search` | POST | Поиск ресторанов по локации, кухне, запросу |
| `/restaurants/search` (items) | POST | Поиск конкретных блюд (пицца, суши и т.д.) |
| `/restaurants/details` | GET | Полное меню ресторана, цены, время доставки |
| `/groceries/search` | POST | Поиск продуктовых магазинов и товаров |
| `/groceries/details` | GET | Инвентарь магазина, цены, доставка |
| `/order` | POST | Оформление заказа (delivery / pickup) |
| `/courier/quote` | POST | Получение стоимости доставки курьером |
| `/courier/order` | POST | Заказ курьерской доставки |
| `/places/search` | GET | Геокодинг: поиск адреса |
| `/places/checkout` | POST | Завершение транзакции |
| `/location` | GET | Geocoding / reverse geocoding |

#### Coverage
- 1M+ ресторанов и магазинов
- 120M+ товаров (продукты)
- US и Canada
- Real-time цены и наличие
- Агрегирует: DoorDash, Uber Eats, Grubhub, Postmates + прямые рестораны

### 3.2 DoorDash Drive API (Delivery-as-a-Service — US)

**Base URL:** `https://openapi.doordash.com`

**Auth:** JWT с кастомным заголовком `dd-ver: DD-JWT-V1`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/drive/v2/deliveries` | POST | Создать доставку |
| `/drive/v2/deliveries/{id}` | GET | Статус доставки |

**Pricing:** $9.75 base (до 5 миль) + $0.75/миля сверх. Скидка $2.75 при включении чаевых.

**Sandbox:** Полноценная тестовая среда + Delivery Simulator.

### 3.3 Yandex Eda Affiliate (Russia/CIS)

**Модель:** Affiliate ссылки через программу Яндекс.Еда.
- 700₽ (~$7-8) за первый заказ нового пользователя
- Только для юрлиц / ИП
- Виджеты, ссылки, QR-коды для размещения
- Регистрация через Яндекс.Дистрибуцию

### 3.4 Wolt Affiliate (Europe/Asia)

**Модель:** TradeDoubler affiliate network.
- ~4.4% комиссия от среднего заказа (~$45)
- ~$0.018 за клик
- 25 стран (Европа + Азия)
- 70K+ merchant partners

---

## 4. APIbase Wrapper Design

### Level 1: Protocol Adapter

```
Что делает:
──────────────────────────────────────────────────────────────
• Multi-provider routing по геолокации:
  User location in US/CA → MealMe API (полный функционал)
  User location in EU     → Wolt affiliate links
  User location in RU     → Yandex Eda affiliate links
  Delivery request (US)   → DoorDash Drive API

• Единый endpoint:
  apibase.pro/api/v1/food/...

• Geo-detection:
  Agent передаёт координаты/город пользователя
  APIbase автоматически маршрутизирует на правильного провайдера

• Caching strategy:
  Restaurant search: 5 min TTL (меню меняются нечасто)
  Prices: 2 min TTL (цены и доступность меняются)
  Grocery inventory: 1 min TTL (наличие товаров volatile)
  Delivery quotes: no cache (always real-time)
```

### Level 2: Semantic Normalizer

**Domain model: `food-delivery`**

```json
// === MealMe оригинал (restaurant search) ===
{
  "restaurants": [{
    "name": "Sushi Nakazawa",
    "address": "23 Commerce St, New York, NY",
    "latitude": 40.7331,
    "longitude": -74.0045,
    "cuisines": ["Japanese", "Sushi"],
    "rating": 4.8,
    "delivery_fee": 2.99,
    "delivery_time_min": 25,
    "delivery_time_max": 40,
    "minimum_order": 15.00,
    "is_open": true
  }]
}

// === APIbase normalized (food-delivery schema) ===
{
  "provider": "mealme",
  "region": "US",
  "type": "restaurant_search",
  "results": [{
    "restaurant_id": "apibase_food_mealme_12345",
    "name": "Sushi Nakazawa",
    "address": "23 Commerce St, New York, NY 10014",
    "location": {"lat": 40.7331, "lng": -74.0045},
    "cuisines": ["Japanese", "Sushi"],
    "rating": 4.8,
    "rating_count": 342,
    "delivery": {
      "fee_usd": 2.99,
      "time_min": 25,
      "time_max": 40,
      "minimum_order_usd": 15.00
    },
    "is_open": true,
    "menu_url": "https://apibase.pro/api/v1/food/menu/apibase_food_mealme_12345",
    "order_url": "https://apibase.pro/api/v1/food/order"
  }]
}
```

**Domain model: `grocery-delivery`**

```json
// === APIbase normalized (grocery-delivery schema) ===
{
  "provider": "mealme",
  "region": "US",
  "type": "grocery_search",
  "results": [{
    "store_id": "apibase_groc_mealme_67890",
    "name": "Whole Foods Market",
    "address": "4 Union Square S, New York, NY",
    "delivery": {
      "fee_usd": 3.99,
      "time_min": 30,
      "time_max": 60
    },
    "products_available": 12500,
    "categories": ["organic", "produce", "dairy", "meat", "bakery"],
    "search_url": "https://apibase.pro/api/v1/food/grocery/search?store=apibase_groc_mealme_67890"
  }]
}
```

**Fallback для регионов без MealMe API:**

```json
// Для EU/RU — affiliate-based response
{
  "provider": "wolt",
  "region": "EU",
  "type": "affiliate_redirect",
  "message": "Direct ordering API not available in this region. Redirecting to Wolt.",
  "results": [{
    "service": "Wolt",
    "action": "redirect",
    "url": "https://wolt.com/en/discovery?ref=apibase_td_112233",
    "coverage": "25 countries in Europe and Asia",
    "avg_delivery_time": "30 min"
  }],
  "alternatives": [
    {"service": "Yandex Eda", "region": "RU/CIS", "url": "https://eda.yandex.ru/?ref=ye_partner_456"},
    {"service": "Glovo", "region": "EU/LATAM", "url": "https://glovoapp.com/..."}
  ]
}
```

### Level 3: Affiliate/Commission Injector

```
US/CA (MealMe — full API):
──────────────────────────────────────────────────────────────
1. Agent searches restaurants → MealMe API call
2. Agent places order → MealMe handles fulfillment
3. MealMe charges per API usage (enterprise pricing)
4. APIbase charges agent per request (x402)

US (DoorDash — delivery):
──────────────────────────────────────────────────────────────
1. Agent requests delivery → DoorDash Drive API
2. DoorDash charges $9.75/delivery
3. New user referred → $50 CPA to client via Impact
4. APIbase charges agent per delivery request (x402)

EU (Wolt — affiliate):
──────────────────────────────────────────────────────────────
1. Agent generates Wolt link with TradeDoubler publisher ID
2. User clicks → Wolt sets cookie → user orders
3. Client earns ~4.4% commission via TradeDoubler
4. Revenue share: client 70% / APIbase 30%

RU (Yandex Eda — affiliate):
──────────────────────────────────────────────────────────────
1. Agent generates Yandex Eda referral link
2. New user makes first order → 700₽ credited to client
3. Revenue share: client 70% / APIbase 30%
```

---

## 5. MCP Tool Definitions

### Tool: food-restaurant-search

```json
{
  "name": "food-restaurant-search",
  "description": "Search for restaurants near a location. Find restaurants by cuisine, dish name, rating, or delivery time. Returns restaurant details, delivery fees, and estimated delivery time. Currently full-featured in US/Canada; affiliate links for EU and Russia.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "location": {
        "type": "object",
        "properties": {
          "address": {"type": "string", "description": "Street address or city name"},
          "lat": {"type": "number", "description": "Latitude (if known)"},
          "lng": {"type": "number", "description": "Longitude (if known)"}
        },
        "description": "User's delivery location (address OR lat/lng required)"
      },
      "query": {
        "type": "string",
        "description": "Search query: cuisine type, dish name, or restaurant name (e.g., 'sushi', 'pizza margherita', 'McDonald\\'s')"
      },
      "cuisine": {
        "type": "string",
        "enum": ["american", "chinese", "italian", "japanese", "mexican", "indian", "thai", "korean", "mediterranean", "fast_food", "healthy", "vegan", "dessert"],
        "description": "Filter by cuisine type"
      },
      "sort_by": {
        "type": "string",
        "enum": ["relevance", "rating", "delivery_time", "delivery_fee", "distance", "price_low"],
        "default": "relevance"
      },
      "max_delivery_fee": {
        "type": "number",
        "description": "Maximum delivery fee in USD"
      },
      "open_now": {
        "type": "boolean",
        "default": true,
        "description": "Only show currently open restaurants"
      },
      "limit": {
        "type": "integer",
        "default": 10,
        "maximum": 50
      }
    },
    "required": ["location"]
  }
}
```

### Tool: food-menu

```json
{
  "name": "food-menu",
  "description": "Get the full menu of a restaurant including item names, descriptions, prices, and customization options. Use after food-restaurant-search to browse a specific restaurant's offerings.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "restaurant_id": {
        "type": "string",
        "description": "Restaurant ID from food-restaurant-search results"
      },
      "category": {
        "type": "string",
        "description": "Filter by menu category (e.g., 'appetizers', 'main', 'desserts', 'drinks')"
      },
      "dietary": {
        "type": "string",
        "enum": ["vegetarian", "vegan", "gluten_free", "halal", "kosher"],
        "description": "Filter by dietary restriction"
      }
    },
    "required": ["restaurant_id"]
  }
}
```

### Tool: food-place-order

```json
{
  "name": "food-place-order",
  "description": "Place a food delivery order. Requires user confirmation before executing. Returns order ID, estimated delivery time, and tracking link. Available in US/Canada via MealMe. For other regions, returns a redirect URL to the delivery service.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "restaurant_id": {
        "type": "string",
        "description": "Restaurant ID"
      },
      "items": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "item_id": {"type": "string"},
            "quantity": {"type": "integer", "minimum": 1},
            "customizations": {
              "type": "array",
              "items": {"type": "string"},
              "description": "Item customizations (e.g., 'no onions', 'extra cheese')"
            }
          },
          "required": ["item_id", "quantity"]
        },
        "description": "Items to order"
      },
      "delivery_address": {
        "type": "string",
        "description": "Full delivery address"
      },
      "tip_usd": {
        "type": "number",
        "default": 0,
        "description": "Tip for the driver in USD"
      },
      "notes": {
        "type": "string",
        "description": "Special instructions (e.g., 'ring doorbell', 'leave at door')"
      }
    },
    "required": ["restaurant_id", "items", "delivery_address"]
  }
}
```

### Tool: food-grocery-search

```json
{
  "name": "food-grocery-search",
  "description": "Search for grocery stores and products near a location. Find specific products across multiple stores. Compare prices and availability. Currently available in US/Canada.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "location": {
        "type": "object",
        "properties": {
          "address": {"type": "string"},
          "lat": {"type": "number"},
          "lng": {"type": "number"}
        }
      },
      "query": {
        "type": "string",
        "description": "Product or store name (e.g., 'organic milk', 'avocados', 'Whole Foods')"
      },
      "store_type": {
        "type": "string",
        "enum": ["grocery", "convenience", "pharmacy", "specialty"],
        "description": "Type of store"
      },
      "sort_by": {
        "type": "string",
        "enum": ["relevance", "price_low", "delivery_time", "distance"],
        "default": "relevance"
      },
      "limit": {
        "type": "integer",
        "default": 10,
        "maximum": 50
      }
    },
    "required": ["location"]
  }
}
```

### Tool: food-delivery-quote

```json
{
  "name": "food-delivery-quote",
  "description": "Get a delivery cost estimate for an order. Returns fee, estimated time, and available delivery options.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "restaurant_id": {
        "type": "string",
        "description": "Restaurant or store ID"
      },
      "delivery_address": {
        "type": "string",
        "description": "Delivery address"
      },
      "order_total_usd": {
        "type": "number",
        "description": "Estimated order total for accurate fee calculation"
      }
    },
    "required": ["restaurant_id", "delivery_address"]
  }
}
```

### Tool: food-order-track

```json
{
  "name": "food-order-track",
  "description": "Track an active food delivery order. Returns current status, courier location, and estimated arrival time.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "order_id": {
        "type": "string",
        "description": "Order ID from food-place-order result"
      }
    },
    "required": ["order_id"]
  }
}
```

---

## 6. AI Instructions

```markdown
# Food Delivery API via APIbase — AI Agent Instructions

## When to Use
- User wants to order food delivery
- User asks "what restaurants are nearby?"
- User wants to order groceries / products from a store
- User sends a photo of their fridge and asks to order missing items
- User wants to compare delivery prices or times
- User asks for restaurant recommendations

## Key Concepts
- Full ordering (search → menu → order → track) available in US/Canada via MealMe
- In EU: Wolt affiliate links (user completes order on Wolt)
- In Russia/CIS: Yandex Eda affiliate links
- APIbase auto-detects region from user's location and routes accordingly
- Grocery delivery is supported (Whole Foods, convenience stores, etc.)
- All prices include delivery fees unless noted

## Regional Availability

| Feature | US/Canada | Europe | Russia/CIS |
|---------|-----------|--------|------------|
| Restaurant search | Full API | Affiliate redirect | Affiliate redirect |
| Menu browsing | Full API | Not available | Not available |
| Order placement | Full API | Redirect to Wolt | Redirect to Yandex Eda |
| Grocery search | Full API | Not available | Not available |
| Order tracking | Full API | Not available | Not available |
| Delivery quote | Full API | Not available | Not available |

## Recommended Call Chains

### "Order me a pizza" (US/Canada)
1. Get user location (ask or use known address)
2. `food-restaurant-search` (location, query="pizza")
3. Present top 3 options with prices and delivery times
4. User picks restaurant
5. `food-menu` (restaurant_id, category="pizza")
6. Present menu items
7. User selects items
8. `food-delivery-quote` (restaurant_id, address, total)
9. Confirm total with user: food + delivery fee + tip
10. `food-place-order` (restaurant_id, items, address)
11. `food-order-track` (order_id) — periodic updates

### "Order what's missing from the fridge" (photo analysis)
1. Analyze fridge photo (vision) → identify missing items
2. `food-grocery-search` (location, query=item_name) for each item
3. Find store with most items in stock + lowest total
4. Present cart with prices
5. User confirms
6. `food-place-order` with grocery items

### "Find cheap sushi near me" (EU — affiliate fallback)
1. Detect location → EU region
2. Return Wolt affiliate link with search pre-filled
3. "I found sushi restaurants near you on Wolt. [Click here to order](wolt_link)"

## Response Formatting
- Show delivery fee separately: "$15.99 + $2.99 delivery"
- Include estimated time: "Arrives in 25-40 min"
- For ratings: "4.8/5 (342 reviews)"
- Always confirm before placing order: "Your order: ... Total: $23.47. Shall I place it?"
- For unavailable regions: "Direct ordering isn't available in your area yet. Here's a link to [Wolt/Yandex Eda]"

## Limitations
- Full ordering API: US/Canada only (MealMe coverage)
- EU and Russia: affiliate links only (redirect to delivery app)
- Menu items may be unavailable despite showing in search
- Delivery times are estimates and may vary
- Some restaurants have minimum order amounts
- Grocery availability is real-time but can change quickly
- Payment is processed by the delivery service, not by APIbase

## Pricing via APIbase
- Restaurant search: $0.002 per search (x402)
- Menu fetch: $0.001 per request (x402)
- Order placement: $0.01 per order (x402)
- Grocery search: $0.002 per search (x402)
- Delivery quote: $0.001 per request (x402)
- Order tracking: Free (included with order)
- Affiliate redirects (EU/RU): Free
```

---

## 7. Traffic Flow Diagram

### Full Order Flow (US/Canada — MealMe)

```
AI Agent                  APIbase                     MealMe API           Restaurant
    │                         │                           │                    │
    │── food-restaurant- ────→│                           │                    │
    │   search (NYC, sushi)   │── POST /restaurants/ ────→│                    │
    │                         │   search                  │                    │
    │←── 5 restaurants ───────│←── results ───────────────│                    │
    │                         │                           │                    │
    │── food-menu ───────────→│                           │                    │
    │   restaurant_id=123     │── GET /restaurants/ ─────→│                    │
    │                         │   details?id=123          │                    │
    │←── full menu ───────────│←── menu JSON ─────────────│                    │
    │                         │                           │                    │
    │   [agent presents       │                           │                    │
    │    options to user]     │                           │                    │
    │   User: "2x Dragon      │                           │                    │
    │    Roll + Miso Soup"    │                           │                    │
    │                         │                           │                    │
    │── food-delivery-quote ─→│                           │                    │
    │   address=...           │── POST /courier/quote ───→│                    │
    │←── $2.99, 30-40 min ───│←── quote ─────────────────│                    │
    │                         │                           │                    │
    │   [agent confirms with  │                           │                    │
    │    user: "$23.47 total  │                           │                    │
    │    delivered in ~35min  │                           │                    │
    │    Confirm?"]           │                           │                    │
    │   User: "Yes"           │                           │                    │
    │                         │                           │                    │
    │── food-place-order ────→│                           │                    │
    │   items + address       │── POST /order ───────────→│── order ──────────→│
    │                         │   Id-Token: meal_sk_...   │                    │
    │←── order_id: ORD-789 ──│←── {order_id, ETA} ───────│                    │
    │                         │   [charge x402: $0.01]    │                    │
    │                         │                           │                    │
    │   "Order placed!        │                           │                    │
    │    Tracking: ..."       │                           │                    │
    │                         │                           │                    │
    │── food-order-track ────→│                           │                    │
    │   order_id=ORD-789      │── GET order status ──────→│                    │
    │←── "Driver picked up, ──│←── status ────────────────│                    │
    │     ETA 12 min"         │                           │                    │
```

### Affiliate Redirect Flow (EU — Wolt)

```
AI Agent                  APIbase                    User Browser            Wolt
    │                         │                          │                    │
    │── food-restaurant- ────→│                          │                    │
    │   search (Berlin, pizza)│                          │                    │
    │                         │── Detect region: EU      │                    │
    │                         │── Generate affiliate URL │                    │
    │                         │                          │                    │
    │←── {                    │                          │                    │
    │     type: "redirect",   │                          │                    │
    │     service: "Wolt",    │                          │                    │
    │     url: "wolt.com/..   │                          │                    │
    │       ?ref=td_112233"   │                          │                    │
    │   }                     │                          │                    │
    │                         │                          │                    │
    │   Agent to user:        │                          │                    │
    │   "Here are pizza       │                          │                    │
    │    options on Wolt:     │                          │                    │
    │    [Order on Wolt]"     │                          │                    │
    │                         │          User clicks ───→│── opens Wolt ─────→│
    │                         │                          │   ref=td_112233    │
    │                         │                          │                    │
    │                         │                          │   User orders ────→│
    │                         │                          │   €25.00           │
    │                         │                          │                    │
    │                         │   TradeDoubler credits:  │                    │
    │                         │   Client: ~4.4% = €1.10  │                    │
    │                         │   Rev share → APIbase    │                    │
```

---

## 8. Monetization Model

| Region | Revenue Stream | Mechanism | Expected per Month |
|--------|---------------|-----------|-------------------|
| **US/CA** | API Usage Fee | $0.002/search, $0.001/menu, $0.01/order via x402 | $200–2000 |
| **US/CA** | MealMe markup | MealMe enterprise pricing pass-through | Variable |
| **US** | DoorDash CPA | $50 per new DoorDash user via Impact | $500–5000 (high value!) |
| **EU** | Wolt affiliate | ~4.4% commission via TradeDoubler | $100–1000 |
| **RU** | Yandex Eda affiliate | 700₽ (~$7) per new user first order | $50–500 |
| **US** | Uber Eats affiliate | $5–10 per new user | $100–1000 |
| **US** | Grubhub affiliate | $5 per new customer | $50–500 |

**Revenue comparison across all UCs:**

| Metric | UC-001 Polymarket | UC-002 Aviasales | UC-003 Food Delivery |
|--------|-------------------|------------------|---------------------|
| Primary revenue | API Usage | Affiliate (~1.1%) | **Mixed: API + CPA + Affiliate** |
| Highest single payout | $0.001/req | ~$4.40/booking | **$50/new DoorDash user** |
| Recurring revenue | Per-request | Per-booking | Per-order + per-search |
| Geographic coverage | Global | Global | **Multi-region strategy** |

---

## 9. Lessons Learned

### Key insight: Food delivery is fragmented — APIbase adds massive value

1. **No unified API exists.** Unlike travel (Aviasales) or predictions (Polymarket), food delivery has NO single consumer API. Each service has only vendor-facing APIs. This is **exactly the problem APIbase solves** — the N×M problem from the spec.

2. **MealMe is the breakthrough.** The only consumer-facing aggregator API. 1M+ restaurants via one key. But US/Canada only. This creates a clear regional strategy.

3. **Multi-provider = multi-monetization.** This is the first UC where APIbase uses **multiple providers per category**: MealMe for API + DoorDash for CPA + Wolt/Yandex for affiliate. This pattern maximizes revenue.

4. **CPA is king.** DoorDash's $50 CPA per new user is the highest single payout across all three UCs. If agents refer 100 new DoorDash users/month = $5,000/month from one affiliate.

5. **Graceful degradation by region.** APIbase demonstrates value even without a full API: in EU/RU it generates affiliate redirect links. Not as powerful as full ordering, but still monetizable. As MealMe or others expand globally, the upgrade is seamless.

6. **Fridge photo use case = killer feature.** The "photo of fridge → order missing items" scenario from the original spec requires: vision AI (agent-side) + grocery search API (MealMe) + order placement. APIbase enables the last two.

### Pattern: Multi-Provider Regional Strategy

```
Category → Provider Selection Logic:
──────────────────────────────────────────────────────────────
1. Check user's region (geo from IP or address)
2. Route to full-API provider if available (MealMe for US)
3. Fallback to affiliate provider for other regions (Wolt EU, Yandex RU)
4. Stack CPA programs on top (DoorDash $50 CPA for new users)
5. Always log for analytics: which regions need full API coverage
```

This pattern applies to any category where no global API exists: **food delivery, ride-hailing, local services, healthcare**.
