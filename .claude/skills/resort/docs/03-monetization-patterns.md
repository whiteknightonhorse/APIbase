# 03 — Monetization Patterns Library

Библиотека всех монетизационных паттернов, открытых при создании UC-001..UC-021.
Каждый паттерн — уникальная стратегия извлечения дохода из upstream API.

---

## Обзор паттернов

| # | Pattern | UC | Upstream Cost | Margin | Revenue Source |
|---|---------|-----|--------------|--------|----------------|
| P1 | Builder Key Proxy | UC-001 | $0 | ~100% | x402 fees |
| P2 | Affiliate RevShare | UC-002 | $0 | ~100% | Affiliate % + x402 |
| P3 | Multi-Provider Router | UC-003 | ~$200 | 60–96% | CPA + x402 |
| P4 | x402 Upstream Bridge | UC-004 | $129–329 | 52–91% | x402 spread |
| P5 | Pay-per-call + Cache Multiplier | UC-005 | $0–190 | 73–95% | x402 + cache |
| P6 | Subscription Arbitrage + Prefetch | UC-006 | $449 | 31–90% | x402 + prefetch |
| P7 | Premium Quality Proxy | UC-007 | $55–505 | 37.5% fixed | Per-char markup |
| P8 | Transactional Affiliate API | UC-008 | $0 | ~100% | x402 + affiliate/ticket |
| P9 | Price History Oracle | UC-009 | $53–497 | 51–90% | x402 per-query intel |
| P10 | Permanent Cache + Downstream CPA | UC-010 | $0 | ~100% → ∞ | x402 + streaming CPA |
| P11 | Gov Data Fusion + Health Commerce | UC-011 | $0 | ~100% | x402 + health affiliate |
| P12 | Location Intelligence Cache + Cross-UC | UC-012 | $0–299 + infra | 50–94% | x402 + cross-UC enrichment |
| P13 | Property Intelligence + Lifecycle Affiliate | UC-013 | $199–449 | 33–97% | x402 + RE lifecycle CPA |
| P14 | Sports Intelligence + Betting Affiliate CPA | UC-014 | $88 | 92–99%+ | x402 + sportsbook CPA/RevShare |
| P15 | Salary Intelligence + Career Funnel Affiliate | UC-015 | $0 | ~100% | x402 + job CPC + career services |
| P16 | Financial Intelligence Fusion + Currency Enrichment + Fintech Affiliate | UC-016 | $0 | ~100% | x402 + cross-UC currency enrichment + fintech affiliate (Wise GBP 10-50/ref) |
| P17 | Education Intelligence Funnel + Course Affiliate | UC-017 | $0 | 96–98.5% | x402 + Coursera affiliate 15-45% + cross-UC education enrichment |
| P18 | Federated Open Data Intelligence | UC-018 | ~$355 | 4–87% | x402 + streaming affiliate + cross-UC entertainment |
| P19 | Supply Chain Intelligence Layer | UC-019 | $100–900 | 87–94% | x402 + Shippo affiliate ($5-150/ref) + label markup + cross-UC enrichment |
| P20 | DEX Builder/Broker Integration | UC-020 | ~$0 (100 ASTER one-time) | ~100% | x402 + builder fee/trade + referral 5-10% + stacked revenue |
| P20+ | Multi-DEX Builder Strategy | UC-021 | ~$0 (100 USDC) | ~100% | Builder codes 100% to builder + referral 10% + vaults 10% profits + cross-DEX arb |

---

## P1: Builder Key Proxy

**UC:** UC-001 Polymarket
**Суть:** API провайдера полностью бесплатный (open/free tier). APIbase оборачивает и продаёт доступ через x402.

```
Условия:
  • Upstream API бесплатный (open source, free tier, builder program)
  • Нет ограничений на commercial use
  • Данные кэшируемы (medium TTL)

Механика:
  Agent → x402 $0.002/req → APIbase → FREE → Provider

Margin: ~100% (upstream = $0)
Scaling: Linear — больше агентов = больше дохода
Risk: Low — нет fixed costs
Break-even: 0 requests (прибыль с первого запроса)

Применимо к:
  • Open APIs (government, open data)
  • Builder/developer programs
  • APIs с generous free tier

Примеры: Polymarket, HackerNews, Reddit, Wikipedia
```

---

## P2: Affiliate RevShare

**UC:** UC-002 Aviasales / Travelpayouts
**Суть:** API бесплатный, основной доход через affiliate commission с продаж.

```
Условия:
  • Провайдер имеет affiliate программу
  • Высокий % комиссии (20-50%)
  • Commerce intent в запросах (пользователь хочет купить)

Механика:
  Agent → x402 $0.002/req → APIbase → FREE → Provider
  User → click affiliate link → buy → Provider → 40% → APIbase

Revenue split: x402 fees (minor) + affiliate commissions (major)
Margin: ~100% (both streams = pure profit)
Risk: Depends on conversion rate
Break-even: 0 fixed costs

Отличие от P8 (Transactional Affiliate):
  P2: Affiliate = основной доход, APIbase строит deeplinks
  P8: Affiliate = upside, URL'ы auto-injected провайдером

Примеры: Aviasales/Travelpayouts, Booking.com, Amazon Associates
```

---

## P3: Multi-Provider Router

**UC:** UC-003 Food Delivery
**Суть:** APIbase агрегирует несколько провайдеров в одну категорию, routing по рынку/цене.

```
Условия:
  • Категория фрагментирована (разные лидеры в разных рынках)
  • Ни один провайдер не покрывает 100% рынка
  • Комплексная auth модель (разные API у каждого)

Механика:
  Agent → APIbase → [Router] → Provider A (US)
                              → Provider B (EU)
                              → Provider C (Asia)

Revenue: CPA (commission per action) + x402 fees
Margin: 60–96% (varies by provider)
Risk: High complexity — нужно поддерживать N интеграций
Break-even: Medium — need >$200 revenue to cover upstreams

Уникальное преимущество:
  Агент вызывает ОДИН API — APIbase маршрутизирует к лучшему провайдеру
  по региону, цене, доступности. Агент не знает о routing.

Примеры: Food Delivery (MealMe + DoorDash + Wolt + YE),
         потенциально: Payments (Stripe + PayPal + Crypto)
```

---

## P4: x402 Upstream Bridge

**UC:** UC-004 CoinGecko
**Суть:** Upstream провайдер сам поддерживает x402. APIbase — bridge между agent x402 и provider x402.

```
Условия:
  • Провайдер имеет x402 endpoint ($0.01/req USDC)
  • Также доступен traditional API key ($129/mo)
  • Dual upstream: key (основной) + x402 (overflow)

Механика:
  Normal load:   Agent → x402 $0.005 → APIbase → API Key → Provider
  High load:     Agent → x402 $0.015 → APIbase → x402 $0.01 → Provider
  Free upstream:  Agent → x402 $0.003 → APIbase → FREE → GeckoTerminal

Revenue: x402 spread (downstream price - upstream cost)
Margin: 52–91% (depends on upstream routing)
Risk: Medium — fixed upstream cost ($129/mo)

Sub-pattern: Free Upstream Bonus
  Провайдер имеет бесплатный sub-API (GeckoTerminal).
  APIbase маршрутизирует подходящие запросы на бесплатный endpoint.
  Margin на эти запросы: 100%.

Sub-pattern: API Plan Arbitrage
  Покупить monthly plan → resell per-call → margin grows with volume.
  $129/mo @ 500K calls = $0.000258/call upstream.
  Charge $0.005/call → 95% margin at full utilization.

Примеры: CoinGecko (x402 + Pro plan + GeckoTerminal),
         потенциально: любой x402-enabled provider
```

