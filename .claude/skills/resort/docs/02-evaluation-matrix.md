# 02 — Evaluation Matrix

Матрица оценки API-кандидатов по 12 параметрам.
Каждый параметр оценивается от 1 до 5. Параметры имеют веса.

---

## Параметры оценки

### 1. Free Tier / Pricing (вес: 5)

**Что оцениваем:** Доступность бесплатного доступа, стоимость upstream.

| Score | Критерий | Пример |
|-------|----------|--------|
| 5 | API полностью бесплатный, без ограничений | Ticketmaster Discovery |
| 4 | Щедрый free tier (>1000 req/day) ИЛИ pay-per-use <$0.001/req | OWM One Call 3.0 |
| 3 | Умеренный free tier (100-1000 req/day) ИЛИ $50-200/mo | CoinGecko Analyst |
| 2 | Скромный free tier (<100 req/day) ИЛИ $200-500/mo | NewsAPI Business |
| 1 | Нет free tier, >$500/mo ИЛИ enterprise-only | Bloomberg, Reuters |

**Ключевые вопросы:**
```
• Сколько стоит 1 запрос upstream? → определяет маржу
• Есть ли pay-per-use (как OWM)? → $0 startup cost
• Есть ли free tier для development?
• Какой monthly commitment? → влияет на break-even
```

### 2. Coverage / Data Volume (вес: 4)

**Что оцениваем:** Количество и качество данных.

| Score | Критерий | Пример |
|-------|----------|--------|
| 5 | Крупнейший в категории, глобальный охват | NewsAPI 150K sources |
| 4 | Очень широкий охват, большинство рынков | OWM 200K+ cities |
| 3 | Хороший охват, основные рынки | CoinGecko 14K coins |
| 2 | Ограниченный охват | Last.fm 70M tracks |
| 1 | Нишевый, мало данных | Setlist.fm (niche) |

**Ключевые вопросы:**
```
• Сколько объектов в базе? (events, tracks, coins, cities)
• Сколько стран/рынков?
• Насколько данные полные? (все поля vs partial)
• Как часто обновляются данные?
```

### 3. API Quality / DX (вес: 3)

**Что оцениваем:** Техническое качество API и документации.

| Score | Критерий | Пример |
|-------|----------|--------|
| 5 | Отличная документация, REST/GraphQL, стабильный, Postman коллекции | TMDB |
| 4 | Хорошая документация, REST, версионирование | Ticketmaster Discovery |
| 3 | Адекватная документация, работает надёжно | CoinGecko |
| 2 | Слабая документация, нестабильный | Setlist.fm |
| 1 | Документация отсутствует, deprecated endpoints | — |

**Ключевые вопросы:**
```
• REST или устаревший SOAP/XML?
• Есть ли версионирование (v1, v2, v3)?
• Качество документации (примеры, playground)?
• Есть ли SDK / client libraries?
• Насколько стабильный uptime?
```

### 4. Affiliate / Revenue Potential (вес: 5)

**Что оцениваем:** Возможности дополнительного дохода помимо x402 fees.

| Score | Критерий | Пример |
|-------|----------|--------|
| 5 | Built-in affiliate с auto-injection + высокая комиссия | Ticketmaster Impact |
| 4 | Affiliate program, хорошая комиссия (>10%) | Aviasales 40% RevShare |
| 3 | Affiliate существует, скромная комиссия (<5%) | Booking.com ~4% |
| 2 | Нет affiliate, но можно markup на API fees | CoinGecko, OWM |
| 1 | Нет affiliate, фиксированная маржа | DeepL (37.5% fixed) |

**Ключевые вопросы:**
```
• Есть ли affiliate/partner программа?
• Какой % комиссии? На что (клики, продажи, подписки)?
• Cookie duration?
• Автоматическая injection в API responses?
• Нужно ли конструировать deeplinks вручную?
```

### 5. Agent Utility / Demand (вес: 5)

**Что оцениваем:** Как часто AI-агенты будут использовать этот API.

| Score | Критерий | Пример |
|-------|----------|--------|
| 5 | Ежедневно, один из top-3 запросов агентов | Weather, News, Crypto |
| 4 | Несколько раз в неделю, высокий intent | Travel, Events, Food |
| 3 | Еженедельно, moderate demand | Movies/TV, Translation |
| 2 | Иногда, niche audience | Gaming (IGDB), Setlists |
| 1 | Редко, very niche | Academic papers, Legal |

**Ключевые вопросы:**
```
• "Как часто AI-агент получит запрос на это?"
• Есть ли high-intent queries (ведут к покупке)?
• Это informational или transactional?
• Google AI Mode / ChatGPT уже интегрировали?
```

### 6. ToS Compatibility (вес: 5)

**Что оцениваем:** Разрешает ли Terms of Service модель APIbase (proxy + x402 billing).

