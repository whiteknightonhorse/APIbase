# UC-006: NewsAPI.org

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-006 |
| **Provider** | NewsAPI.org (newsapi.org) |
| **Category** | News / Current Events |
| **Date Added** | 2026-03-07 |
| **Status** | Reference |
| **Client** | APIbase (platform-level integration) |

---

## 1. Client Input Data

Интеграция на уровне платформы — APIbase подключает NewsAPI.org как upstream-провайдер:

```
Тип данных:          Значение:
──────────────────────────────────────────────────────────
NewsAPI.org API Key  Business plan key ($449/мес, 250K req/month)
Free API Key         Developer key (100 req/day, 24h delay — только dev)
```

### Sufficiency Assessment

| Data provided | What it enables | Sufficient? |
|---------------|----------------|-------------|
| Developer Key (free) | 100 req/day, 24h delay, 1 month history. Development/testing only. | **No** — нельзя использовать в production по ToS |
| Business Key ($449/mo) | 250,000 req/month, real-time, 5-year archive, commercial use. | **Yes** — полноценный production доступ |
| Advanced Key ($1,749/mo) | 2,000,000 req/month, lower overage cost ($0.0009/req). | **Yes** — для высокой нагрузки |

**Verdict:** NewsAPI.org требует **платную подписку для production** — Developer plan явно запрещён в production/staging. Минимальный вход: Business plan $449/мес. Это самый высокий фиксированный upstream cost из всех UC. Но news — top-3 запрос агентов, что обеспечивает high volume для окупаемости.

---

## 2. Provider API Analysis

### API Architecture

NewsAPI.org — крупнейший агрегатор новостей по числу разработчиков: 150,000+ источников, 55 стран, 14 языков.

| Service | Base URL | Auth | Description |
|---------|----------|------|-------------|
| **Everything** | `https://newsapi.org/v2/everything` | API Key | Полнотекстовый поиск по всем источникам |
| **Top Headlines** | `https://newsapi.org/v2/top-headlines` | API Key | Главные новости по стране/категории |
| **Sources** | `https://newsapi.org/v2/sources` | API Key | Список доступных источников |

### Key Endpoints

#### Everything — Full-Text Search

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Поисковый запрос (поддержка Boolean: AND, OR, NOT, кавычки) |
| `searchIn` | string | Где искать: title, description, content |
| `sources` | string | Фильтр по источникам (через запятую, макс 20) |
| `domains` | string | Фильтр по доменам (bbc.co.uk, nytimes.com) |
| `excludeDomains` | string | Исключить домены |
| `from` | date | Начало периода (ISO 8601) |
| `to` | date | Конец периода |
| `language` | string | ar, de, en, es, fr, he, it, nl, no, pt, ru, sv, ud, zh |
| `sortBy` | string | relevancy, popularity, publishedAt |
| `pageSize` | int | Результатов на страницу (макс 100) |
| `page` | int | Номер страницы |

**Response format:**
```json
{
  "status": "ok",
  "totalResults": 12345,
  "articles": [
    {
      "source": {"id": "bbc-news", "name": "BBC News"},
      "author": "John Smith",
      "title": "Breaking: Major Event Happens",
      "description": "A significant event occurred...",
      "url": "https://bbc.co.uk/news/article-123",
      "urlToImage": "https://ichef.bbci.co.uk/image.jpg",
      "publishedAt": "2026-03-07T14:30:00Z",
      "content": "Full article text (first 200 chars on free tier)..."
    }
  ]
}
```

#### Top Headlines — Breaking News

| Parameter | Type | Description |
|-----------|------|-------------|
| `country` | string | 2-letter country code (us, gb, ru, de, fr, jp, etc.) |
| `category` | string | business, entertainment, general, health, science, sports, technology |
| `sources` | string | Конкретные источники (нельзя с country/category) |
| `q` | string | Ключевые слова в заголовках |
| `pageSize` | int | Макс 100 |
| `page` | int | Номер страницы |

#### Sources — Available Sources

| Parameter | Type | Description |
|-----------|------|-------------|
| `category` | string | Фильтр по категории |
| `language` | string | Фильтр по языку |
| `country` | string | Фильтр по стране |