---

## P5: Pay-per-call + Cache Multiplier

**UC:** UC-005 OpenWeatherMap
**Суть:** Upstream биллит pay-per-call ($0). APIbase кэширует и многократно продаёт один ответ.

```
Условия:
  • Upstream = pay-per-call (не subscription)
  • Данные кэшируемы (weather: 2 min TTL)
  • Популярные запросы повторяются (100 агентов → "Moscow weather")
  • $0 startup cost

Механика:
  Request 1:  Agent → x402 $0.003 → APIbase → $0.0015 → OWM → cache
  Request 2-100: Agent → x402 $0.003 → APIbase → serve from cache ($0)

  1 upstream call → 100 downstream sales
  Cost: $0.0015 | Revenue: $0.300 | Margin: 99.5%

Revenue: x402 fees, amplified by cache hit ratio
Margin: 73–95% (depends on hit ratio)
Risk: Very low — $0 fixed cost, pay only for actual usage

Key metric: Cache Multiplier Ratio
  Popular city (Moscow, NY, London): 50-100x
  Medium city (Lyon, Osaka): 5-20x
  Rare location (lat/lon coordinates): 1-2x

  Average weighted multiplier: ~20x

Sub-pattern: Auto-Enrichment
  APIbase добавляет ценность бесплатно:
  "Moscow" → geocode → lat/lon (cached 30 days) → weather call
  Агент не знает о geocoding — получает weather by city name.

Примеры: OpenWeatherMap, любой API с repetitive queries + pay-per-call
```

---

## P6: Subscription Arbitrage + Prefetch

**UC:** UC-006 NewsAPI.org
**Суть:** Покупить фиксированную подписку → активно prefetch → serve из кэша → маржа растёт нелинейно.

```
Условия:
  • Upstream = monthly subscription (fixed cost)
  • Подписка включает N requests/month (quota)
  • Данные подходят для prefetch (популярные категории предсказуемы)
  • Маржа растёт с количеством агентов (нелинейно)

Механика:
  Fixed: $449/mo subscription (250K req quota)
  Prefetch: top-5 countries × 4 categories × 288/day = 172,800 req/month
  Remaining quota: 77,200 req for on-demand searches

  Revenue at scale (100K agent sessions):
    Headlines (from cache): $0.005 × 70K = $350 (100% margin)
    Searches (upstream):    $0.01  × 30K = $300 (90% margin)
    Total: $650/month → $449 cost → $201 profit (31% margin)

  Revenue at high scale (1M sessions):
    $6,500 revenue → $449 cost → $6,051 profit (93% margin)

Revenue: x402 fees, fixed cost amortized
Margin: 31–93% (scales exponentially with volume)
Risk: High initial — need ~35K req/month to break even
Break-even: ~35K requests (~$449/$0.013 avg price)

Key metric: Prefetch Efficiency
  How much of the quota is used for proactive caching
  vs reactive on-demand queries.

  Ideal: 70% prefetch (serve from cache) + 30% on-demand

Примеры: NewsAPI ($449/mo), Google Maps Platform ($200/mo credit),
         любой API с fixed monthly quota + predictable demand
```

---

## P7: Premium Quality Proxy

**UC:** UC-007 DeepL
**Суть:** Обернуть #1 quality провайдер с фиксированным markup. Кэширование невозможно.

```
Условия:
  • Провайдер = лучший по measurable quality (BLEU, accuracy, etc.)
  • Quality = основной differentiator (не цена)
  • Данные НЕ кэшируемы (каждый запрос уникален)
  • Per-unit upstream billing (per character, per pixel, etc.)

Механика:
  Agent → x402 $0.040/1K chars → APIbase → $0.025/1K chars → DeepL
  Margin per unit: $0.015/1K chars (37.5% fixed)

  No caching possible → every request = upstream call
  Margin is FIXED → scale through volume, not efficiency

Revenue: Per-unit markup (pass-through)
Margin: 37.5% fixed (cannot improve)
Risk: Medium — proportional to volume
Break-even: 1 request (profitable from first unit)

Unique characteristics:
  • Margin doesn't grow with scale (unlike P5, P6)
  • But revenue PER INTERACTION is highest ($0.20/article vs $0.01/news)
  • First "content transformation" UC (not data retrieval)
  • Cross-cutting utility — enhances ALL other UCs

Примеры: DeepL (translation), потенциально: premium AI APIs,
         Bloomberg/Reuters data, premium image generation
```

---

## P8: Transactional Affiliate API

**UC:** UC-008 Ticketmaster
**Суть:** Бесплатный API + встроенная affiliate программа. Два параллельных revenue streams.

```
Условия:
  • Upstream API полностью бесплатный
  • Built-in affiliate program с auto-injection URL
  • API responses содержат commerce URLs (ссылки на покупку)
  • High-intent queries (пользователь хочет купить)

Механика:
  Stream 1 (API fees): Agent → x402 $0.003/req → APIbase → FREE → TM
  Stream 2 (Affiliate): User → click ticket URL → buy → TM → $0.30 → APIbase

  Both streams = pure profit ($0 upstream cost)

Revenue: x402 fees (predictable) + affiliate commissions (upside)
Margin: ~100% (no upstream cost)
Risk: Very low — no fixed costs, dual revenue
Break-even: 0 requests

Sub-pattern: Discovery Feed Prefetch
  Провайдер предоставляет bulk feed (unlimited, hourly updates).
  APIbase синхронизирует feed → cache → serve 100% из кэша.
  В отличие от P6, feed = отдельный unlimited endpoint, не из квоты.

Отличие от P2 (Affiliate RevShare):
  P2: APIbase конструирует affiliate deeplinks вручную
  P8: Провайдер auto-injects affiliate tracking в URLs
  P2: Affiliate = основной доход
  P8: Affiliate = дополнительный stream, x402 fees = основной

Примеры: Ticketmaster (events), потенциально: Amazon (products),
         Booking.com (hotels), Etsy (handmade)
```

---

## P9: Price History Oracle (Subscription Intel per Query)

**UC:** UC-009 Keepa
**Суть:** Subscription data provider → compute derived intelligence → resell per-query. Value = computation, не pass-through.

```
Условия:
  • Upstream = subscription service (€49-4,499/мес)
  • Данные = derived intelligence (не raw content)
  • Данные частично кэшируемы (по entity ID — ASIN, ticker, domain)
  • No affiliate — pure data/analytics service
  • APIbase ВЫЧИСЛЯЕТ рекомендации из raw data

Механика:
  Agent → x402 $0.005-0.015/req → APIbase [compute] → tokens → Keepa

  Keepa returns: CSV arrays (timestamp, price_in_cents)
  APIbase computes: percentiles, recommendations, seasonal patterns
  Agent receives: "good_price — below 25th percentile, $6 below 30-day avg"

Revenue: Per-query x402 fees
Margin: 51-90% (subscription amortization + ASIN cache multiplier)
Risk: Medium — subscription cost €49-459/mo
Break-even: ~6,625 req/month at €49 plan (221/day = <1% capacity)

Отличие от P6 (Subscription Arbitrage):
  P6: Кэширует pre-fetched CONTENT (news headlines)
  P9: Кэширует computed INTELLIGENCE (price analysis per ASIN)
  P6: Prefetch predictable categories (proactive)
  P9: Cache on-demand by entity ID (reactive)

Отличие от P7 (Premium Quality Proxy):
  P7: Pass-through + markup (same data, different format)
  P9: Raw data → computed insight (CSV → recommendation)
  P7: No caching possible
  P9: Entity-level caching (high multiplier on popular ASINs)

Примеры: Keepa (Amazon price intelligence),
         потенциально: SimilarWeb (web traffic analytics),
         SEMrush (SEO intelligence), Crunchbase (company data)
```

