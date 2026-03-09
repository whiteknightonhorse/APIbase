# 05 — UC Creation Checklist

Пошаговый checklist создания UC-файла для APIbase.
Используй при написании каждого нового юзкейса.

---

## Pre-flight Checks

```
□ Категория определена и не дублирует существующие UC
□ Провайдер выбран через evaluation matrix (score > 160/245)
□ ToS проверен — commercial use разрешён
□ Новый паттерн монетизации идентифицирован
□ Cross-UC синергия описана (с какими UC сочетается)
```

---

## Секция 1: Meta (5 строк)

```
□ ID:       UC-XXX (следующий порядковый номер)
□ Provider: Название компании (домен)
□ Category: Категория / Подкатегория
□ Date:     YYYY-MM-DD
□ Status:   Reference (для documentation) | Production (для live)
□ Client:   "APIbase (platform-level integration)"
```

---

## Секция 2: Client Input Data

```
□ Перечислены ВСЕ необходимые credentials:
  □ API keys / tokens
  □ OAuth credentials
  □ Affiliate IDs
  □ Certificates / Webhooks URLs

□ Sufficiency Assessment таблица:
  □ Каждый credential → что даёт → sufficient?
  □ Free vs Paid plans → какой нужен для production

□ Verdict: какой минимальный план нужен для APIbase
  □ Указана точная стоимость ($X/мес + $Y/req)
  □ Указаны ограничения free tier (почему нельзя в production)
```

---

## Секция 3: Provider API Analysis

```
□ API Architecture таблица:
  □ Все services/endpoints перечислены
  □ Base URL для каждого
  □ Auth method (API Key, OAuth, x402)
  □ Краткое описание

□ Key Endpoints:
  □ Каждый endpoint: URL, Method, Description
  □ Ключевые параметры с описаниями
  □ Response format (что возвращается)

□ Authentication Model:
  □ Как передаётся ключ (header, query param, body)
  □ Типы ключей (free, pro, enterprise)
  □ OAuth flow (если есть)

□ Rate Limits таблица:
  □ Req/min, req/day, req/month для каждого плана
  □ Как лимиты влияют на APIbase capacity
  □ Есть ли burst limits

□ Дополнительные разделы (по необходимости):
  □ Supported languages/markets/countries
  □ Quality benchmarks (BLEU scores, accuracy)
  □ Existing MCP servers
  □ Webhook support
```

---

## Секция 4: APIbase Wrapper Design

```
□ Level 1: Protocol Adapter
  □ URL mapping: apibase routes → upstream endpoints
  □ Auto-enrichment (geocoding, language detection, etc.)
  □ Caching strategy с TTL для каждого типа запроса
  □ Prefetch strategy (если применимо)
  □ Error normalization → APIbase standard format
  □ Multi-key / load balancing (если нужно)

□ Level 2: Semantic Normalizer
  □ JSON mapping: original → APIbase schema
  □ Пример оригинального response
  □ Пример нормализованного response
  □ Domain model name (crypto, weather, event, translation, etc.)

□ Level 3: Value-Add
  □ Что APIbase добавляет поверх прямого API?
  □ Enrichment (categories, reliability tiers, etc.)
  □ Intelligence (price tracking, trending, etc.)
  □ Cross-UC integration points
```

---

## Секция 5: MCP Tool Definitions

```
□ Каждый tool в формате JSON:
  □ name: snake-case, descriptive (weather-now, events-search)
  □ description: 1-2 предложения для LLM, включить key stats
  □ inputSchema: type=object, properties, required

□ Для каждого property:
  □ type: string/number/integer/boolean/array
  □ description: что это и как влияет на результат
  □ enum: если ограниченный набор значений
  □ default: если есть разумное значение по умолчанию

□ Принципы:
  □ Минимум required полей (агент должен мочь вызвать с 1-2 params)
  □ Description достаточно информативен для LLM (не нужно читать docs)
  □ Enum values понятны без контекста
  □ 5-9 tools на UC (не меньше 5, не больше 10)
```

### Naming Convention для tools

```
{domain}-{action}

Domains:     crypto, weather, news, events, translate, flight, food
Actions:     search, now, forecast, details, trending, compare, detect

Примеры:
  crypto-price, crypto-trending, crypto-search
  weather-now, weather-forecast, weather-compare
  events-search, events-nearby, events-trending
  translate-text, translate-batch, translate-document
  news-headlines, news-search, news-track
```

---

## Секция 6: AI Instructions

```
□ Markdown блок внутри code fence (```markdown ... ```)

□ "When to Use":
  □ 5-10 триггерных фраз пользователя
  □ Keyword matches (имена, категории)
  □ Cross-UC triggers ("translate this news article")

□ "Key Concepts":
  □ 5-7 пунктов: что агенту НУЖНО знать
  □ Pricing model для агента
  □ Coverage/limitations summary

□ "Recommended Call Chains":
  □ 5-7 типовых сценариев
  □ Каждый: пользовательский запрос → sequence of tool calls
  □ Хотя бы 2 cross-UC chains

□ "Response Formatting":
  □ Как форматировать ответ пользователю
  □ Что показывать обязательно
  □ Attribution (если требуется)

□ "Cross-UC Integration" таблица:
  □ Каждый существующий UC → как сочетается

□ "Limitations":
  □ Что агент НЕ может / НЕ должен делать
  □ Rate limits, coverage gaps, async operations

□ "Pricing via APIbase":
  □ Цена каждого tool через x402
  □ Free tier (если есть)
```

