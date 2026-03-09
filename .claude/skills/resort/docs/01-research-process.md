# 01 — Research Process

Пошаговый процесс исследования нового API-провайдера для APIbase.
Выведен из опыта 8 реальных интеграций (UC-001..UC-008).

---

## Фаза 0: Выбор категории

**Вход:** Запрос "добавь юзкейс из [область]" или стратегическое решение о покрытии.

### Чеклист выбора категории

```
□ Категория НЕ дублирует существующие UC
□ Высокий спрос у AI-агентов (ответь: "как часто агент спросит это?")
□ Возможен НОВЫЙ монетизационный паттерн (не повтор)
□ Есть контраст с существующими UC по типу данных
□ Cross-UC синергия (усиливает/усиливается другими UC)
```

### Приоритеты категорий (на основе частоты запросов агентов)

```
Tier 1 (ежедневные запросы):
  ✅ Crypto/Finance    → UC-004 CoinGecko
  ✅ Weather           → UC-005 OpenWeatherMap
  ✅ News              → UC-006 NewsAPI
  ✅ Translation       → UC-007 DeepL

Tier 2 (еженедельные запросы):
  ✅ Travel            → UC-002 Aviasales
  ✅ Food/Delivery     → UC-003 Food Delivery
  ✅ Events            → UC-008 Ticketmaster
  ✅ Predictions       → UC-001 Polymarket

Tier 3 (кандидаты):
  ☐ E-commerce / Shopping
  ☐ Maps / Navigation
  ☐ Movies / TV / Streaming
  ☐ Health / Fitness
  ☐ Real Estate
  ☐ Jobs / Recruiting
  ☐ Social Media analytics
  ☐ Email / Communication
  ☐ Payments / Banking
  ☐ Legal / Documents
```

---

## Фаза 1: Формирование шортлиста

**Вход:** Категория (например, "музыка или развлечения").
**Выход:** 7-10 API-кандидатов.

### Где искать кандидатов

```
1. Агрегаторы API:
   • RapidAPI.com — крупнейший маркетплейс, 40,000+ API
   • ProgrammableWeb (архив) — исторический каталог
   • Public APIs (github.com/public-apis/public-apis) — open source список
   • APILayer.com — коллекция business API

2. MCP экосистема:
   • mcpservers.org — каталог MCP серверов
   • GitHub search: "mcp-server [category]"
   • npmjs.com: search "mcp [category]"
   • smithery.ai — MCP marketplace

3. Прямой поиск:
   • Google: "[category] API for developers"
   • Google: "[category] API pricing 2026"
   • Google: "[category] API affiliate program"
   • ProductHunt: API-продукты в категории

4. Конкурентный анализ:
   • Какие API уже интегрированы в ChatGPT/Claude/Gemini?
   • Какие API используют popular AI agents?
   • Google AI Mode partnerships (Ticketmaster, OpenTable, etc.)
```

### Формат шортлиста

Для каждого кандидата записать одну строку:

```
| # | Provider | Free tier | Paid plan | Coverage | Affiliate | Notes |
|---|----------|-----------|-----------|----------|-----------|-------|
| 1 | Spotify  | 5 users   | Closed    | 100M tracks | $7.35/sub | API закрыт 2026 |
| 2 | TMDB     | 40 req/s  | $149/mo   | 1.3M movies | No | Rate limits removed |
| ...
```

---

## Фаза 2: Глубокое исследование

**Вход:** 7-10 кандидатов.
**Выход:** Заполненная матрица оценки (см. `02-evaluation-matrix.md`).

### Что исследовать по каждому кандидату

```
Для каждого из 7-10 кандидатов:

1. PRICING (5 мин на кандидата)
   • WebSearch: "[provider] API pricing 2026"
   • Проверить: free tier limits, paid plans, pay-per-use опции
   • Ключевой вопрос: "Сколько стоит 1 запрос upstream?"

2. COVERAGE (3 мин)
   • Количество объектов (tracks, events, cities, articles)
   • Географический охват (страны, языки)
   • Полнота данных (все поля или partial)

3. API QUALITY (5 мин)
   • WebFetch: developer docs
   • REST/GraphQL? Версионирование? Документация?
   • Rate limits, auth model, response format

4. AFFILIATE / REVENUE (5 мин)
   • WebSearch: "[provider] affiliate program"
   • Комиссии, cookie duration, payment terms
   • Есть ли auto-injection?

5. ToS (5 мин)
   • WebSearch: "[provider] API terms of service commercial use"
   • Можно ли resell/proxy? Commercial use?
   • Red flags: "non-commercial only", "no redistribution"

6. MCP ECOSYSTEM (3 мин)
   • GitHub search: "[provider] mcp server"
   • npmjs search: "[provider]-mcp"
   • Есть official MCP server?

7. UNIQUE FEATURES (3 мин)
   • Что у этого провайдера есть ТОЛЬКО у него?
   • Чем он лучше конкурентов?

8. AGENT UTILITY (2 мин)
   • "Как часто AI-агент будет спрашивать это?"
   • Примеры типичных запросов
```

### Инструменты исследования