---

## P10: Permanent Cache + Downstream CPA

**UC:** UC-010 TMDB
**Суть:** Upstream бесплатный, данные **permanently cacheable** (movie metadata не меняется). Кэш растёт бесконечно → маржа стремится к 100%. Дополнительный revenue через streaming affiliate CPA.

```
Условия:
  • Upstream API бесплатный (free tier / community project)
  • Данные = permanent metadata (не меняется после релиза)
  • Кэш валиден вечно (title, year, cast, plot не меняются)
  • Downstream commerce opportunity (streaming signups)
  • Smart aggregation: 1 APIbase call = N upstream calls

Механика:
  Month 1:   Agent → x402 $0.005 → APIbase → TMDB (cache miss ~30%)
  Month 6:   Agent → x402 $0.005 → APIbase → cache (hit ~85%)
  Month 12:  Agent → x402 $0.005 → APIbase → cache (hit ~95%)
  Year 2+:   Agent → x402 $0.005 → APIbase → cache (hit ~98-99%)

  Streaming CPA: User → "Watch on Prime" → Amazon Associates → $2-3/signup

Revenue: x402 fees (growing margin) + streaming CPA (bonus)
Margin: ~100% at start ($0 upstream) → approaching infinity with cache
Risk: Very low — $0 fixed cost, $0 upstream, cache accumulates forever
Break-even: 0 requests (profitable from first request)

Отличие от P1 (Builder Key Proxy):
  P1: Кэш с TTL (данные обновляются) — margin стабильный
  P10: Кэш PERMANENT — margin РАСТЁТ со временем
  P1: Нет commerce opportunity
  P10: Streaming CPA = downstream commerce

Отличие от P5 (Cache Multiplier):
  P5: Cache TTL = минуты/часы, нужно обновлять
  P10: Cache TTL = ∞, данные вечны
  P5: Cache hit ratio стабильный (~20x)
  P10: Cache hit ratio РАСТЁТ каждый месяц (70% → 95% → 99%)

Sub-pattern: Smart Aggregation
  1 APIbase call = 4 TMDB calls (details + credits + providers + similar)
  Agent платит за 1 req, upstream = 4 req, но upstream бесплатный
  Aggregation → лучший AX для агента

Sub-pattern: Mood-Based Discovery
  APIbase добавляет "mood presets" поверх TMDB Discover:
  "date_night" → romance + comedy + rating>7 + after 2010
  "mind_bending" → thriller + sci-fi + rating>7.5
  Zero upstream cost for preset logic

Примеры: TMDB (movies/TV), потенциально: Wikipedia (knowledge),
         OpenStreetMap (maps), MusicBrainz (music metadata)
```

---

## P15: Salary Intelligence + Career Funnel Affiliate

**UC:** UC-015 BLS + O\*NET + ESCO + CareerJet
**Суть:** Quad-source government/open data fusion, $0 upstream. 100% margin на intelligence tools. **Career services funnel**: salary gap → job search (CPC affiliate) → resume writing (20-30%) → courses/certifications (15-45%) → relocation (cross-UC). B2B premium: compensation benchmarking for salary transparency compliance ($0.10/query). ~95% day-1 cache (bulk download all 3 databases).

```
Условия:
  • Upstream = 4 government/open data APIs ($0 total!)
  • BLS = US public domain (no copyright), O*NET = free (conditional),
    ESCO = EUPL 1.2 (open), CareerJet = affiliate publisher (free)
  • Bulk downloads available → ~95% cache hit rate on day 1
  • Career services funnel: job CPC + resume + courses + coaching
  • B2B compliance market: salary transparency laws (12+ US states + EU)

Механика:
  Stream 1: Agent → x402 $0.02-0.10 → APIbase → cache (BLS/ONET/ESCO) → response
  Stream 2: Job search → CareerJet → user clicks Apply → CPC $0.10-0.50 → APIbase
  Stream 3: Career funnel:
    Underpaid detected → job search → resume rewrite (TopResume $89 → 25% = $22)
    Skills gap detected → course recommendation (Coursera $49 → 30% = $15)
    New job in new city → UC-012 Maps (commute) + UC-013 Real Estate (housing)

Revenue: x402 fees (100% margin) + job CPC + career services affiliate
Margin: ~100% ($0 upstream, all from cache)
Risk: Very low — $0 fixed cost, government data permanently free
Break-even: ~2,000 req (~$50 infrastructure)

Отличие от P11 (Gov Data Fusion):
  P11: Health data → supplement affiliate (recurring, $1-2.50/order)
  P15: Career data → career services funnel (higher value, $25-67/chain)
  P11: Health vertical
  P15: Jobs vertical + B2B compliance

Отличие от P13 (Lifecycle Affiliate):
  P13: Real estate lifecycle (property → mortgage → insurance → moving)
  P15: Career lifecycle (salary gap → skills → resume → job → relocation)
  P13: Higher per-chain value ($185)
  P15: Much higher volume (everyone has a career)

Sub-pattern: Salary Transparency Compliance
  12+ US states + EU mandating salary disclosure by 2027.
  BLS percentile data = ideal benchmark source.
  B2B premium pricing ($0.10/query vs $0.02 consumer) = 5x multiplier.

Sub-pattern: Career Services Funnel
  Career intelligence naturally drives multi-stage purchases:
  1. Salary lookup → motivation (underpaid)
  2. Skills gap → course purchase (Coursera/Udemy affiliate)
  3. Resume update → resume service (TopResume affiliate)
  4. Job search → CPC clicks (CareerJet affiliate)
  5. New job → relocation → UC-012 + UC-013 cross-UC

Примеры: BLS + O*NET + ESCO + CareerJet (jobs), потенциально:
         education data + student loan affiliate,
         immigration data + visa services affiliate
```

---

## P18: Federated Open Data Intelligence

**UC:** UC-018 MusicBrainz + Discogs + ListenBrainz + AcoustID + Wikidata + RadioBrowser
**Суть:** 6 CC0/Public Domain sources federated into unified music intelligence layer. ALL streaming platform APIs (Spotify, Apple Music, Deezer, SoundCloud, Tidal, YouTube) DISQUALIFIED for proxy → open data = ONLY legal path → monopoly on ToS-compliant music intelligence for agents. Value = FEDERATION + ENTITY RESOLUTION across independent datasets. Natural affiliate via cross-reference IDs (Spotify/Apple/Amazon IDs embedded in open data). Cross-UC entertainment hub: Music (UC-018) + Events (UC-008) + Movies (UC-010) + Maps (UC-012).