### Authentication Model

```
Простая модель:
  Header: X-Api-Key: YOUR_API_KEY
  ИЛИ
  Query: ?apiKey=YOUR_API_KEY

Получение ключа: мгновенная регистрация на newsapi.org/register
```

### Rate Limits

| Plan | req/day | req/month | Delay | Archive | Cost |
|------|---------|-----------|-------|---------|------|
| Developer | 100 | ~3,000 | 24h | 1 month | $0 |
| Business | ~8,333 | 250,000 | Real-time | 5 years | $449/mo |
| Advanced | ~66,667 | 2,000,000 | Real-time | 5 years | $1,749/mo |
| Enterprise | Unlimited | Unlimited | Real-time | 5 years | Custom |

Overage: Business $0.0018/req, Advanced $0.0009/req.

### Coverage

| Metric | Value |
|--------|-------|
| Sources | 150,000+ worldwide |
| Countries | 55 |
| Languages | 14 (ar, de, en, es, fr, he, it, nl, no, pt, ru, sv, ud, zh) |
| Categories | 7 (business, entertainment, general, health, science, sports, technology) |
| Archive depth | 5 years (Business+) |
| Update frequency | Real-time (Business+) |

---

## 3. APIbase Wrapper Design

### Level 1: Protocol Adapter

```
What the adapter does:
──────────────────────────────────────────────────────────────
• Wraps 3 NewsAPI.org endpoints → unified APIbase news interface
  apibase.pro/api/v1/news/...

• Request routing:
  /news/headlines    → newsapi.org/v2/top-headlines
  /news/search       → newsapi.org/v2/everything
  /news/sources      → newsapi.org/v2/sources

• Query enhancement:
  - Агент отправляет "Bitcoin crash" → APIbase строит Boolean query:
    q="Bitcoin" AND ("crash" OR "drop" OR "plunge" OR "decline")
  - Автоматическое расширение запросов на основе semantic understanding
  - Multi-language auto-detect: запрос на русском → language=ru

• Caching strategy:
  - Top Headlines (country+category): 5 min TTL
  - Search (specific query): 15 min TTL
  - Sources list: 24h TTL
  - Historical searches: 1h TTL (static data)
  - Popular queries prefetch: top-10 countries × 7 categories = 70 cached feeds

• Prefetch strategy (reduce upstream calls):
  - Every 5 min: fetch top headlines for top-10 countries
  - 10 countries × 7 categories × 12 times/hour × 24h = 20,160 upstream/day
  - Serves unlimited downstream requests from cache
  - Remaining quota: 250,000 - (20,160 × 30) = ~245,200 for search queries

• Error normalization:
  NewsAPI errors → APIbase standard format
  {"error": "news_rate_limited", "retry_after": 60}
  {"error": "news_query_too_broad", "message": "Add more specific terms"}
```

### Level 2: Semantic Normalizer

**Domain model: `news-article`**

```json
// === NewsAPI.org original ===
{
  "source": {"id": "bbc-news", "name": "BBC News"},
  "author": "John Smith",
  "title": "Bitcoin Drops Below $90,000 Amid Market Uncertainty",
  "description": "The price of Bitcoin fell sharply overnight...",
  "url": "https://www.bbc.co.uk/news/business-12345678",
  "urlToImage": "https://ichef.bbci.co.uk/image-12345.jpg",
  "publishedAt": "2026-03-07T08:30:00Z",
  "content": "The price of Bitcoin dropped below $90,000 for the first time in three months, as traders react to... [+2340 chars]"
}

// === APIbase normalized (news-article schema) ===
{
  "provider": "newsapi",
  "article_id": "apibase_news_bbc_12345678",
  "title": "Bitcoin Drops Below $90,000 Amid Market Uncertainty",
  "summary": "The price of Bitcoin fell sharply overnight...",
  "content_preview": "The price of Bitcoin dropped below $90,000 for the first time in three months, as traders react to...",
  "source": {
    "id": "bbc-news",
    "name": "BBC News",
    "domain": "bbc.co.uk",
    "country": "gb",
    "reliability_tier": "tier1"
  },
  "author": "John Smith",
  "url": "https://www.bbc.co.uk/news/business-12345678",
  "image_url": "https://ichef.bbci.co.uk/image-12345.jpg",
  "published_at": "2026-03-07T08:30:00Z",
  "language": "en",
  "categories": ["business", "crypto"],
  "entities": ["Bitcoin", "cryptocurrency"],
  "sentiment": null,
  "last_updated": "2026-03-07T14:30:00Z"
}
```

