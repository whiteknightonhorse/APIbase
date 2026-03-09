# 04 — Category Strategy

Стратегия покрытия API-категорий для APIbase.
Приоритизация на основе частоты запросов AI-агентов и бизнес-потенциала.

---

## Текущее покрытие (8 UC)

```
                    APIbase Category Coverage Map
    ┌─────────────────────────────────────────────────────┐
    │                                                     │
    │   ✅ COVERED (8 categories)                         │
    │                                                     │
    │   UC-001 Predictions    UC-005 Weather               │
    │   UC-002 Travel         UC-006 News                  │
    │   UC-003 Food           UC-007 Translation           │
    │   UC-004 Crypto         UC-008 Events                │
    │                                                     │
    │   ☐ CANDIDATES (priority order)                     │
    │                                                     │
    │   1. E-commerce / Shopping                          │
    │   2. Movies / TV / Streaming                        │
    │   3. Maps / Navigation                              │
    │   4. Health / Fitness                               │
    │   5. Real Estate                                    │
    │   6. Jobs / Recruiting                              │
    │   7. Payments / Banking                             │
    │   8. Social Media                                   │
    │   9. Email / Communication                          │
    │  10. Education                                      │
    │  11. Legal / Documents                              │
    │  12. IoT / Smart Home                               │
    │                                                     │
    └─────────────────────────────────────────────────────┘
```

---

## "Holy Trinity" of Agent Queries

Самые частые запросы AI-агентов (покрыты UC-004, UC-005, UC-006):

```
1. 📊 "Какой курс биткоина?"    → UC-004 CoinGecko     (Crypto)
2. 🌤️ "Какая погода в Москве?"   → UC-005 OpenWeatherMap (Weather)
3. 📰 "Что нового в мире?"       → UC-006 NewsAPI        (News)

Эти три категории покрывают ~50% информационных запросов агентов.
Были закрыты в UC-004, UC-005, UC-006 последовательно.
```

---

## Типология категорий

### По типу данных

| Тип | Описание | UC |
|-----|----------|-----|
| **Data Retrieval** | Получить данные (read-only) | UC-001, 004, 005, 006 |
| **Data + Booking** | Данные + бронирование/покупка | UC-002, 008 |
| **Data + Ordering** | Данные + заказ/доставка | UC-003 |
| **Content Transform** | Изменение контента | UC-007 |
| **Content Generation** | Создание нового контента | ☐ (кандидат) |
| **Action Execution** | Выполнение действий (send email, pay) | ☐ (кандидат) |

### По частоте запросов

| Частота | Категории |
|---------|-----------|
| **Ежедневно** | Weather, News, Crypto, Translation |
| **Несколько раз в неделю** | Travel, Food, Events, Shopping |
| **Еженедельно** | Movies/TV, Maps, Health |
| **Иногда** | Predictions, Real Estate, Jobs, Legal |

### По коммерческому intent

| Intent | Описание | UC |
|--------|----------|-----|
| **Transactional** | Пользователь хочет КУПИТЬ | UC-002 (flights), UC-003 (food), UC-008 (tickets) |
| **Informational** | Пользователь хочет УЗНАТЬ | UC-001, 004, 005, 006 |
| **Transformational** | Пользователь хочет ИЗМЕНИТЬ | UC-007 (translate) |

---

## Матрица приоритетов следующих категорий

| # | Category | Agent Demand | Revenue Potential | New Pattern? | Synergy | Priority |
|---|----------|-------------|-------------------|-------------|---------|----------|
| 1 | **E-commerce** | Very High | Very High (affiliate) | Product Search + Purchase | UC-003, 007 | **HIGH** |
| 2 | **Movies/TV** | High | Medium (subscription) | Content Rec + Streaming avail. | UC-007, 008 | **HIGH** |
| 3 | **Maps/Navigation** | High | Medium (utility) | Geo Utility Layer | UC-002, 003, 005, 008 | **HIGH** |
| 4 | **Health/Fitness** | Medium | Medium | Wellness tracking | UC-005 | MEDIUM |
| 5 | **Real Estate** | Medium | High (per-listing) | Property marketplace | UC-002, 005 | MEDIUM |
| 6 | **Jobs** | Medium | High (per-lead) | HR marketplace | UC-007 | MEDIUM |
| 7 | **Payments** | High | Low (utility) | Transaction layer | All UCs | MEDIUM |
| 8 | **Social Media** | Medium | Low | Analytics | UC-006 | LOW |
| 9 | **Email** | Medium | Low (privacy) | Communication | UC-007 | LOW |
| 10 | **Education** | Low | Low | Courses/learning | UC-007 | LOW |

---

## Candidate Analysis: Top-3 Next Categories

### 1. E-commerce / Shopping (рекомендация: UC-009)