```
Условия:
  • Upstream = 6 CC0/PD sources (~$155/mo data + $200/mo infra)
  • MusicBrainz CC0 (50M+ rec), Discogs CC0 dumps (16M+ rel),
    ListenBrainz CC0 (recommendations), Wikidata CC0 (knowledge),
    AcoustID CC-BY-SA (fingerprinting), RadioBrowser PD (40K stations)
  • ALL streaming APIs DISQUALIFIED (Spotify, Apple, Deezer, etc.)
  • Self-hostable: full DB dumps + Live Data Feed
  • Affiliate via external ID mapping (open data contains Spotify/Apple IDs)

Механика:
  Stream 1: Agent → x402 $0.002-0.008 → APIbase → federated cache → response
  Stream 2: Streaming affiliate via cross-reference IDs:
    MusicBrainz/Wikidata contain Spotify/Apple/Amazon external IDs
    Agent shows user "Listen on Spotify" → user signs up → $7.35 CPA
  Stream 3: Cross-UC entertainment graph:
    UC-008 Ticketmaster: artist → upcoming concerts → ticket sales
    UC-010 TMDB: artist → film soundtracks → movie discovery
    UC-012 Maps: venue/studio locations
    UC-009 E-commerce: vinyl/merch → Amazon affiliate

Revenue: x402 fees + streaming affiliate + cross-UC entertainment
Margin: 4% Phase 1 → 87% Phase 3 (volume-dependent)
Risk: Low — CC0 data permanent, self-hostable
Break-even: Month 1 (~55K req/mo)

Отличие от P1 (Builder Key Proxy):
  P1: Single source, simple proxy, convenience value
  P18: 6 sources FEDERATED, entity resolution = compound value

Отличие от P10 (Permanent Cache / TMDB):
  P10: Cache ONE proprietary API permanently
  P18: Federate SIX open sources into unified graph
  P10: Dependent on single upstream
  P18: Self-hostable, immune to shutdowns

Отличие от P8 (Transactional Affiliate / Ticketmaster):
  P8: Free API + auto-injected affiliate URLs by provider
  P18: CC0 data + CONSTRUCTED affiliate via cross-reference IDs
  P8: Provider controls affiliate
  P18: APIbase constructs affiliate from external ID mapping

Sub-pattern: Multi-Source Entity Resolution (P18a)
  Resolve single music entity across MusicBrainz, Discogs, Wikidata,
  + streaming platform IDs (Spotify, Apple, Amazon, ISRC, barcode).
  No single source has all IDs — federation = unique value.

Sub-pattern: Open Recommendation Engine (P18b)
  ListenBrainz = ONLY open-source CC0 music recommendation engine.
  Spotify-like "discover" capability without Spotify ToS.
  Genuinely differentiated: no other legal path exists.

Sub-pattern: Open Audio Intelligence (P18c)
  AcoustID + Chromaprint (MIT) = Shazam-equivalent from open source.
  Identify song → MusicBrainz metadata → full enriched response.

Sub-pattern: Cross-Domain Entertainment Graph (P18d)
  "Tell me about Radiohead" → discography (MusicBrainz) + vinyl (Discogs)
  + similar artists (ListenBrainz) + film soundtracks (UC-010 TMDB)
  + upcoming concerts (UC-008 Ticketmaster) + venue locations (UC-012 Maps)

Примеры: MusicBrainz + Discogs + ListenBrainz (music), потенциально:
         OpenStreetMap + Wikipedia federation (geography),
         any domain where proprietary APIs locked but open data exists
```

---

## P20: DEX Builder/Broker Integration

**UC:** UC-020 AsterDex (Aster)
**Суть:** Integrate with DEXes that offer formal builder/broker programs, earning STACKED revenue: builder fees per trade + referral commission + x402 micropayments. Zero upstream cost (DEX APIs are free/on-chain). Non-custodial = no asset handling liability. FIRST pattern with financial trading execution capability. Geographic restrictions require geo-fencing. Revenue: $256 → $11,045/мес at ~100% margin.

```
Условия:
  • Upstream API бесплатный (DEX = on-chain, open API)
  • Aster Code Builder Program = "express permission" for platforms
  • 100 ASTER deposit (~$200 one-time, refundable)
  • Builder fee earned on every trade routed via APIbase
  • Referral link (tlRYkq) earns 5-10% of referee's fees
  • Three revenue streams STACK on same user
  • Geographic restrictions: US, UK, CA, CN, RU excluded

Механика:
  Stream 1: Agent → x402 $0.001-0.01 → APIbase → AsterDex → response
  Stream 2: Builder fee:
    POST /fapi/v3/order with builder=APIbase_wallet
    Fee recorded per trade → claimable daily
  Stream 3: Referral commission:
    User onboarded via referral link (tlRYkq)
    5-10% of all trading fees → ongoing passive income
  Stream 4: Cross-UC enrichment:
    UC-004 CoinGecko: market context before trade
    UC-006 News: trading-relevant news alerts
    UC-016 Finance: macro context for trading

Revenue: x402 + builder fees + referral commission (STACKED)
Margin: ~100% (upstream = $0, deposit = one-time)
Risk: Medium — geo-restrictions, trading liability, wash trading controversy
Break-even: Month 1 (zero fixed costs)

Отличие от P1 (Builder Key Proxy / Polymarket):
  P1: Data-only, passive proxy, prediction queries
  P20: TRADING EXECUTION, active order placement
  P1: Single revenue (x402)
  P20: Triple-stacked revenue (x402 + builder + referral)

Отличие от P4 (x402 Bridge / CoinGecko):
  P4: Market DATA proxy, CoinGecko subscription arbitrage
  P20: DEX TRADING proxy, builder/broker program
  P4: Reads data
  P20: Executes trades

Отличие от P19 (Supply Chain / Logistics):
  P19: Physical-world actions (shipping labels)
  P20: Financial-world actions (trade execution)
  P19: Commercial aggregator partnership
  P20: On-chain builder/broker program

Sub-pattern: Stacked Revenue (P20a)
  Three independent revenue streams on same user:
  x402 for API access + builder fee per trade + referral 5-10%
  No cannibalization — each stream has different trigger.
  Uniquely high revenue density per user.

Sub-pattern: Non-Custodial Trading Proxy (P20b)
  APIbase routes trades but NEVER holds user funds.
  No custody license needed. No asset handling liability.
  User signs transactions with own wallet.
  Pure intermediary earning fees without touching assets.

Sub-pattern: Market Data as Loss Leader (P20c)
  Public data tools priced cheaply ($0.001-0.003).
  Attract trading agents → lead to order execution.
  Real revenue from builder fees + referral on trades.

Sub-pattern: Geo-Fenced Compliance (P20d)
  First pattern with built-in geographic compliance checks.
  MCP tools refuse trading for restricted jurisdictions.
  Addresses regulatory risk proactively.

Примеры: AsterDex builder program (DeFi), потенциально:
         Any DEX with builder/broker API program,
         Stripe Connect (payments platform-on-platform),
         any transactional platform with formal intermediary program
```

---

## P19: Supply Chain Intelligence Layer

**UC:** UC-019 Shippo + Geocodio + USITC HTS + GeoNames + UN Comtrade
**Суть:** Unified logistics intelligence layer from 5 providers: commercial aggregator (Shippo Platform API, white-label), permissive commercial (Geocodio, bundled resale OK), government (USITC HTS, US Public Domain), open data (GeoNames, CC-BY 4.0), international org (UN Comtrade, Premium Pro). **FIRST pattern where MCP tools trigger physical-world actions** (shipping labels = packages move). ALL direct carrier APIs (USPS, UPS, FedEx, DHL + 4 national posts) DISQUALIFIED. 20/31 candidates disqualified (record). Revenue: $790 → $15,520/мес.