### Level 3: Source Reliability Enrichment

```
APIbase добавляет ценность поверх сырых данных NewsAPI.org:
──────────────────────────────────────────────────────────────

1. Source Reliability Tiers (maintained by APIbase):
   tier1: BBC, Reuters, AP, NYT, WSJ, The Guardian, etc.
   tier2: CNN, Bloomberg, CNBC, FT, Al Jazeera, etc.
   tier3: National outlets, major regional papers
   tier4: Specialized/niche outlets, blogs
   unverified: Unknown or unvetted sources

2. Duplicate Detection:
   - Multiple sources often cover same story
   - APIbase groups related articles by story cluster
   - Returns primary article + count of related sources
   - "This story covered by 47 sources"

3. Category Auto-tagging:
   - NewsAPI has 7 categories for top-headlines
   - But /v2/everything has NO categories
   - APIbase adds ML-based category tagging to search results
   - Also tags with entities (people, companies, locations)

Value-add = APIbase is NOT just proxying NewsAPI.org
         → Adding source quality, dedup, and enrichment
```

---

## 4. MCP Tool Definitions

### Tool: news-headlines

```json
{
  "name": "news-headlines",
  "description": "Get breaking news and top headlines from 150,000+ sources worldwide. Filter by country, category, or specific sources. Updated in real-time.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "country": {
        "type": "string",
        "description": "2-letter country code: us, gb, ru, de, fr, jp, cn, in, au, ca, etc.",
        "enum": ["us", "gb", "ru", "de", "fr", "jp", "cn", "in", "au", "ca", "br", "it", "es", "kr", "mx", "nl", "no", "se", "za"]
      },
      "category": {
        "type": "string",
        "enum": ["general", "business", "technology", "science", "health", "sports", "entertainment"],
        "description": "News category filter"
      },
      "query": {
        "type": "string",
        "description": "Keywords to filter headlines (optional)"
      },
      "limit": {
        "type": "integer",
        "default": 10,
        "maximum": 50,
        "description": "Number of articles to return"
      }
    },
    "required": []
  }
}
```

### Tool: news-search

```json
{
  "name": "news-search",
  "description": "Search across 150,000+ news sources worldwide. Full-text search with Boolean operators (AND, OR, NOT, quotes for exact match). Filter by date range, language, source, and domain. Returns articles sorted by relevance, popularity, or date.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Search query. Supports Boolean: 'Bitcoin AND crash', '\"artificial intelligence\"', 'Apple NOT fruit'"
      },
      "from_date": {
        "type": "string",
        "description": "Start date (ISO 8601: '2026-03-01' or '2026-03-01T00:00:00Z')"
      },
      "to_date": {
        "type": "string",
        "description": "End date (ISO 8601)"
      },
      "language": {
        "type": "string",
        "enum": ["en", "ru", "de", "fr", "es", "it", "pt", "nl", "no", "sv", "ar", "he", "zh"],
        "default": "en",
        "description": "Article language"
      },
      "sort_by": {
        "type": "string",
        "enum": ["relevancy", "popularity", "publishedAt"],
        "default": "publishedAt",
        "description": "Sort order"
      },
      "sources": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Filter by specific sources: ['bbc-news', 'cnn', 'reuters']",
        "maxItems": 20
      },
      "domains": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Filter by domains: ['bbc.co.uk', 'nytimes.com']"
      },
      "exclude_domains": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Exclude domains from results"
      },
      "limit": {
        "type": "integer",
        "default": 10,
        "maximum": 100,
        "description": "Number of articles"
      }
    },
    "required": ["query"]
  }
}
```

### Tool: news-sources