```
Почему:
  • "Найди мне X за Y цену" — один из самых частых запросов
  • Amazon Product API + Associates program = dual revenue (как P8)
  • Huge affiliate commissions (Amazon: 1-10%, eBay: 1-4%)
  • Transactional intent = high conversion

Кандидаты:
  • Amazon Product Advertising API — 350M+ products, Associates program
  • eBay Browse API — global marketplace
  • Google Shopping — price comparison
  • AliExpress API — budget shopping
  • Best Buy API — electronics

Potential pattern: Marketplace Aggregator (compare prices across platforms)
Synergy: UC-007 (translate product descriptions), UC-003 (delivery)
```

### 2. Movies / TV / Streaming (рекомендация: UC-010)

```
Почему:
  • "Что посмотреть?" — ежедневный запрос
  • TMDB: 1.3M movies, 218K shows, watch providers (Netflix, HBO, etc.)
  • $149/mo commercial license — Subscription Arbitrage (P6 variation)
  • Watch provider data = "Is it on Netflix?" — very high agent utility

Кандидаты:
  • TMDB — community-curated, best coverage
  • OMDb — lighter, poster-focused
  • Trakt.tv — watch tracking
  • JustWatch — streaming availability (no API)

Potential pattern: Recommendation Engine Proxy (trending + personalized)
Synergy: UC-007 (translate reviews), UC-008 (movie screenings/events)
```

### 3. Maps / Navigation (рекомендация: UC-011)

```
Почему:
  • Geolocation = utility layer для ВСЕХ UC (как translation)
  • Directions, POI search, distance matrix
  • Cross-UC enabler: events + directions, restaurants + maps

Кандидаты:
  • Mapbox — generous free tier (100K req/mo), good docs
  • HERE — 250K req/mo free, routing + geocoding
  • Google Maps Platform — $200/mo credit, best coverage
  • OpenStreetMap/Nominatim — free, open data

Potential pattern: Geo Utility Layer (cross-UC enrichment, like translation)
Synergy: ALL UCs (location-based enrichment)
```

---

## Диверсификация портфолио

### По модели монетизации

```
Текущий баланс:

$0 upstream (3 UC):      UC-001, UC-002, UC-008
Low upstream (2 UC):     UC-004 ($129), UC-005 ($0-190)
Medium upstream (1 UC):  UC-003 (~$200)
High upstream (2 UC):    UC-006 ($449), UC-007 ($55-505)

Рекомендация: следующий UC — с НОВОЙ моделью upstream
  Например: usage-based с volume discounts (AWS-style)
```

### По billing unit

```
Текущие billing units:

Per request:     UC-001, 002, 004, 005, 006, 008
Per character:   UC-007
Per action:      UC-003
Per ticket:      UC-008 (affiliate)

Кандидаты для новых billing units:
  Per image/file:  Image generation, document processing
  Per minute:      Audio/video transcription
  Per listing:     Real estate, job postings
  Per search:      E-commerce product search
```

### По caching strategy

```
Текущие стратегии:

No cache:          UC-007 (translation — each unique)
Low cache:         UC-002, 003 (booking/ordering — dynamic)
Medium cache:      UC-001, 004 (30s TTL — fast-changing data)
High cache:        UC-005 (2min TTL — weather stable short-term)
Prefetch:          UC-006 (active prefetch from quota)
Feed sync:         UC-008 (bulk feed, hourly)

Кандидат для нового: Permanent cache
  E.g., movie metadata (name, year, cast) — never changes
  Cache indefinitely → margin approaches 100% over time
```

---

## Revenue Target по категориям

```
Combined monthly revenue target (8 UC):

UC-001 Polymarket:       $100–1,000
UC-002 Aviasales:        $200–2,000
UC-003 Food Delivery:    $500–5,000
UC-004 CoinGecko:        $370–3,700
UC-005 OpenWeatherMap:   $370–3,700
UC-006 NewsAPI:          $655–6,500
UC-007 DeepL:            $335–3,350
UC-008 Ticketmaster:     $200–2,200
─────────────────────────────────────
TOTAL:                   $2,730–27,450/month

At 20 UC target:         $7,000–70,000/month (estimated)
At 50 UC target:         $15,000–150,000/month (estimated)
```

---

## Стратегические приоритеты

```
Phase 1 (done): "Holy Trinity" + Foundation
  ✅ UC-001..003: Predictions, Travel, Food (foundation)
  ✅ UC-004..006: Crypto, Weather, News (holy trinity)
  ✅ UC-007..008: Translation, Events (value-add)

Phase 2 (next): Commerce + Entertainment
  ☐ E-commerce / Shopping (high revenue, affiliate)
  ☐ Movies / TV (high demand, daily usage)
  ☐ Maps / Navigation (utility layer, cross-UC)

Phase 3 (future): Verticalize
  ☐ Health / Fitness (growing market)
  ☐ Real Estate (high ticket)
  ☐ Jobs / Recruiting (B2B)
  ☐ Payments (transaction layer)

Phase 4 (horizon): AI-native
  ☐ Image generation (DALL-E, Midjourney proxy)
  ☐ Audio/Video (Whisper, ElevenLabs)
  ☐ Code execution (sandboxed environments)
  ☐ Agent-to-Agent communication (A2A hub)
```