```
Условия:
  • Upstream = 5 sources ($100-900/mo scaling)
  • Shippo Platform API: white-label, rate markup, $0.05/label
  • Geocodio: bundled resale explicitly OK, free tier 2.5K/day
  • USITC HTS: US Government public domain ($0)
  • GeoNames: CC-BY 4.0, 100+ countries postal codes ($0)
  • UN Comtrade: Premium Pro ~$50/mo, 200+ countries trade data
  • ALL carrier APIs DISQUALIFIED (USPS, UPS, FedEx, DHL, etc.)
  • Shippo Platform API = "aggregator-as-escape-hatch"

Механика:
  Stream 1: Agent → x402 $0.003-0.02 → APIbase → provider → response
  Stream 2: Shipping affiliate:
    Shippo referral: $5-150 per new user
    Insurance upsell: commission on add-on
    Rate markup: "10% markup of any shipping rate" (Platform API)
  Stream 3: Cross-UC enrichment:
    UC-009 E-commerce: product → shipping estimate
    UC-003 Food: delivery tracking enrichment
    UC-012 Maps: address + shipping zones
    UC-013 Real Estate: property address validation
    UC-016 Finance: customs duty in local currency

Revenue: x402 fees + Shippo affiliate + label markup + cross-UC enrichment
Margin: 87% Phase 1 → 94% Phase 3
Risk: Medium — requires Shippo partnership (but Platform API designed for this)
Break-even: Month 1

Отличие от P3 (Multi-Provider Router / Food):
  P3: Route between equivalent providers (best price/available)
  P19: Each provider covers DIFFERENT sub-domain (rates, addresses, tariffs)
  P3: All providers are interchangeable
  P19: Providers are complementary, not interchangeable

Отличие от P12 (Location Intelligence / Maps):
  P12: Geographic/spatial data (routes, POIs, geocoding)
  P19: Logistics-specific (shipping rates, tracking, customs)
  P12: Read-only spatial queries
  P19: ACTION-triggering (create shipping labels, buy insurance)

Отличие от P11 (Gov Data Fusion / Health):
  P11: Government data only, fused into health intelligence
  P19: Government + commercial + open data fused into logistics
  P11: Read-only (nutrition lookup)
  P19: Transactional (shipping labels, insurance)

Sub-pattern: Logistics Aggregator Partnership (P19a)
  Partner with aggregators (Shippo) DESIGNED for intermediaries.
  Raw carrier APIs universally prohibit proxy/resale.
  Aggregator Platform API IS the redistribution license.
  Same escape hatch as Coursera affiliate in UC-017.

Sub-pattern: Compliance Data as a Service (P19b)
  Government tariff/customs data (USITC HTS) — free, unrestricted.
  Hard to access, hard to interpret for agents.
  Transform into agent-friendly queryable tools.
  Same pattern as BLS (UC-015), FRED (UC-016), Census (UC-013).

Sub-pattern: Address Intelligence Enrichment (P19c)
  Geocodio (resale OK when bundled) + GeoNames (CC-BY 4.0).
  Each address → validated + geocoded + census tract + timezone +
  congressional district + county FIPS. Far more than any single source.

Sub-pattern: Transactional Revenue via Shipping Actions (P19d)
  FIRST APIbase pattern with ACTION-triggering tools.
  Create shipping label = physical package moves.
  x402 micropayment + label cost markup + affiliate.
  Fundamentally different from information-only patterns.

Примеры: Shippo + Geocodio + USITC (logistics), потенциально:
         Any domain where aggregator API = proxy license,
         payment processing (Stripe Connect = platform-on-platform),
         any transactional API with white-label program
```

---

## P17: Education Intelligence Funnel + Course Affiliate

**UC:** UC-017 OpenAlex + College Scorecard + PubMed + arXiv + Coursera
**Суть:** 5-source open/gov data academic intelligence + Coursera affiliate (15-45% commission). BIDIRECTIONAL cross-UC с UC-015 Jobs (skills gap ↔ courses). $0 upstream. Affiliate revenue DOMINATES x402 (77% at scale). Complete learning lifecycle: skill identification → course enrollment → career outcome. Four CC0 sources (record). Revenue: $1.3K → $13.6K/мес.

```
Условия:
  • Upstream = 5 primary sources ($0 total!)
  • OpenAlex = CC0, College Scorecard = US Gov, PubMed = US Gov,
    arXiv = CC0 (metadata), Coursera = affiliate program (15-45%)
  • + 3 enrichment: CrossRef (CC0 facts), Wikidata (CC0), UNESCO UIS (open)
  • Academic data highly cacheable: papers 12-24h, institutions 7d, DOIs permanent
  • Coursera affiliate: 15-45% commission, 30-day cookie, Impact network
  • BIDIRECTIONAL cross-UC with UC-015 Jobs (unique among all UCs)

Механика:
  Stream 1: Agent → x402 $0.002-0.008 → APIbase → cache (OpenAlex+Scorecard+PubMed+arXiv) → response
  Stream 2: Coursera affiliate funnel:
    Agent recommends course → user clicks affiliate link → enrolls:
    Course ($30 avg) × 20% commission = $6/enrollment
    Specialization ($80 avg) × 45% = $36/enrollment
    Professional cert ($200 avg) × 45% = $90/enrollment (!!!)
  Stream 3: Cross-UC education enrichment:
    UC-015 Jobs: "Data Scientist skills gap" → Coursera ML courses → +$0.005
    UC-011 Health: "metformin mechanism" → PubMed evidence → +$0.002
    UC-016 Finance: "MBA ROI?" → College Scorecard earnings data → +$0.003

Revenue: x402 fees (23%) + Coursera affiliate (77%) + cross-UC enrichment
Margin: 96% → 98.5% ($0 upstream, grows with scale)
Risk: Very low — $0 fixed cost, CC0 + gov data permanently free
Break-even: Day 1 ($0 upstream)

Отличие от P11 (Gov Data Fusion):
  P11: Health data → supplement affiliate (recurring, $1-2.50/order)
  P17: Academic data → course affiliate (HIGH VALUE: $6-90/enrollment)
  P11: Standalone health vertical
  P17: BIDIRECTIONAL cross-UC with UC-015 Jobs

Отличие от P15 (Salary Intelligence):
  P15: Career lifecycle FORWARD (salary gap → job search → new job)
  P17: Career lifecycle BACKWARD (skill gap → courses → certification)
  P15: CareerJet CPC ($0.10-0.50)
  P17: Coursera affiliate 15-45% ($6-90 per enrollment!)
  P15 + P17 together = COMPLETE career development pipeline

Отличие от P16 (Financial Intelligence):
  P16: INFRASTRUCTURE layer (enriches all UCs with currency/economic data)
  P17: FUNNEL pattern (drives users from education → enrollment → career)
  P16: Fintech affiliate ($10-1000/referral)
  P17: Education affiliate ($6-90/enrollment, higher volume)

Sub-pattern: Skill-Gap-to-Course Pipeline (P17a)
  O*NET/ESCO skills → match to Coursera courses → rank by relevance/ROI.
  UC-015 ENDS at job listings. P17a EXTENDS funnel backward to education.
  This is the GLUE between UC-015 and UC-017.

Sub-pattern: Education ROI Calculator (P17b)
  College Scorecard: tuition vs median earnings at 1/3/5/10 years.
  ROI %, breakeven timeline, debt-to-earnings ratio.
  No other UC provides this. Entirely new territory.

Sub-pattern: Research Intelligence Layer (P17c)
  OpenAlex 240M works + arXiv preprints + PubMed citations + CrossRef DOIs.
  Literature discovery, citation networks, trend analysis.
  High volume from research-heavy AI agents.

Sub-pattern: Cross-UC Education Enrichment (P17d)
  Detect education opportunity in OTHER UC queries → inject course rec:
  UC-011 Health: "How does metformin work?" → PubMed + Coursera pharmacology
  UC-015 Jobs: "Data scientist skills" → courses + graduate earnings
  UC-016 Finance: "MBA ROI?" → Scorecard earnings for top MBA programs

Примеры: OpenAlex + College Scorecard + PubMed + arXiv + Coursera (education),
         потенциально: Udemy (if API returns), edX affiliate,
         professional certification APIs + training affiliate
```

---

## P16: Financial Intelligence Fusion + Currency Enrichment + Fintech Affiliate