| Score | Критерий | Пример |
|-------|----------|--------|
| 5 | Явно разрешено commercial use + redistribution | MusicBrainz (CC0) |
| 4 | Commercial OK, proxy OK через affiliate path | Ticketmaster (affiliate) |
| 3 | Commercial OK с ограничениями (attribution, no resale) | TMDB ($149 license) |
| 2 | Grey area, нужно уточнять | Last.fm, IGDB |
| 1 | Явно запрещено: "non-commercial only", "no redistribution" | Spotify, Deezer, Genius |

**Ключевые вопросы:**
```
• Разрешён ли commercial use?
• Можно ли делать proxy/redistribution?
• Нужна ли коммерческая лицензия? Сколько стоит?
• Есть ли прецеденты litigation (как Genius vs Google)?
• Free tier = non-commercial? Нужен ли paid plan?
```

**HARD DISQUALIFIER:** Score 1 = автоматический отказ от кандидата.

### 7. MCP Ecosystem (вес: 3)

**Что оцениваем:** Наличие MCP серверов и community adoption.

| Score | Критерий | Пример |
|-------|----------|--------|
| 5 | Official MCP server от провайдера | DeepL (deepl-mcp-server) |
| 4 | Несколько mature community MCP servers | TMDB (3+ серверов) |
| 3 | 1-2 community MCP servers | Ticketmaster, IGDB |
| 2 | Есть SDK, но нет MCP | Most APIs |
| 1 | Нет ни SDK, ни MCP | Niche providers |

**Ключевые вопросы:**
```
• Есть ли official MCP server?
• Сколько community MCP серверов на GitHub?
• Есть ли npm package?
• Сколько downloads/stars?
```

### 8. Unique Features (вес: 4)

**Что оцениваем:** Что есть у провайдера, чего нет у конкурентов.