```json
{
  "name": "news-sources",
  "description": "List available news sources with metadata. Filter by category, language, or country. Useful for discovering which sources cover a topic or region.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "category": {
        "type": "string",
        "enum": ["general", "business", "technology", "science", "health", "sports", "entertainment"]
      },
      "language": {
        "type": "string",
        "enum": ["en", "ru", "de", "fr", "es", "it", "pt", "nl", "no", "sv", "ar", "he", "zh"]
      },
      "country": {
        "type": "string",
        "description": "2-letter country code"
      }
    },
    "required": []
  }
}
```

### Tool: news-brief

```json
{
  "name": "news-brief",
  "description": "Get a concise news briefing — top stories across multiple categories for a country. Designed for 'morning briefing' use case. Returns 3-5 top stories per category with source reliability tiers.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "country": {
        "type": "string",
        "default": "us",
        "description": "Country for the briefing (2-letter code)"
      },
      "categories": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["general", "business", "technology", "science", "health", "sports", "entertainment"]
        },
        "default": ["general", "business", "technology"],
        "description": "Categories to include in the briefing"
      },
      "stories_per_category": {
        "type": "integer",
        "default": 3,
        "maximum": 5,
        "description": "Number of stories per category"
      }
    },
    "required": []
  }
}
```

### Tool: news-track

```json
{
  "name": "news-track",
  "description": "Track news coverage of a topic over time. Shows how many articles were published per day and which sources covered it. Useful for understanding media attention trends.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Topic to track, e.g. 'OpenAI', 'climate summit', 'Bitcoin ETF'"
      },
      "days": {
        "type": "integer",
        "default": 7,
        "maximum": 30,
        "description": "Number of days to look back"
      },
      "language": {
        "type": "string",
        "default": "en"
      }
    },
    "required": ["query"]
  }
}
```

---

## 5. AI Instructions

```markdown
# NewsAPI.org via APIbase — AI Agent Instructions

## When to Use
- User asks "What's in the news?" or "What's happening with X?"
- User wants a morning/evening news briefing
- User asks about a specific event or person in the news
- User wants to track media coverage of a topic
- User needs news from a specific country or in a specific language
- User asks about trending topics or breaking news
- User needs to fact-check or find source articles

## Key Concepts
- Top Headlines = curated breaking news (by country + category)
- Everything = full-text search across all 150,000+ sources
- Source tiers: tier1 (BBC, Reuters, AP) → tier4 (niche blogs)
- Boolean search: AND, OR, NOT, "exact phrase"
- 14 languages supported: en, ru, de, fr, es, it, pt, nl, no, sv, ar, he, zh, ud

## Recommended Call Chains

### "What's in the news today?"
1. `news-brief` (country="us") → morning briefing
   Returns 3-5 stories across general, business, technology

### "Tell me about [topic]"
1. `news-search` (query="topic", sort_by="publishedAt") → latest articles
2. Summarize top 3-5 results with source attribution

### "What's happening in [country]?"
1. `news-headlines` (country="ru", category="general") → top headlines
2. Format as bullet list with sources

### "Breaking news about [event]"
1. `news-search` (query="event", sort_by="publishedAt", from_date=today)
2. Prioritize tier1 sources in response

### "How is [topic] covered in the media?"
1. `news-track` (query="topic", days=7) → coverage trend
2. `news-search` (query="topic", sort_by="popularity") → most-read articles
3. Synthesize: trend + key articles + source diversity

### "News about [topic] in [language]"
1. `news-search` (query="topic", language="ru") → results in Russian
2. Present with proper language context

### Cross-UC chains:
- Agent books flight (UC-002): `news-headlines` (country=destination) → "any travel warnings?"
- Agent checks crypto (UC-004): `news-search` (query="Bitcoin regulation") → "news affecting price"
- Agent checks weather (UC-005): `news-search` (query="hurricane Florida") → "weather emergency context"

## Response Formatting
- Always attribute sources: "According to BBC News..." or "[Reuters]"
- Show publication time: "3 hours ago" or "Yesterday at 14:30"
- For multi-article responses: use numbered list or bullet points
- Indicate source reliability: prefer tier1/tier2, note if only tier3/tier4 available
- For controversial topics: show perspectives from multiple sources
- Include article URLs for user follow-up
- Caveat: "Based on available news sources. For the full article, visit [url]"

## Limitations
- Article content is truncated (~200 chars on some plans)
- Historical search limited to 5 years
- Some paywalled sources (WSJ, FT) — title/description available, full text not
- 14 languages — many smaller languages not covered
- Source reliability tiers are APIbase's assessment, not absolute truth
- Some real-time events may take 1-5 minutes to appear in results
- Maximum 100 results per query page

## Pricing via APIbase
- Headlines (cached): $0.005/req via x402
- Search (specific query): $0.01/req via x402
- News brief (multi-category): $0.015/req via x402
- Track (multi-day analysis): $0.02/req via x402
- Sources list: $0.001/req via x402
- Free tier: 50 req/month (headlines only)
```