**UC:** UC-016 fawazahmed0 + Frankfurter + FRED + World Bank + US Treasury + ECB + OpenIBAN
**Суть:** 7-source government/institutional data fusion, $0 upstream. INFRASTRUCTURE layer (как UC-012 Maps) — обогащает ALL other UCs monetary/economic context. Three revenue streams: (1) x402 micropayments, (2) cross-UC currency enrichment tax ($0.001/call invisible add-on), (3) fintech affiliate funnel (Wise GBP 10-50/conversion lifetime cookie + NerdWallet/SoFi/robo-advisors $25-1000). **Strongest ToS portfolio**: CC0 + CC-BY 4.0 + US Gov + ECB free reuse. Revenue: $1.1K → $26.4K/мес at scale.

```
Условия:
  • Upstream = 7 government/institutional/open data APIs ($0 total!)
  • fawazahmed0 = CC0 (public domain!), Frankfurter = MIT + ECB free reuse,
    FRED = free API key, World Bank = CC-BY 4.0,
    Treasury = US Gov open data, ECB = free reuse, OpenIBAN = free
  • Exchange rates: daily cache (24h). Economic: monthly/quarterly cache.
    World Bank: annual cache. fawazahmed0: entire DB < 2MB = cache ALL locally.
  • Cross-UC infrastructure: currency enrichment tax $0.001/call on ALL international UCs
  • Fintech affiliate: Wise (GBP 10-50, lifetime cookie) + savings/investing referrals

Механика:
  Stream 1: Agent → x402 $0.001-0.02 → APIbase → cache (7 sources) → response
  Stream 2: Cross-UC currency enrichment:
    UC-002 Travel: "Paris hotel EUR 250" → convert to agent's currency → +$0.001
    UC-009 E-commerce: "Amazon.de price" → EUR→USD → +$0.001
    UC-015 Jobs: "Berlin salary" → EUR→USD + cost-of-living → +$0.003
    UC-013 Real Estate: "Mortgage rate" → FRED 30Y rate auto-inject → +$0.002
    100K daily enrichment calls = $3,000/month pure profit
  Stream 3: Fintech affiliate cascade:
    Currency lookup → "Send with Wise" → GBP 10-50 CPA (lifetime cookie!)
    Economic analysis → "High-yield savings" → CIT Bank $100/referral
    Country comparison → "Invest globally" → robo-advisor $25-150
    Mortgage lookup → "Compare rates" → LendingTree $85 CPA

Revenue: x402 fees + cross-UC enrichment + fintech affiliate
Margin: 95.6% → 99.2% ($0 upstream, grows with scale)
Risk: Very low — $0 fixed cost, government data permanently free
Break-even: ~2,000 req (~$50 infrastructure)

Отличие от P11 (Gov Data Fusion):
  P11: Health data → supplement affiliate (recurring, $1-2.50/order)
  P16: Financial data → fintech affiliate (HIGH VALUE: $10-1000/referral)
  P11: Standalone health vertical
  P16: INFRASTRUCTURE enriching ALL other UCs

Отличие от P12 (Location Intelligence Cache):
  P12: Location = CONTEXT (where is something?)
  P16: Currency/financial = VALUE MULTIPLIER (what is something worth?)
  P12: Enriches UCs with spatial context
  P16: Enriches UCs with monetary/economic context
  P12 + P16 together = complete infrastructure layer for ALL UCs

Отличие от P15 (Salary Intelligence):
  P15: Career lifecycle (salary → skills → resume → job → relocation)
  P16: Financial literacy (rates → savings → investing → transfers)
  P15: Job CPC affiliate ($0.10-0.50)
  P16: Fintech affiliate ($10-1000 per conversion)

Sub-pattern: Currency Enrichment Tax
  Every UC with international data pays invisible $0.001/conversion call.
  Agent doesn't see it — APIbase adds currency context automatically.
  100K daily cross-UC calls = $3,000/month pure profit.

Sub-pattern: Economic Context Layer
  FRED mortgage rates auto-injected into UC-013 Real Estate queries.
  FRED unemployment data auto-injected into UC-015 Jobs queries.
  FRED CPI auto-injected into salary comparisons (purchasing power).
  World Bank indicators auto-injected into country comparisons.

Sub-pattern: Fintech Affiliate Cascade
  Financial intelligence naturally drives financial product signups:
  1. Currency lookup → Wise transfer (GBP 10-50, lifetime cookie)
  2. Economic analysis → high-yield savings ($100/referral)
  3. Country comparison → robo-advisor ($25-150)
  4. Mortgage rate → LendingTree ($85 CPA)
  5. National debt → gold/Bitcoin hedge (affiliate)

Примеры: fawazahmed0 + FRED + World Bank + Treasury + ECB (finance),
         потенциально: insurance rate data + comparison affiliate,
         tax data + tax software affiliate (TurboTax/H&R Block)
```

---

## P14: Sports Intelligence + Betting Affiliate CPA

**UC:** UC-014 The Odds API + API-Sports
**Суть:** Dual upstream (odds aggregator + multi-sport stats). Odds comparison across 40+ bookmakers → **betting affiliate deep links** (CPA $50-700 per new depositor + 25-40% ongoing RevShare). Value-add = computed intelligence (odds arbitrage, value bets), не raw data proxy. МАКСИМУМ cross-UC synergies (5 UC).

```
Условия:
  • Upstream = dual provider: odds ($59/мес) + scores/stats ($29/мес)
  • Low upstream ($88/мес total)
  • Odds data enables high-value affiliate (sportsbook CPA $50-700)
  • ONGOING RevShare (25-40% of net gaming revenue per referred bettor)
  • Value-add: computed odds arbitrage + cross-bookmaker comparison
  • Cross-UC synergy: 5 connections (UC-001, 005, 006, 008, 012)

Механика:
  Stream 1: Agent → x402 $0.005-0.02 → APIbase → odds+stats → enriched response
  Stream 2: User sees odds → clicks sportsbook link → deposits:
    DraftKings: $25-35 CPA + 25-40% RevShare
    FanDuel: $25-35 CPA + 35% RevShare (730 days!)
    BetMGM: $50-100 CPA + 25-35% RevShare
    Caesars: $50-150 CPA
    Bet365: up to $200 CPA + 30% RevShare
  Stream 3: Cross-UC revenue:
    UC-008 Ticketmaster: game tickets ($0.30/ticket)
    UC-001 Polymarket: shared users → prediction market activity

  1 odds query → sportsbook link → $50-700 CPA + years of RevShare

Revenue: x402 fees + sportsbook CPA + ongoing RevShare
Margin: 92-99%+ ($88/мес upstream covers с 1 conversion)
Risk: Medium — betting regulations vary by jurisdiction
Break-even: 1 sportsbook conversion/month ($100 CPA > $88 upstream)

Отличие от P2 (Affiliate RevShare):
  P2: Travel affiliate (one-shot: flight → commission %)
  P14: Betting affiliate (CPA + ONGOING RevShare 25-40%)
  P2: No odds analysis
  P14: Odds comparison as VALUE-ADD drives affiliate conversion

Отличие от P8 (Transactional Affiliate):
  P8: Auto-injected URLs, low CPA ($0.30/ticket)
  P14: Odds-driven deep links, HIGH CPA ($50-700/depositor)

Отличие от P13 (Lifecycle Affiliate):
  P13: Lifecycle chain (property → mortgage → insurance → moving)
  P14: Single conversion + RECURRING revenue (RevShare 730 days)
  P13: Higher one-time CPA ($85-500/lead)
  P14: Lower one-time BUT recurring ($50-700 CPA + $182 LTV/bettor)

Sub-pattern: Odds Arbitrage Engine
  Compare 40+ bookmaker odds for every game.
  Detect divergence → "value bet" → user clicks → higher conversion rate.
  The computation IS the value-add. Raw odds = commodity. Analysis = moat.

Sub-pattern: Prediction Market Arbitrage
  Cross-UC с UC-001 Polymarket:
  Sportsbook odds vs prediction market odds → identify mispricing.
  "DraftKings: Celtics -3.5 at -110 vs Polymarket: Celtics 62%"
  NOBODY else combines sportsbook + prediction market data for agents.

Примеры: The Odds API + API-Sports (sports), потенциально:
         casino/igaming affiliate (slot/poker APIs),
         DFS (daily fantasy sports) API + affiliate
```