---

## Секция 7: Publication

```
□ APIbase.pro Catalog Entry:
  □ URL: apibase.pro/catalog/{category}/{provider}/
  □ Provider, Website, Category, Subcategories
  □ Status: Active ✅
  □ MCP Tools: count + list
  □ Formats: MCP Tool Definition, OpenAPI 3.1, A2A Agent Card
  □ Pricing: per tool
  □ Authentication: OAuth 2.1 via APIbase
  □ Key stats (coverage, markets, quality)

□ GitHub Public Entry:
  □ README.md: provider description, tools list, quick start
  □ capabilities.json: machine-readable metadata
  □ examples.md: 3-5 примеров запросов

□ "Not published" disclaimer:
  □ Перечислить что НЕ идёт в public repo
  □ API keys, pricing strategy, internal algorithms
```

---

## Секция 8: Traffic Flow Diagram

```
□ Минимум 2 ASCII-диаграммы:
  □ Standard request flow (Agent → APIbase → Provider)
  □ Cached/prefetch flow (Agent → APIbase → Cache)

□ Опционально:
  □ Cross-UC flow (multi-step scenario)
  □ Affiliate/conversion flow (если есть)
  □ Error/fallback flow

□ Каждая диаграмма включает:
  □ Три колонки: AI Agent | APIbase.pro | Provider
  □ Auth verification step
  □ Cache check step
  □ Normalization step
  □ x402 billing step с суммой
  □ Upstream cost annotation
  □ Margin calculation
```

---

## Секция 9: Monetization Model

```
□ Revenue Streams таблица:
  □ Каждый stream: mechanism, expected monthly
  □ Разбивка по типам запросов

□ Cost Structure таблица:
  □ Fixed costs (subscription, base fee)
  □ Variable costs (per-call, per-char)
  □ Total upstream range
  □ Expected revenue range
  □ Net margin range

□ Unit Economics:
  □ Стоимость 1 запроса upstream
  □ Цена 1 запроса downstream
  □ Маржа per request
  □ Real-world examples (tweet, article, document, etc.)

□ Revenue Comparison — ОБЯЗАТЕЛЬНО:
  □ Таблица ВСЕХ UC (UC-001..UC-XXX)
  □ Columns: UC, Provider, Revenue Model, Revenue/month, Upstream, Margin
  □ Highlight текущий UC bold

□ Key insight: 1-2 предложения о главном экономическом выводе
```

---

## Секция 10: Lessons Learned

```
□ "What works well" (5 пунктов):
  □ Каждый пункт: bold заголовок + 2-3 предложения
  □ Что уникально в этом UC

□ "Challenges identified" (5 пунктов):
  □ Каждый пункт: конкретная проблема + как решать
  □ Честная оценка рисков

□ Новый паттерн (1-2 блока):
  □ Название паттерна
  □ Условия применения
  □ Стратегия APIbase
  □ "Применимо к:" — другие API где паттерн подходит

□ Unique Aspects таблица — ОБЯЗАТЕЛЬНО:
  □ Все UC в строках, параметры в столбцах
  □ Highlight текущий UC bold
  □ Параметры: Category, Type, Upstream cost, Billing unit,
    Cacheable, Margin, Revenue/interaction, Cross-UC synergy,
    MCP tools, Official MCP
```

---

## Post-creation Checklist

```
□ Файл UC-XXX-provider.md создан (~700-1000 строк)
□ Все 9 секций заполнены (Meta через Lessons)
□ JSON в MCP tools валидный
□ Таблица сравнения включает ВСЕ предыдущие UC
□ Новый паттерн задокументирован

□ SKILL.md обновлён:
  □ Новая строка в Use Cases Index
  □ Формат: | UC-XXX | Provider | Category | Reference | Credentials | file |

□ Product Spec обновлён (APIbase_Product_Spec_v2.1.md):
  □ Секция 11.X добавлена перед "## 12. Добавленные технологии"
  □ "Почему [provider]" — 2-3 предложения
  □ Архитектура таблица
  □ MCP tools таблица
  □ Cross-UC integration (если есть)
  □ Экономика таблица
  □ Новые паттерны
  □ Сравнение ВСЕХ UC таблица (N+1 columns)
```

---

## Quick Reference: Tool Counts & Pricing Ranges

```
Historical stats (UC-001..008):

Tools per UC:    5-9 (avg: 6.9)
Pricing range:   $0.001-0.05 per req/unit
Free tier:       10-500 free calls/month

Typical pricing tiers:
  Utility calls (list, detect, categories):   $0.001/req
  Standard queries (search, now):             $0.002-0.005/req
  Rich queries (details, forecast):           $0.005-0.01/req
  Premium queries (track, compare, history):  $0.01-0.02/req
  Content transform (translate, improve):     $0.03-0.05/1K chars
```