---

## 6. Publication

### APIbase.pro Catalog Entry

```
URL: apibase.pro/catalog/news/newsapi/
──────────────────────────────────────────────────────────────
Provider:       NewsAPI.org
Website:        newsapi.org
Category:       News / Current Events
Subcategories:  Headlines, Search, Tracking, Briefing

Status:         Active ✅
MCP Tools:      5 tools (news-headlines, news-search, news-sources,
                news-brief, news-track)
Formats:        MCP Tool Definition, OpenAPI 3.1, A2A Agent Card

Pricing:
  Headlines:         $0.005/req via x402
  Search:            $0.01/req via x402
  Briefing:          $0.015/req via x402
  Track:             $0.02/req via x402

Authentication:  OAuth 2.1 via APIbase (agent registration required)
Data freshness:  Headlines: 5 min | Search: 15 min | Real-time source
Rate limits:     Per-agent, based on KYA level
Auto-sync:       Headlines: 5 min | Sources: daily
Coverage:        150,000+ sources, 55 countries, 14 languages
```

### GitHub Public Entry

```
github.com/apibase-pro/apibase/apis/news/newsapi/
│
├── README.md
│   # NewsAPI.org — Global News & Current Events API
│   NewsAPI.org aggregates news from 150,000+ sources in 55 countries.
│   Through APIbase, AI agents can search news, get headlines, track
│   topics, and receive morning briefings — all via MCP tools.
│
│   ## Available Tools
│   - news-headlines: Breaking news by country & category
│   - news-search: Full-text search with Boolean operators
│   - news-sources: Discover available news sources
│   - news-brief: Multi-category briefing (morning briefing)
│   - news-track: Media coverage trend analysis
│
│   ## Quick Start
│   POST apibase.pro/api/v1/discover {"query": "news headlines"}
│
│   ## Coverage
│   150,000+ sources, 55 countries, 14 languages
│   Categories: business, tech, science, health, sports, entertainment
│
├── capabilities.json
│   {
│     "provider": "newsapi",
│     "category": "news",
│     "subcategory": "current-events",
│     "tools_count": 5,
│     "read_auth_required": false,
│     "trade_auth_required": false,
│     "x402_enabled": true,
│     "x402_upstream": false,
│     "real_time": true,
│     "data_delay": "1-5 minutes",
│     "coverage": {
│       "sources": 150000,
│       "countries": 55,
│       "languages": 14
│     }
│   }
│
└── examples.md
    # Examples
    ## Top US headlines
    POST /api/v1/news/headlines {"country": "us", "category": "technology"}

    ## Search for topic
    POST /api/v1/news/search {"query": "artificial intelligence regulation"}

    ## Morning briefing
    POST /api/v1/news/brief {"country": "us", "categories": ["general", "business", "technology"]}

    ## Track media coverage
    POST /api/v1/news/track {"query": "OpenAI", "days": 7}
```

**Not published on GitHub:** API keys, upstream routing logic, caching strategy, source reliability tiers database, prefetch algorithm.

---

## 7. Traffic Flow Diagram

### Headlines Request (cached — most common)