---

## P13: Property Intelligence Fusion + Lifecycle Affiliate Commerce

**UC:** UC-013 RentCast + US Census ACS
**Суть:** Paid commercial API ($199-449/мес) + free government data fused. TRIPLE revenue: x402 micropayments + API affiliate (30% recurring) + **lifecycle CPA** (mortgage→insurance→moving→management). Real estate = highest CPA rates of any vertical ($50-500/lead).

```
Условия:
  • Upstream = commercial API ($199-449/мес) + free government data ($0)
  • API provider explicitly allows resale/sublicensure (RentCast)
  • API provider offers affiliate program (30% recurring)
  • High-value downstream lifecycle (mortgage, insurance, moving)
  • US-only coverage (first regional UC)

Механика:
  Stream 1: Agent → x402 $0.04-0.12 → APIbase → RentCast + Census → response
  Stream 2: Power user → RentCast direct → 30% recurring → APIbase
  Stream 3: Property query → lifecycle trigger:
    Buy intent → mortgage pre-approval lead → LendingTree → $85 CPA → APIbase
    Buy intent → home insurance quote → Policygenius → $30 CPA → APIbase
    Move intent → moving services → Moving.com → $20 CPA → APIbase
    Invest intent → property management → TurboTenant → $50 CPA → APIbase

  1 property query → up to $185 in lifecycle CPA

Revenue: x402 fees + API affiliate + lifecycle CPA
Margin: 33% on API only → 93-97% with lifecycle CPA
Risk: Medium — $199-449/мес upstream + lifecycle CPA = variable
Break-even: ~50 req/day with affiliate (1% conversion × $85 CPA)

Отличие от P2 (Affiliate RevShare):
  P2: One-shot affiliate (flight → commission)
  P13: LIFECYCLE chain (property → mortgage → insurance → moving)
  P2: One CPA per action
  P13: Multiple CPAs per lifecycle ($185 total)

Отличие от P8 (Transactional Affiliate):
  P8: Auto-injected URLs, low CPA ($0.30/ticket)
  P13: Context-triggered lifecycle, HIGH CPA ($50-500/lead)

Отличие от P11 (Gov Data Fusion):
  P11: Government-only data ($0 upstream)
  P13: Government + commercial FUSION ($199-449 upstream)

Примеры: RentCast (real estate), потенциально:
         auto data + auto insurance/financing lifecycle,
         education data + student loan/scholarship lifecycle
```

---

## P12: Location Intelligence Cache + Cross-UC Enrichment Engine