```
Основные:
  • WebSearch — pricing, features, news, affiliate programs
  • WebFetch — API docs, ToS pages, developer portals
  • GitHub search — MCP servers, SDKs, community activity

Дополнительные:
  • npm/PyPI — пакеты, SDK'и, download counts
  • Reddit/HN — отзывы разработчиков
  • Crunchbase — финансовое состояние провайдера
```

---

## Фаза 3: Scoring и Selection

**Вход:** Заполненная матрица оценки.
**Выход:** 1 победитель + обоснование.

### Процесс отбора

```
1. Заполнить матрицу 12 параметров для каждого кандидата
   (см. 02-evaluation-matrix.md)

2. Подсчитать weighted score для каждого

3. Отфильтровать по hard disqualifiers:
   × ToS запрещает commercial use → DISQUALIFIED
   × API закрыт / deprecated → DISQUALIFIED
   × Нет free tier И нет разумного paid plan → DISQUALIFIED
   × Повторяет паттерн существующего UC → DOWNWEIGHT

4. Из оставшихся выбрать по:
   a) Highest weighted score
   b) Наибольший контраст с существующими UC
   c) Введение НОВОГО паттерна монетизации
   d) Cross-UC синергия

5. Документировать reasoning:
   "Выбран [X] потому что: [3 главные причины]"
   "Отвергнуты: [Y] из-за [причина], [Z] из-за [причина]"
```

### Типичные причины отказа (из опыта UC-001..008)

```
Spotify (UC-008 research):    API закрыт для новых разработчиков (Feb 2026)
Genius (UC-008 research):     Lyrics не возвращаются через API, ToS риски
Deezer (UC-008 research):     "Non-commercial only" в ToS
Alpha Vantage (UC-004):       x402 CoinGecko лучше для Web4 narrative
WeatherAPI.com (UC-005):      OWM имеет pay-per-call и 8M+ developers
GNews (UC-006):               Только 10 стран vs NewsAPI 55 стран
Google Cloud Translation:     Нет unique features (DeepL Write API)
LibreTranslate (UC-007):      Качество значительно ниже DeepL
```

---

## Фаза 4: Создание UC файла

**Вход:** Выбранный провайдер + собранные данные.
**Выход:** UC-XXX-provider.md (~700-1000 строк).

### Структура и порядок написания

```
Порядок написания (от upstream к downstream):

1. Meta                    — 5 строк: ID, provider, category, date, status
2. Client Input Data       — какие credentials нужны, assessment
3. Provider API Analysis   — endpoints, auth, rate limits, pricing
4. APIbase Wrapper Design  — 3 уровня: Protocol → Semantic → Value-Add
5. MCP Tool Definitions    — JSON schemas для каждого инструмента
6. AI Instructions         — промпт для агентов (when to use, call chains)
7. Publication             — catalog entry + GitHub entry
8. Traffic Flow Diagram    — ASCII диаграммы запросов
9. Monetization Model      — revenue streams, costs, margins, comparison table
10. Lessons Learned        — что работает, challenges, новые паттерны
```

### Ключевые секции для maximum value

```
Наибольшую ценность несут:

Секция 4 (MCP Tools):
  • JSON schema с description, properties, required
  • Description должен быть достаточно информативен для LLM
  • Properties с описаниями, enum'ами, defaults

Секция 5 (AI Instructions):
  • "When to Use" — триггеры для агента
  • "Recommended Call Chains" — типовые сценарии
  • "Cross-UC Integration" — как комбинировать с другими UC
  • "Limitations" — что агент НЕ должен пытаться делать

Секция 9 (Lessons Learned):
  • Какой НОВЫЙ паттерн вводит этот UC
  • Таблица сравнения ВСЕХ UC (обновлять каждый раз)
  • Уникальные аспекты vs предыдущие UC
```

---

## Фаза 5: Обновление индексов

**Вход:** Готовый UC файл.
**Выход:** Обновлённые SKILL.md и Spec.

### Checklist обновлений

```
□ Файл UC-XXX-provider.md создан в usecases/
□ Строка добавлена в user-usecases/SKILL.md (таблица Use Cases Index)
□ Секция 11.X добавлена в APIbase_Product_Spec_v2.1.md:
  □ "Почему [provider]" (2-3 предложения)
  □ Таблица архитектуры (upstream, auth, cost)
  □ Таблица MCP tools (tool, description, price)
  □ Cross-UC integration (если есть)
  □ Экономика (upstream cost, revenue, margin)
  □ Новые паттерны (1-2 абзаца)
  □ Обновлённая таблица сравнения ВСЕХ UC
□ Секция идёт перед "## 12. Добавленные технологии"
```

---

## Временные ориентиры

```
Фаза 0 (категория):        2-3 мин
Фаза 1 (шортлист):         5-10 мин
Фаза 2 (исследование):     15-30 мин (через research agent)
Фаза 3 (selection):        5 мин
Фаза 4 (UC файл):          20-40 мин
Фаза 5 (индексы):          5 мин
─────────────────────────────────────
Итого:                      ~50-90 мин на один UC
```