```
AI Agent                    APIbase.pro                     NewsAPI.org
    │                           │                               │
    │── news-headlines ────────→│                               │
    │   country="us"            │                               │
    │   category="technology"   │                               │
    │   Authorization: Bearer...│                               │
    │                           │── Verify agent (OAuth 2.1) ──→│ (internal)
    │                           │── Check rate limit ──────────→│ (internal)
    │                           │── Check headline cache ──────→│ (internal)
    │                           │                               │
    │                           │   ✅ CACHE HIT! (5 min TTL)  │
    │                           │   (prefetched top-10 countries│
    │                           │    every 5 min)               │
    │                           │                               │
    │                           │   [enrich: add source tiers]  │
    │                           │   [enrich: dedup stories]     │
    │                           │   [charge x402: $0.005]       │
    │                           │   [upstream cost: $0.00!]     │
    │                           │                               │
    │←── 200 OK ────────────────│                               │
    │   [{                      │                               │
    │     title: "AI Chip...",  │                               │
    │     source: {name: "BBC", │                               │
    │       reliability: "tier1"│                               │
    │     },                    │                               │
    │     published_at: "2h ago"│                               │
    │   }, ...]                 │                               │
```

### Search Request (upstream call needed)

```
AI Agent                    APIbase.pro                     NewsAPI.org
    │                           │                               │
    │── news-search ───────────→│                               │
    │   query="SpaceX Starship" │                               │
    │   sort_by="publishedAt"   │                               │
    │                           │── Verify agent ──────────────→│ (internal)
    │                           │── Check search cache ────────→│ (internal)
    │                           │   Cache miss (unique query)   │
    │                           │                               │
    │                           │── GET /v2/everything ────────→│
    │                           │   ?q=SpaceX+Starship          │ newsapi.org
    │                           │   &sortBy=publishedAt          │
    │                           │   &pageSize=10                 │
    │                           │   X-Api-Key: BUSINESS_KEY      │
    │                           │←── 200 OK [articles] ────────│
    │                           │                               │
    │                           │   [normalize → news schema]   │
    │                           │   [enrich: source tiers]      │
    │                           │   [enrich: dedup clusters]    │
    │                           │   [cache result, TTL=15min]   │
    │                           │   [charge x402: $0.01]        │
    │                           │   [upstream cost: $0.0018]    │
    │                           │                               │
    │←── 200 OK ────────────────│                               │
    │   [{                      │                               │
    │     title: "SpaceX...",   │                               │
    │     source: {name:        │                               │
    │       "Reuters",          │                               │
    │       reliability: "tier1"│                               │
    │     },                    │                               │
    │     published_at: "...",  │                               │
    │     url: "https://..."    │                               │
    │   }, ...]                 │                               │
```

### Morning Briefing (composite — multiple upstream calls)

```
AI Agent                    APIbase.pro                     NewsAPI.org
    │                           │                               │
    │── news-brief ────────────→│                               │
    │   country="us"            │                               │
    │   categories=["general",  │                               │
    │    "business", "tech"]    │                               │
    │                           │── Verify agent ──────────────→│ (internal)
    │                           │                               │
    │                           │   For each category:          │
    │                           │   ├── Check cache ───────────→│
    │                           │   │   general: ✅ HIT         │
    │                           │   │   business: ✅ HIT        │
    │                           │   │   technology: ✅ HIT      │
    │                           │   │                           │
    │                           │   (all cached from prefetch!) │
    │                           │                               │
    │                           │   [merge 3 category feeds]    │
    │                           │   [dedup across categories]   │
    │                           │   [rank by importance/tier]   │
    │                           │   [select top 3 per category] │
    │                           │   [charge x402: $0.015]       │
    │                           │   [upstream cost: $0.00!]     │
    │                           │                               │
    │←── 200 OK ────────────────│                               │
    │   {                       │                               │
    │     briefing_date: "...", │                               │
    │     sections: [           │                               │
    │       {category:"general",│                               │
    │        stories: [...]},   │                               │
    │       {category:"business"│                               │
    │        stories: [...]},   │                               │
    │       {category:"tech",   │                               │
    │        stories: [...]}    │                               │
    │     ]                     │                               │
    │   }                       │                               │
```

---

## 8. Monetization Model