**UC:** UC-012 Geoapify + Valhalla
**Суть:** Hybrid upstream (hosted API + self-hosted engine). Permanent cache for geocoding (addresses don't change). **INFRASTRUCTURE layer** — обогащает ALL other UCs location context. First UC designed as enabler, not standalone.

```
Условия:
  • Upstream = hybrid (hosted API + self-hosted open-source engine)
  • Low upstream cost ($0-299/мес API + $500-1500/мес infra)
  • Geocoding data permanently cacheable (addresses stable)
  • Cross-UC enrichment — повышает ценность ВСЕХ других UC
  • Zipf's law: top-1000 locations = 95% queries → fast cache warmup

Механика:
  Geocoding: Agent → x402 $0.001 → APIbase → Geoapify → cache permanently
  Routing:   Agent → x402 $0.005 → APIbase → Valhalla ($0) → response
  Places:    Agent → x402 $0.003 → APIbase → Geoapify → cache 30 days
  Enrich:    Agent → x402 $0.005 → APIbase → geocode + POI + routing → fused

  Cache trajectory:
    Day 1 (seed top-1000 cities): ~80% hit rate
    Month 3: ~90%
    Month 6: ~95%
    Year 1: ~98%

Revenue: x402 per-query + cross-UC enrichment value
Margin: 50-94% (growing with cache maturity)
Risk: Medium — infrastructure cost ($600-2100/мес fixed)
Break-even: ~253K req/мес at min infra

Отличие от P5 (Cache Multiplier):
  P5: Temporary cache (TTL minutes)
  P12: PERMANENT geocoding cache + self-hosted routing ($0)

Отличие от P10 (Permanent Cache):
  P10: Standalone product (TMDB)
  P12: INFRASTRUCTURE layer enriching all other UCs

Отличие от P11 (Gov Data Fusion):
  P11: Government data, health domain, standalone intelligence
  P12: Commercial + OSM, location domain, cross-UC enrichment

Sub-pattern: Hybrid Self-hosted
  First UC with self-hosted component (Valhalla MIT).
  Geocoding = hosted API (Geoapify).
  Routing = self-hosted ($0 per query).
  Combines best of both: quality hosted data + zero-cost routing.

Sub-pattern: Cross-UC Enrichment
  Location queries generate value in OTHER UCs:
  "Events near me" → UC-012 geocode → UC-008 Ticketmaster
  "Deliver food" → UC-012 directions → UC-003 Food
  "Weather in Berlin" → UC-012 geocode → UC-005 OWM
  Location becomes invisible infrastructure layer.

Примеры: Geoapify + Valhalla (maps), потенциально:
         self-hosted LLM for enrichment (future),
         self-hosted image processing (future)
```

---

## P11: Gov Data Fusion + Health Commerce Oracle

**UC:** UC-011 USDA + OpenFDA + NIH DSLD + Exercise DB
**Суть:** Несколько **government CC0 / public domain** API → объединены в один fusion layer. $0 upstream, permanent cache (bulk download на старте), AI-native cross-referencing. Дополнительный revenue через health affiliate (supplements, fitness).

```
Условия:
  • Upstream = multiple government/public domain APIs (CC0)
  • $0 за ВСЕ источники (government data = free forever)
  • Данные permanently cacheable (nutrition data stable)
  • Bulk download доступен (seed cache on day 1)
  • Downstream commerce = health affiliates (iHerb 5-10%, Amazon 4-8%)
  • Ценность в FUSION + INTERPRETATION, не в raw data access

Механика:
  Data layer:
    USDA FDC (nutrition) + OpenFDA (safety) + NIH DSLD (supplements)
    + Exercise DB → FUSED into unified health intelligence

  Cache layer:
    Day 1:  Bulk download 3.1 GB USDA → local DB → ~90% cache hit rate
    Month 6: ~95% from cache (all common foods seeded)
    Month 12: ~99% (only new branded products = cache miss)

  Commerce layer:
    Nutritional gap detected → supplement recommendation → affiliate link
    iHerb: 5-10% commission (~$1-2.50 per $20 supplement)
    Amazon Associates: 4-8% on supplements + fitness equipment
    Recurring: supplements = repeat purchase (4-12x/year)

Revenue: x402 fees + health affiliate (highest LTV in portfolio)
Margin: ~100% (upstream $0, served from cached government data)
Risk: Very low — $0 fixed cost, government data never disappears
Break-even: 0 requests (profitable from first query)

Отличие от P1 (Builder Key Proxy):
  P1: 1 source, simple proxy
  P11: 4+ sources FUSED into intelligence layer
  P1: No affiliate
  P11: Health affiliate (highest LTV)

Отличие от P3 (Multi-Provider Router):
  P3: ROUTES to best single provider
  P11: MERGES data from ALL providers simultaneously
  P3: ~$200 upstream
  P11: $0 upstream (all CC0)

Отличие от P10 (Permanent Cache):
  P10: Cache grows organically (cold start)
  P11: Cache SEEDED on day 1 via bulk download (warm start)
  P10: Single source (TMDB)
  P11: Multi-source fusion (4 APIs)

Sub-pattern: Bulk Download Seed
  Government APIs provide full database dumps.
  APIbase downloads entire dataset on setup → immediate ~90% hit rate.
  Unlike P10 (cold cache → warm), P11 starts warm.

Sub-pattern: Health Commerce Affiliate
  Nutritional gap analysis → contextual supplement recommendation.
  Not random advertising — data-driven health advice.
  Higher conversion rate than generic affiliate links.
  Highest CLV: supplements = recurring purchase (monthly/quarterly).

Примеры: USDA + FDA (health), потенциально:
         Census + BLS (economic data), USPTO + WIPO (patents),
         NASA + ESA (space data), any government API fusion
```

---

## Визуализация паттернов по осям

### Ось: Upstream Cost vs Margin

```
Margin %
100% │  P1(Poly) P2(Avia) P10(TMDB) P11(Health) P8(TM) P15(Jobs)
     │  P20(Aster) P20+(HL) ← ~100% margin, $0 upstream, HIGHEST revenue ceiling
     │                P14(Sports) ← with affiliate
     │  P16(Finance) ← at scale (99.2%)
     │  P17(Edu) ← at scale (98.5%)
 90% │  P16(Finance) ← Phase 1   P17(Edu) ← Phase 1 (96%)
     │                  P5(OWM)·    P9(Keepa) ← at scale
     │  P19(Logistics) ← at scale (94.2%)
     │                  P12(Maps) ← at maturity    P14(Sports) ← API only
 80% │  P19(Logistics) ← Phase 1 (87.3%)   P18(Music) ← at scale (87%)
     │               P3(Food)·
 70% │              ·
     │             ·
 60% │            ·           P4(CG)
     │
 50% │           P12(Maps) ← low vol    P9(Keepa) ← at low vol
     │
 40% │                                    P7(DeepL) ← fixed
     │
 30% │                    P6(News) ← at low volume
     │
     └──────────────────────────────────────────────
     $0    $88  $100      $200      $300      $450     $500
          (+ $600-2100 infra)
                       Upstream Cost/month
```

### Ось: Предсказуемость vs Revenue Upside

```
Revenue Upside
V.High│                              P13(RE)    P14(Sports)    P20+(HL)
High  │                    P2(Avia)     P8(TM)  P15(Jobs)  P16(Finance)
      │               P3(Food)     P10(TMDB)   P17(Edu)  P19(Logistics)  P20(Aster)
      │          P6(News)    P9(Keepa)  P11(Health)
      │     P4(CG)              P18(Music)
      │                    P5(OWM)
Low   │  P1(Poly)                        P7(DeepL)
      └──────────────────────────────────────────
      Low                              High
              Предсказуемость дохода
```

---

## Как выбрать паттерн для нового UC

```
Flowchart:

1. Upstream API бесплатный?
   ├── Да → Есть affiliate program?
   │   ├── Да → Affiliate auto-injection?
   │   │   ├── Да → P8 (Transactional Affiliate)
   │   │   └── Нет → P2 (Affiliate RevShare)
   │   └── Нет → P1 (Builder Key Proxy)
   │
   └── Нет → Upstream billing model?
       ├── Per-call → Данные кэшируемы?
       │   ├── Высоко → P5 (Pay-per-call + Cache Multiplier)
       │   └── Низко → P7 (Premium Quality Proxy)
       │
       ├── Subscription → Данные = computed intelligence?
       │   ├── Да → P9 (Price History Oracle)
       │   └── Нет → P6 (Subscription Arbitrage + Prefetch)
       │
       ├── x402 native → P4 (x402 Upstream Bridge)
       │
       └── Mixed/Multiple providers → P3 (Multi-Provider Router)

   Bonus check (applies to any pattern with $0 upstream):
   └── Данные permanently cacheable?
       ├── Да → P10 (Permanent Cache + Downstream CPA)
       └── Нет → use base pattern (P1/P2/P8)

   Bonus check (applies to any pattern with odds/comparison data):
   └── High-value affiliate per conversion ($50+)?
       ├── Да → P14 (Sports Intelligence + Betting Affiliate CPA)
       └── Нет → P2 or P8 (standard affiliate patterns)

   Bonus check (applies to any pattern with cross-UC utility):
   └── Данные обогащают ДРУГИЕ UC (currency, location, etc.)?
       ├── Да → P16 (Financial Intelligence Fusion + Currency Enrichment)
       │         or P12 (Location Intelligence + Cross-UC Enrichment)
       └── Нет → use base pattern

   Bonus check (applies to any pattern with action-triggering capability):
   └── API позволяет ДЕЙСТВИЯ в реальном мире (не только данные)?
       ├── Да → P19 (Supply Chain Intelligence Layer)
       │         Label creation, insurance, physical delivery
       └── Нет → use data-only pattern
```

---

## Таблица совместимости: Pattern × Revenue Source

| Pattern | x402 fees | Affiliate | CPA | Cache markup | Per-unit markup |
|---------|-----------|-----------|-----|-------------|----------------|
| P1 Builder Key | **Primary** | — | — | Minor | — |
| P2 Affiliate RevShare | Minor | **Primary** | — | — | — |
| P3 Multi-Provider | Secondary | Possible | **Primary** | — | — |
| P4 x402 Bridge | **Primary** | — | — | — | — |
| P5 Cache Multiplier | **Primary** | — | — | **Primary** | — |
| P6 Sub Arbitrage | **Primary** | — | — | **Primary** | — |
| P7 Quality Proxy | — | — | — | — | **Primary** |
| P8 Transactional Affil | **Co-primary** | **Co-primary** | — | Minor | — |
| P9 Price Oracle | **Primary** | — | — | **Primary** | — |
| P10 Permanent Cache | **Primary** | — | Possible | **Primary** (∞ TTL) | — |
| P11 Gov Data Fusion | **Primary** | — | **Co-primary** | **Primary** (bulk) | — |
| P12 Location Cache | **Primary** | — | — | **Primary** (perm) | — |
| P13 Property Lifecycle | **Co-primary** | **Co-primary** | **Primary** (lifecycle) | Minor | — |
| P14 Sports+Betting | **Co-primary** | — | **Primary** (betting CPA) | Minor | — |
| P15 Salary+Career | **Primary** | — | **Co-primary** (career funnel) | **Primary** (bulk) | — |
| P16 Financial Intel | **Co-primary** | — | **Co-primary** (fintech funnel) | **Primary** (bulk+daily) | — |
| P17 Education Funnel | **Co-primary** | **Primary** (Coursera 15-45%) | — | **Primary** (papers+institutions) | — |
| P18 Federated Open Intel | **Primary** | Possible (streaming) | Possible (concerts) | **Primary** (permanent metadata) | — |
| P19 Supply Chain Intel | **Co-primary** | **Co-primary** (Shippo $5-150/ref) | Possible (insurance) | **Primary** (postal/HS 7d cache) | **Co-primary** (label markup) |
| P20 DEX Builder/Broker | **Co-primary** | **Co-primary** (referral 5-10%) | — | Minor (market data) | **Co-primary** (builder fee/trade) |
| P20+ Multi-DEX Builder | **Co-primary** | **Co-primary** (ref 10% + vault 10%) | Possible (arb) | Minor (market data) | **Primary** (builder 100% to builder) |