| Score | Критерий | Пример |
|-------|----------|--------|
| 5 | Feature без аналогов в индустрии | DeepL Write API (no competitor!) |
| 4 | Лучший в категории по measurable metric | DeepL BLEU 64.5 (#1) |
| 3 | Unique data source | Polymarket (prediction markets) |
| 2 | Хороший, но аналоги есть | OWM (vs WeatherAPI, Tomorrow.io) |
| 1 | Ничего уникального, commodity API | Generic weather API |

**Ключевые вопросы:**
```
• Что есть ТОЛЬКО у этого провайдера?
• Есть ли measurable преимущество (BLEU score, coverage)?
• Можно ли позиционировать как "#1 в X"?
• Unique data source или commodity?
```

### 9. New Pattern Potential (вес: 5)

**Что оцениваем:** Вводит ли этот UC новый монетизационный паттерн для APIbase.

| Score | Критерий | Пример |
|-------|----------|--------|
| 5 | Совершенно новый паттерн, не встречавшийся в UC-001..N | Per-character billing (UC-007) |
| 4 | Значительная вариация существующего паттерна | Feed Prefetch (UC-008 vs UC-006) |
| 3 | Комбинация существующих паттернов | Dual revenue (UC-008) |
| 2 | Минорная вариация | — |
| 1 | Полное повторение паттерна | Ещё один "per-request API" |

**Ключевые вопросы:**
```
• Какой паттерн монетизации?
• Отличается ли от UC-001..N?
• Вводит ли новый billing unit (per-char, per-ticket, etc.)?
• Новая caching стратегия?
• Новая upstream модель?
```

### 10. Cache Potential (вес: 3)

**Что оцениваем:** Насколько данные кэшируемы → влияет на маржу.

| Score | Критерий | Пример |
|-------|----------|--------|
| 5 | Данные высоко кэшируемы, 100 агентов = 1 upstream call | OWM (weather same city) |
| 4 | Хороший cache hit rate, prefetch возможен | NewsAPI (headlines prefetch) |
| 3 | Средняя кэшируемость, 30s-5min TTL | CoinGecko (prices) |
| 2 | Низкая кэшируемость, каждый запрос ~уникален | Travel search, Food orders |
| 1 | Некэшируемый, каждый запрос = upstream call | DeepL translation |

**Ключевые вопросы:**
```
• Как быстро данные устаревают? (TTL)
• Повторяются ли запросы? ("Moscow weather" × 100 агентов)
• Есть ли bulk feed для prefetch?
• Можно ли предсказать популярные запросы?
```

### 11. Cross-UC Synergy (вес: 4)

**Что оцениваем:** Насколько этот UC усиливает/усиливается другими UC.

| Score | Критерий | Пример |
|-------|----------|--------|
| 5 | Усиливает ВСЕ другие UC (мультипликатор) | Translation (UC-007) |
| 4 | Сильная синергия с 3+ UC | Events + Travel + Weather + Food |
| 3 | Синергия с 1-2 UC | News + Crypto |
| 2 | Standalone, слабая синергия | Predictions (UC-001) |
| 1 | Изолированный, не сочетается | — |

**Ключевые вопросы:**
```
• С какими UC этот API естественно сочетается?
• Можно ли выстроить "call chain" (event → weather → flight → dinner)?
• Это utility layer (translation, geocoding) или domain-specific?
• Revenue multiplier: agent using N UCs = N× revenue per session?
```

### 12. Market Position / Sustainability (вес: 3)

**Что оцениваем:** Финансовая устойчивость провайдера и позиция на рынке.

| Score | Критерий | Пример |
|-------|----------|--------|
| 5 | Market leader, profitable, public company | Ticketmaster/LiveNation |
| 4 | Established player, funded, growing | CoinGecko, DeepL |
| 3 | Stable, niche leader | OWM, NewsAPI |
| 2 | Startup, uncertain future | Small API providers |
| 1 | Declining, risk of shutdown | Deprecated APIs |

**Ключевые вопросы:**
```
• Сколько лет провайдеру?
• Public company или funded startup?
• Revenue model устойчивый?
• Risk of API shutdown / deprecation?
• Есть ли прецеденты breaking changes? (Spotify 2026!)
```

---

## Scoring Table Template

```
| Parameter               | Weight | Candidate A | Candidate B | Candidate C |
|------------------------|--------|-------------|-------------|-------------|
| Free Tier / Pricing     | 5      | ?/5 (×5=?)  | ?/5 (×5=?)  | ?/5 (×5=?)  |
| Coverage                | 4      | ?/5 (×4=?)  | ?/5 (×4=?)  | ?/5 (×4=?)  |
| API Quality             | 3      | ?/5 (×3=?)  | ?/5 (×3=?)  | ?/5 (×3=?)  |
| Affiliate / Revenue     | 5      | ?/5 (×5=?)  | ?/5 (×5=?)  | ?/5 (×5=?)  |
| Agent Utility           | 5      | ?/5 (×5=?)  | ?/5 (×5=?)  | ?/5 (×5=?)  |
| ToS Compatibility       | 5      | ?/5 (×5=?)  | ?/5 (×5=?)  | ?/5 (×5=?)  |
| MCP Ecosystem           | 3      | ?/5 (×3=?)  | ?/5 (×3=?)  | ?/5 (×3=?)  |
| Unique Features         | 4      | ?/5 (×4=?)  | ?/5 (×4=?)  | ?/5 (×4=?)  |
| New Pattern Potential   | 5      | ?/5 (×5=?)  | ?/5 (×5=?)  | ?/5 (×5=?)  |
| Cache Potential         | 3      | ?/5 (×3=?)  | ?/5 (×3=?)  | ?/5 (×3=?)  |
| Cross-UC Synergy        | 4      | ?/5 (×4=?)  | ?/5 (×4=?)  | ?/5 (×4=?)  |
| Market Position         | 3      | ?/5 (×3=?)  | ?/5 (×3=?)  | ?/5 (×3=?)  |
|========================|========|=============|=============|=============|
| **TOTAL (max 245)**     |        | **?**       | **?**       | **?**       |
```

**Max possible score:** 12 params × 5 score × (avg weight ~4.08) = 245

**Scoring interpretation:**
```
200-245: Отличный кандидат, интегрировать немедленно
160-199: Хороший кандидат, интегрировать при подходящей категории
120-159: Средний, интегрировать только если нет лучших
80-119:  Слабый, рассмотреть только при отсутствии альтернатив
<80:     Не рекомендуется
```

---

## Примеры реальных оценок (из UC-008 research)

| Parameter | Ticketmaster | TMDB | IGDB | Spotify |
|-----------|-------------|------|------|---------|
| Free Tier (×5) | 5 (25) | 5 (25) | 4 (20) | 1 (5) |
| Coverage (×4) | 4 (16) | 5 (20) | 3 (12) | 5 (20) |
| API Quality (×3) | 4 (12) | 5 (15) | 3 (9) | 4 (12) |
| Affiliate (×5) | 5 (25) | 2 (10) | 1 (5) | 2 (10) |
| Agent Utility (×5) | 5 (25) | 5 (25) | 4 (20) | 4 (20) |
| ToS (×5) | 4 (20) | 3 (15) | 3 (15) | 1 (5) |
| MCP (×3) | 4 (12) | 5 (15) | 3 (9) | 3 (9) |
| Unique Features (×4) | 3 (12) | 4 (16) | 3 (12) | 4 (16) |
| New Pattern (×5) | 5 (25) | 2 (10) | 2 (10) | 1 (5) |
| Cache (×3) | 4 (12) | 4 (12) | 4 (12) | 1 (3) |
| Cross-UC (×4) | 4 (16) | 3 (12) | 2 (8) | 2 (8) |
| Market Position (×3) | 5 (15) | 4 (12) | 3 (9) | 5 (15) |
| **TOTAL** | **215** | **187** | **141** | **128** |

**Результат:** Ticketmaster (215) >>> TMDB (187) > IGDB (141) > Spotify (128)