| Revenue Stream | Mechanism | Expected per Month |
|---------------|-----------|-------------------|
| **Headlines (cached/prefetched)** | $0.005/req. High cache hit from prefetch. | $250–2,500 |
| **Search** | $0.01/req. Upstream ~$0.0018/req. Cache 15 min. | $200–2,000 |
| **News Brief** | $0.015/req. Composite tool, served from cache. | $150–1,500 |
| **Track** | $0.02/req. Multiple upstream calls aggregated. | $50–500 |
| **Sources** | $0.001/req. Cached 24h. | $5–50 |

### Cost Structure

| Cost Item | Monthly | Notes |
|-----------|---------|-------|
| NewsAPI.org Business Plan | $449 | Fixed: 250,000 req/month included |
| Overage (if exceeded) | $0–$180 | $0.0018/req beyond 250K |
| **Total upstream cost** | **$449–629** | |
| **Expected revenue** | **$655–6,550** | |
| **Net margin** | **$206–5,921** | **31–90% margin** |

### Prefetch Economics

```
Prefetch strategy neutralizes fixed upstream cost:
──────────────────────────────────────────────────────────────

Prefetch budget:
  10 countries × 7 categories × 288 times/day (every 5 min) = 20,160 req/day
  Monthly: ~604,800 req → exceeds Business plan (250K)!

Optimized prefetch:
  Top 5 countries × 4 categories × 288/day = 5,760 req/day
  Monthly: ~172,800 req (69% of Business plan quota)
  Remaining for search: ~77,200 req/month

Cost per prefetched headline served:
  $449 / unlimited_downstream_requests → approaches $0.00
  Cache serves all headline/brief requests at 100% margin

Search queries (non-cached):
  77,200 available upstream req/month
  At $0.01/req downstream → $772 potential revenue
  At $0.0018/req upstream → already included in $449

Break-even:
  $449 / $0.01 per search = 44,900 search requests/month
  OR $449 / $0.005 per headline = 89,800 headline requests/month
  Combined: ~30,000-50,000 total requests for break-even
```

### Revenue Comparison Across All Use Cases

| UC | Provider | Revenue Model | Revenue/month | Upstream Cost | Margin |
|----|----------|--------------|--------------|---------------|--------|
| UC-001 | Polymarket | API fees + Builder | $100–1K | $0 | ~100% |
| UC-002 | Aviasales | Affiliate 40% | $200–2K | $0 | ~100% |
| UC-003 | Food Delivery | CPA + mixed | $500–5K | ~$200 | 60–96% |
| UC-004 | CoinGecko | x402 per-call | $370–3.7K | $129–329 | 52–91% |
| UC-005 | OpenWeatherMap | Pay-per-call + cache | $370–3.7K | $15–190 | 73–95% |
| **UC-006** | **NewsAPI.org** | **Subscription arbitrage + prefetch** | **$655–6.5K** | **$449–629** | **31–90%** |

**Key insight:** UC-006 — **самый высокий upstream cost** ($449/мес) среди всех UC, но также **самый высокий потенциальный revenue** ($6.5K/мес). Паттерн: фиксированная подписка → кэширование/prefetch → unlimited downstream → маржа растёт с объёмом.

---

## 9. Lessons Learned

### What works well about this integration

1. **News = completing the "holy trinity."** Weather (UC-005) + Crypto (UC-004) + News (UC-006) — три самых частых запроса AI агентов. APIbase теперь покрывает все три.

2. **Prefetch = transforming fixed cost into competitive advantage.** $449/мес выглядит дорого, но prefetch стратегия позволяет обслуживать headlines для 5+ стран с 100% маржой из кэша. Чем больше агентов — тем ниже per-request cost.

3. **Source reliability enrichment = real differentiation.** NewsAPI.org возвращает сырые статьи без оценки качества. APIbase добавляет source tier classification (tier1-tier4) — реальная ценность, которую сырой API не предоставляет.

4. **Morning briefing = killer agent use case.** `news-brief` — composite tool, который агенты будут вызывать ежедневно. Повторяемый, предсказуемый трафик. Стабильный daily revenue.

5. **Cross-UC synergy.** Новости дополняют каждый другой UC:
   - UC-001 (Polymarket): "Новости влияющие на prediction market"
   - UC-002 (Aviasales): "Travel warnings для destination"
   - UC-004 (CoinGecko): "Regulatory news влияющие на crypto prices"
   - UC-005 (OpenWeatherMap): "Extreme weather news context"

### Challenges identified

1. **Highest fixed upstream cost.** $449/мес — значительные расходы до первого клиента. Break-even: ~30-50K requests/month. Это риск при low adoption.

2. **Content truncation.** NewsAPI.org отдаёт первые ~200 символов контента на Business plan. Полный текст статьи недоступен — агент получает title + description + truncated content. Для полного текста нужен scraping URL (не через NewsAPI).

3. **ToS risk.** NewsAPI.org ToS запрещает "circumventing limits" и использование Developer plan в production. Business plan разрешает commercial use, но explicit wrapping/reselling не mentioned. APIbase должен позиционироваться как "value-added consumer", не как "API reseller".

4. **Competition from free alternatives.** Hacker News API (free, unlimited) и Wikipedia API (free, CC BY-SA) покрывают нишевые запросы. Агенты могут предпочесть бесплатные альтернативы для tech news.

5. **News fatigue.** AI агенты могут генерировать слишком много новостных запросов, перегружая quota. APIbase нужны per-agent daily limits и smart query dedup.

### Pattern: Subscription Arbitrage with Prefetch

```
Паттерн: Subscription Arbitrage + Prefetch
──────────────────────────────────────────────────────────
Условия применения:
  • Upstream провайдер предлагает фиксированную подписку
  • Данные обновляются регулярно и предсказуемо (новости каждые 5 мин)
  • Много агентов запрашивают одни и те же данные (top headlines)

Стратегия APIbase:
  1. Подписка на фиксированный план ($449/мес = 250K req)
  2. Prefetch популярных данных на регулярной основе
  3. Serve из кэша с 100% маржой на cached requests
  4. Search queries используют оставшуюся квоту
  5. Маржа растёт нелинейно с числом агентов

Экономика:
  1 агент:      $449 cost / $10 revenue   = убыток
  100 агентов:  $449 cost / $500 revenue  = 10% margin
  1000 агентов: $449 cost / $5,000 revenue = 91% margin

Применимо к:
  • Любые data feed подписки (news, market data, social media)
  • API с фиксированной ценой и предсказуемыми запросами
  • Категории с high cache hit ratio (headlines, trending)
```

### Pattern: Content Enrichment Layer

```
Паттерн: Content Enrichment
──────────────────────────────────────────────────────────
Концепция:
  • Upstream API возвращает сырые данные
  • APIbase добавляет metadata и analysis поверх
  • Enrichment создаёт value невозможный через прямой API доступ

Примеры enrichment (UC-006):
  • Source reliability tiers (tier1-tier4)
  • Story deduplication и clustering
  • Auto-categorization для /v2/everything (нет нативно)
  • Entity extraction (people, companies, locations)
  • Cross-referencing с другими UC (crypto mentions → UC-004)

Применимо к:
  • Любые контентные API (news, reviews, social)
  • API с "сырыми" данными без metadata
  • Категории где quality assessment = value
```

### Unique aspects of UC-006 vs previous use cases

| Aspect | UC-001 | UC-002 | UC-003 | UC-004 | UC-005 | **UC-006** |
|--------|--------|--------|--------|--------|--------|---------|
| Category | Crypto | Travel | Food | Finance | Weather | **News** |
| Upstream cost | $0 | $0 | ~$200 | $129–329 | $0–190 | **$449** |
| Cost model | Free | Free | Mixed | Sub+x402 | Pay-per-call | **Fixed sub** |
| Cache strategy | 30s TTL | Low cache | Low cache | 30s TTL | 2min TTL | **Prefetch!** |
| Value-add | Normalize | Affiliate | Routing | Bridge | Auto-geo | **Enrichment** |
| Cross-UC synergy | Low | Medium | Low | Low | High | **Very High** |
| Query frequency | Medium | Low | High | High | Very High | **Very High** |
| Break-even | 0 | 0 | ~$200 | ~65K req | 0 | **~35K req** |
| MCP tools | 8 | 7 | 6 | 9 | 7 | **5** |
