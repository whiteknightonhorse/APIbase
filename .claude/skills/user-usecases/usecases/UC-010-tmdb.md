# UC-010: TMDB (The Movie Database)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-010 |
| **Provider** | TMDB — The Movie Database (themoviedb.org) |
| **Category** | Movies & TV / Entertainment Discovery |
| **Date Added** | 2026-03-07 |
| **Status** | Reference |
| **Client** | APIbase (platform-level integration) |

---

## 1. Client Input Data

Интеграция на уровне платформы — APIbase подключает TMDB как upstream-провайдер:

```
Тип данных:          Значение:
──────────────────────────────────────────────────────────
TMDB API Key         API Read Access Token (v4 auth, бесплатный)
Commercial License   Written agreement с sales@themoviedb.org
```

### Sufficiency Assessment

| Data provided | What it enables | Sufficient? |
|---------------|----------------|-------------|
| Free API Key (v4 Bearer) | ~50 req/sec, no daily cap. Все endpoints: movies, TV, search, discover, trending, watch providers, people, images. | **Yes** — полноценный production доступ |
| Commercial Agreement | Юридическое разрешение на commercial use. TMDB исторически НЕ берёт плату ($0 за 10+ лет) но требует written agreement. | **Yes** — необходимо для APIbase |

**Verdict:** TMDB API полностью бесплатен для non-commercial use. Для APIbase нужен **commercial agreement** (email sales@themoviedb.org) — исторически $0, но формально требует подписания. Rate limits щедрые: ~50 req/sec, без дневного лимита. Это первый UC с **permanently cacheable metadata** — фильм "Inception" (2010) не меняется. Кэш = permanent → маржа стремится к 100%.

### Стратегический контекст: почему TMDB, а не streaming APIs

```
Ситуация в entertainment API (март 2026):
──────────────────────────────────────────────────────────────

DISQUALIFIED по ToS / цене:
  × OMDb:               "Personal use only", запрещает commercial
  × Rotten Tomatoes:    $60,000/year minimum
  × Letterboxd:         Запрещает AI/LLM use cases
  × JustWatch:          Нет public API, enterprise only

STREAMING APIs — ToS запрещает API proxy/resale:
  × movieofthenight:    "May not reshare/resell/redistribute"
  × Watchmode:          "May not resell... share with 3rd parties"

СТРАТЕГИЯ APIbase:
  ✓ TMDB = metadata + discovery + watch providers (from JustWatch)
  ✓ Free API, commercial agreement historically $0
  ✓ Watch providers: знает КАКОЙ сервис, в КАКОЙ стране — без deeplinks
  ✓ 4+ active MCP серверов (доказанный спрос)
  ✓ Community-maintained → always up-to-date
  ✓ Permanently cacheable metadata → margin → 100%
```

---

## 2. Provider API Analysis

### API Architecture

TMDB — крупнейшая community-maintained база фильмов и сериалов: **1,000,000+ фильмов**, **218,000+ TV shows**, **5,970,000+ TV episodes**. Community из 39 языков в 180+ странах. Используется как data source для тысяч приложений.

| Service | Base URL | Auth | Description |
|---------|----------|------|-------------|
| **Movies** | `https://api.themoviedb.org/3/movie/` | Bearer Token | Фильмы: детали, credits, images, videos, similar |
| **TV Shows** | `https://api.themoviedb.org/3/tv/` | Bearer Token | Сериалы: сезоны, эпизоды, cast |
| **Search** | `https://api.themoviedb.org/3/search/` | Bearer Token | Поиск: фильмы, TV, люди, multi |
| **Discover** | `https://api.themoviedb.org/3/discover/` | Bearer Token | Discovery с 30+ фильтрами |
| **Trending** | `https://api.themoviedb.org/3/trending/` | Bearer Token | Trending: day/week |
| **Watch Providers** | `https://api.themoviedb.org/3/movie/{id}/watch/providers` | Bearer Token | Где смотреть: streaming/rent/buy по странам |
| **People** | `https://api.themoviedb.org/3/person/` | Bearer Token | Актёры: filmography, images, bio |

### Key Endpoints

#### Movie Details

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /movie/{id}` | GET | Полные данные о фильме |

**Возвращает:**
```
title, original_title   — название (+ оригинал)
overview                — описание/синопсис
release_date            — дата релиза
runtime                 — длительность (минуты)
vote_average, vote_count — рейтинг TMDB (1-10) + количество голосов
genres                  — жанры [{id, name}]
production_companies    — студии
production_countries    — страны производства
spoken_languages        — языки
budget, revenue         — бюджет и сборы
poster_path, backdrop_path — постер, фон (URL)
tagline                 — слоган
status                  — Released, In Production, Post Production
popularity              — popularity score (TMDB метрика)
```

#### Movie Credits

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /movie/{id}/credits` | GET | Актёры и съёмочная группа |

**Возвращает:**
```
cast: [{name, character, profile_path, order}]
crew: [{name, job, department}]  — Director, Producer, Writer, etc.
```

#### Movie Videos

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /movie/{id}/videos` | GET | Трейлеры, тизеры, clips |

**Возвращает:**
```
results: [{
  key: "dQw4w9WgXcQ",   — YouTube/Vimeo key
  site: "YouTube",
  type: "Trailer",       — Trailer, Teaser, Clip, Behind the Scenes
  official: true
}]
```

#### Watch Providers

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /movie/{id}/watch/providers` | GET | Где смотреть (by country) |
| `GET /tv/{id}/watch/providers` | GET | Где смотреть (TV) |

**Возвращает (per country):**
```
results: {
  "US": {
    flatrate: [{provider_name: "Netflix", logo_path: "..."}],
    rent: [{provider_name: "Apple TV", logo_path: "..."}],
    buy: [{provider_name: "Amazon Video", logo_path: "..."}]
  },
  "DE": {
    flatrate: [{provider_name: "Disney Plus"}, {provider_name: "Netflix"}],
    ...
  }
}
```

**Важно:** Watch provider data sourced from JustWatch. URL'ы ведут на TMDB watch page, НЕ прямые deeplinks на streaming сервисы.

#### Discover (Discovery Engine)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /discover/movie` | GET | Поиск фильмов с 30+ фильтрами |
| `GET /discover/tv` | GET | Поиск сериалов с 30+ фильтрами |

**30+ фильтров:**
```
with_genres               — by genre ID(s)
with_cast                 — by actor ID(s)
with_crew                 — by director/writer ID(s)
with_keywords             — by keyword ID(s)
with_watch_providers      — by streaming service ID(s)
watch_region              — country for watch providers
primary_release_date.gte/lte — date range
vote_average.gte/lte      — rating range
vote_count.gte            — minimum votes
with_runtime.gte/lte      — duration range
with_original_language    — language filter
sort_by                   — popularity, revenue, vote_average, release_date
year / primary_release_year — specific year
certification             — age rating (PG, PG-13, R, etc.)
certification_country     — country for rating
include_adult             — true/false
```

#### Trending

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /trending/{type}/{window}` | GET | Trending movies/TV/people |

```
type: movie, tv, person, all
window: day, week
```

#### Search

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /search/multi` | GET | Поиск по всем типам (movie + TV + person) |
| `GET /search/movie` | GET | Поиск только фильмов |
| `GET /search/tv` | GET | Поиск только сериалов |
| `GET /search/person` | GET | Поиск людей |

#### Recommendations & Similar

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /movie/{id}/recommendations` | GET | Рекомендации на основе фильма |
| `GET /movie/{id}/similar` | GET | Похожие фильмы |

### Authentication Model

```
Bearer Token (v4):
  Header: Authorization: Bearer YOUR_ACCESS_TOKEN
  Получить: themoviedb.org → Settings → API → Create → Read Access Token

Альтернативно (v3, legacy):
  Query parameter: ?api_key=YOUR_API_KEY
```

### Rate Limits

| Metric | Limit |
|--------|-------|
| Requests/second | ~50 per IP |
| Requests/day | **No limit** |
| Simultaneous connections | 20 |
| Image hosting | Included (image.tmdb.org) |
| Cache retention | Max 6 months (per ToS) |

### Supported Languages

```
39 языков локализации:
  EN, RU, DE, FR, ES, PT, IT, NL, SV, NO, DA, FI, PL, CS, HU, RO,
  TR, EL, AR, HE, HI, BN, ZH, JA, KO, TH, VI, ID, MS, UK, BG, HR,
  SR, SK, SL, LT, LV, ET, KA

Каждый фильм может иметь локализованные:
  title, overview, tagline, poster, backdrop
```

### Existing MCP Servers

```
TMDB имеет 4+ active community MCP серверов:
  • Laksh-star/mcp-server-tmdb (GitHub)
  • rakeshgangwar/tmdb-mcp-server (GitHub)
  • tcehjaava/tmdb-mcp-server (GitHub)
  • XDwanj/tmdb-mcp (GitHub)

Ни один НЕ интегрирует:
  • x402 оплату
  • Watch providers с affiliate ссылками
  • Intelligent recommendations
  • Cross-UC integration
  • Permanent caching layer

APIbase wrapper добавляет всё это.
```

---

## 3. APIbase Wrapper Design

### Level 1: Protocol Adapter

```
What the adapter does:
──────────────────────────────────────────────────────────────
• Wraps 7 TMDB сервисов → unified entertainment interface
  apibase.pro/api/v1/movies/...

• Request routing:
  /movies/search        → tmdb /search/multi
  /movies/details       → tmdb /movie/{id} + /credits + /videos + /watch/providers
  /movies/discover      → tmdb /discover/movie
  /movies/trending      → tmdb /trending/movie/week
  /movies/similar       → tmdb /movie/{id}/recommendations
  /movies/person        → tmdb /person/{id} + /combined_credits
  /tv/search            → tmdb /search/tv
  /tv/details           → tmdb /tv/{id} + seasons + episodes

• Permanent caching (UNIQUE to UC-010):
  - Movie metadata: PERMANENT cache (title, year, cast never change)
  - TV show metadata: PERMANENT cache
  - Watch providers: 24 hour TTL (streaming catalog updates daily)
  - Trending: 1 hour TTL
  - Search results: 6 hour TTL
  - Images: PERMANENT (hosted on image.tmdb.org)

  Cache multiplier for permanent data:
    "Inception" queried by 1000 agents → 1 upstream call → FOREVER cached
    Margin on cached: 100%

  Over time, popular movies build up permanent cache:
    Month 1: 70% cache hit rate
    Month 6: 90% cache hit rate
    Month 12: 95%+ cache hit rate

• Smart aggregation:
  - Single API call to APIbase = multiple TMDB calls fused
  - /movies/details returns: metadata + credits + videos + watch providers
  - Agent gets ONE response instead of 4 API calls

• Streaming affiliate injection:
  - Watch providers return service names (Netflix, Amazon, Disney+)
  - APIbase adds affiliate signup URLs where available:
    Amazon Prime Video → amazon.com/prime?tag=apibase-21 (~$2-3 CPA)
    Other services → via affiliate networks (CJ, Impact)
  - Agent presents: "Available on Netflix | [Start Amazon Prime free trial]"

• Language-aware responses:
  - Agent requests in RU → TMDB returns Russian title/overview
  - 39 languages supported natively
  - Cross-UC: UC-007 DeepL for unsupported languages

• Error normalization:
  APIbase standard format:
  {"error": "movie_not_found", "message": "No movie matching query"}
  {"error": "movie_invalid_id", "message": "TMDB ID not found"}
```

### Level 2: Semantic Normalizer

**Domain model: `movie`**

```json
// === TMDB original (multiple endpoints aggregated) ===
{
  "id": 27205,
  "title": "Inception",
  "original_title": "Inception",
  "overview": "Cobb, a skilled thief...",
  "release_date": "2010-07-16",
  "runtime": 148,
  "vote_average": 8.369,
  "vote_count": 37234,
  "genres": [{"id": 28, "name": "Action"}, {"id": 878, "name": "Science Fiction"}],
  "poster_path": "/ljsZTbVsrQSqNgWeP2eIDgg0sq6.jpg"
}

// === APIbase normalized (movie schema) ===
{
  "provider": "tmdb",
  "movie_id": "apibase_mv_27205",
  "title": "Inception",
  "year": 2010,
  "tagline": "Your mind is the scene of the crime.",
  "overview": "Cobb, a skilled thief who commits corporate espionage...",
  "genres": ["Action", "Science Fiction", "Thriller"],
  "runtime_min": 148,
  "rating": {
    "tmdb": 8.4,
    "tmdb_votes": 37234
  },
  "cast": [
    {"name": "Leonardo DiCaprio", "character": "Cobb", "photo": "https://image.tmdb.org/..."},
    {"name": "Joseph Gordon-Levitt", "character": "Arthur", "photo": "..."},
    {"name": "Elliot Page", "character": "Ariadne", "photo": "..."}
  ],
  "director": "Christopher Nolan",
  "trailer": {
    "youtube_key": "YoHD9XEInc0",
    "youtube_url": "https://youtube.com/watch?v=YoHD9XEInc0"
  },
  "poster": "https://image.tmdb.org/t/p/w500/ljsZTbVsrQSqNgWeP2eIDgg0sq6.jpg",
  "backdrop": "https://image.tmdb.org/t/p/original/s3TBrRGB1iav7gFOCNx3H31MoES.jpg",
  "streaming": {
    "US": {
      "subscription": ["Netflix", "Peacock"],
      "rent": [{"service": "Apple TV", "price": "$3.99"}, {"service": "Amazon", "price": "$3.99"}],
      "buy": [{"service": "Apple TV", "price": "$14.99"}]
    },
    "DE": {
      "subscription": ["Netflix"],
      "rent": [{"service": "Amazon", "price": "€3.99"}]
    }
  },
  "affiliate": {
    "amazon_prime": "https://amazon.com/prime?tag=apibase-21",
    "note": "Start your free trial"
  },
  "similar": [
    {"title": "Interstellar", "year": 2014, "rating": 8.4, "id": "apibase_mv_157336"},
    {"title": "The Matrix", "year": 1999, "rating": 8.2, "id": "apibase_mv_603"}
  ],
  "timestamp": "2026-03-07T14:30:00Z"
}
```

### Level 3: Entertainment Intelligence & Value-Add

```
APIbase добавляет ценность поверх прямого TMDB API:
──────────────────────────────────────────────────────────────

1. Mood-based discovery:
   - Agent describes mood: "something thrilling but not too scary"
   - APIbase maps mood → genre + keyword combinations
   - Uses Discover API with smart filter presets:
     "date night" → Romance + Comedy, rating >7, recent
     "family movie night" → Family, certification PG, rating >6.5
     "mind-bending" → Sci-Fi + Thriller, keywords: "twist ending"

2. "Where to watch" enrichment:
   - TMDB shows service names; APIbase adds:
     → Affiliate signup links (Amazon Prime CPA)
     → Service pricing tiers (Netflix Basic/Standard/Premium)
     → Free trial availability
   - Agent: "Inception is on Netflix (you have it) and rent on Apple TV ($3.99)"

3. Smart aggregation:
   - One APIbase call = details + credits + trailer + watch providers + similar
   - Agent makes 1 request instead of 4-5 TMDB calls
   - Reduces agent complexity and latency

4. Trending intelligence:
   - Trending today + trending this week + upcoming releases
   - "Top 5 movies in theaters this weekend"
   - "Most anticipated movies next month"
   - Cross-reference with UC-006 news about movies

5. Filmography intelligence:
   - "All Christopher Nolan movies ranked by rating"
   - "Best Leonardo DiCaprio films available on Netflix"
   - Person → filtered filmography → streaming availability

6. Cross-UC enrichment:
   - UC-006 (News): "Latest reviews for [movie]"
   - UC-007 (DeepL): Translate overview to user's language
   - UC-008 (Events): Movie screenings/premieres nearby
   - UC-009 (Keepa): Blu-ray/DVD price on Amazon
```

---

## 4. MCP Tool Definitions

### Tool: movie-search

```json
{
  "name": "movie-search",
  "description": "Search for movies and TV shows by title. Returns matches with year, rating, overview, and poster. Searches 1M+ movies and 218K+ TV shows from TMDB — the world's largest community-maintained entertainment database.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Movie or TV show title to search for"
      },
      "type": {
        "type": "string",
        "enum": ["movie", "tv", "all"],
        "default": "all",
        "description": "Search movies, TV shows, or both"
      },
      "year": {
        "type": "integer",
        "description": "Filter by release year"
      },
      "language": {
        "type": "string",
        "default": "en",
        "description": "Response language (en, ru, de, fr, es, ja, etc.)"
      }
    },
    "required": ["query"]
  }
}
```

### Tool: movie-details

```json
{
  "name": "movie-details",
  "description": "Get full details for a movie or TV show: plot, cast, director, rating, trailer, poster, and where to watch (streaming/rent/buy by country). Combines 4 TMDB endpoints into one enriched response.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "id": {
        "type": "string",
        "description": "Movie/TV ID from search results, or TMDB numeric ID"
      },
      "country": {
        "type": "string",
        "default": "US",
        "description": "Country code for streaming availability (US, GB, DE, FR, etc.)"
      },
      "language": {
        "type": "string",
        "default": "en",
        "description": "Response language"
      }
    },
    "required": ["id"]
  }
}
```

### Tool: movie-discover

```json
{
  "name": "movie-discover",
  "description": "Discover movies with advanced filters: genre, rating, year, streaming service, cast, director, certification, and more. 30+ filters available. Perfect for 'find me a sci-fi movie from the 2020s rated above 7.5 on Netflix'.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "genre": {
        "type": "string",
        "description": "Genre: action, comedy, drama, horror, sci-fi, thriller, romance, animation, documentary, fantasy, mystery, crime, adventure, family, war, history, music, western"
      },
      "min_rating": {
        "type": "number",
        "description": "Minimum rating (1-10)"
      },
      "year_from": {
        "type": "integer",
        "description": "Earliest release year"
      },
      "year_to": {
        "type": "integer",
        "description": "Latest release year"
      },
      "streaming_service": {
        "type": "string",
        "description": "Filter by streaming service: netflix, amazon, disney, hbo, apple, hulu, paramount, peacock"
      },
      "country": {
        "type": "string",
        "default": "US",
        "description": "Country for streaming availability"
      },
      "cast": {
        "type": "string",
        "description": "Actor name to filter by"
      },
      "director": {
        "type": "string",
        "description": "Director name to filter by"
      },
      "certification": {
        "type": "string",
        "description": "Age rating: G, PG, PG-13, R, NC-17"
      },
      "sort": {
        "type": "string",
        "enum": ["popularity", "rating", "release_date", "revenue"],
        "default": "popularity"
      },
      "mood": {
        "type": "string",
        "description": "Mood preset: 'date_night', 'family', 'mind_bending', 'feel_good', 'dark', 'classic', 'hidden_gem'"
      },
      "type": {
        "type": "string",
        "enum": ["movie", "tv"],
        "default": "movie"
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

### Tool: movie-trending

```json
{
  "name": "movie-trending",
  "description": "Get trending movies and TV shows right now. Shows what's popular today or this week globally. Great for 'what should I watch?' and 'what's everyone watching?' queries.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "type": {
        "type": "string",
        "enum": ["movie", "tv", "all"],
        "default": "all"
      },
      "window": {
        "type": "string",
        "enum": ["day", "week"],
        "default": "week",
        "description": "Trending today or this week"
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

### Tool: movie-similar

```json
{
  "name": "movie-similar",
  "description": "Find movies similar to one you liked. Returns recommendations based on genres, themes, and viewing patterns. 'Movies like Inception', 'Shows similar to Breaking Bad'.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "title": {
        "type": "string",
        "description": "Movie or TV show title to find similar titles for"
      },
      "type": {
        "type": "string",
        "enum": ["movie", "tv"],
        "default": "movie"
      },
      "country": {
        "type": "string",
        "default": "US",
        "description": "Country for streaming availability in results"
      },
      "limit": {
        "type": "integer",
        "default": 10
      }
    },
    "required": ["title"]
  }
}
```

### Tool: movie-person

```json
{
  "name": "movie-person",
  "description": "Get filmography and info for an actor, director, or crew member. Shows all their movies/shows with ratings, sorted by popularity. 'All Christopher Nolan movies', 'What has Margot Robbie been in?'.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "description": "Person name (actor, director, writer)"
      },
      "role": {
        "type": "string",
        "enum": ["acting", "directing", "writing", "all"],
        "default": "all",
        "description": "Filter by role"
      },
      "sort": {
        "type": "string",
        "enum": ["popularity", "rating", "year"],
        "default": "popularity"
      },
      "limit": {
        "type": "integer",
        "default": 10
      }
    },
    "required": ["name"]
  }
}
```

### Tool: movie-where-to-watch

```json
{
  "name": "movie-where-to-watch",
  "description": "Find out where to watch a specific movie or TV show. Returns streaming services (Netflix, Disney+, etc.), rental options with prices, and purchase options — by country. 'Is Inception on Netflix in Germany?'.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "title": {
        "type": "string",
        "description": "Movie or TV show title"
      },
      "country": {
        "type": "string",
        "default": "US",
        "description": "Country code: US, GB, DE, FR, JP, CA, AU, IN, BR, etc."
      }
    },
    "required": ["title"]
  }
}
```

---

## 5. AI Instructions

```markdown
# TMDB Entertainment Discovery via APIbase — AI Agent Instructions

## When to Use
- User asks "What should I watch?"
- User asks about a specific movie/show ("Tell me about Inception")
- User asks "Is X on Netflix?" or "Where can I watch Y?"
- User asks for recommendations ("Movies like Interstellar")
- User asks about actors/directors ("Christopher Nolan filmography")
- User wants to discover ("Best sci-fi movies of 2025")
- User asks "What's trending right now?"
- User describes a mood ("something fun for a date night")
- User mentions any movie title, actor, or TV show

## Key Concepts
- TMDB = world's largest community-maintained movie/TV database
- 1,000,000+ movies, 218,000+ TV shows, 5,970,000+ episodes
- Watch providers: know which streaming service has a title, by country
- 39 languages natively supported
- Discover engine: 30+ filters for precise recommendations
- Ratings: TMDB score (1-10), community-maintained
- Billed per-request (not per-character)

## Recommended Call Chains

### "Tell me about Inception"
1. `movie-search` (query="Inception") → get ID
2. `movie-details` (id=..., country="US") → full info + streaming
3. Present: title, year, rating, plot, cast, director, trailer, where to watch

### "What should I watch tonight?"
1. `movie-trending` (window="week") → trending titles
2. Present: top 5 with rating, genre, streaming availability

### "Find me a sci-fi movie on Netflix rated above 8"
1. `movie-discover` (genre="sci-fi", min_rating=8, streaming_service="netflix")
2. Present: matching titles with ratings and posters

### "Movies like Inception"
1. `movie-similar` (title="Inception")
2. Present: similar movies with streaming availability

### "Is Oppenheimer on Netflix in Germany?"
1. `movie-where-to-watch` (title="Oppenheimer", country="DE")
2. Present: "Oppenheimer is available on [services] in Germany"

### "All Christopher Nolan movies"
1. `movie-person` (name="Christopher Nolan", role="directing", sort="rating")
2. Present: filmography table with year, rating, streaming

### "Date night movie suggestions"
1. `movie-discover` (mood="date_night")
2. Present: curated romantic comedies / light dramas

## Response Formatting
- Always show: title, year, rating, genres
- For details: include plot summary (2-3 sentences max)
- For lists: numbered list with rating and one-line hook
- Show poster when relevant (image URL)
- Streaming: "Available on: Netflix, Disney+ | Rent: Apple TV ($3.99)"
- Attribution: "Data from TMDB" (required by ToS)
- Trailer: include YouTube link when available

## Cross-UC Integration
Entertainment discovery combines with other APIbase services:

| UC | Integration |
|----|-------------|
| UC-006 NewsAPI | "Latest reviews for [movie]" — movie news |
| UC-007 DeepL | Translate overview/reviews to user's language |
| UC-008 Ticketmaster | Movie premieres and screenings nearby |
| UC-009 Keepa | Blu-ray/DVD price on Amazon |

## Limitations
- Watch providers: show SERVICE NAME but no direct deeplinks (JustWatch restriction)
- Ratings: TMDB community score only (no IMDb, Rotten Tomatoes scores)
- No ticket purchasing (use UC-008 Ticketmaster for screenings)
- No full review text (only vote average/count)
- Historical data only (no future schedules of streaming additions)
- Attribution required: "This product uses the TMDB API"

## Pricing via APIbase
- Movie search: $0.002/req via x402
- Movie details (full): $0.005/req via x402
- Discover: $0.005/req via x402
- Trending: $0.002/req via x402
- Similar/recommendations: $0.003/req via x402
- Person filmography: $0.003/req via x402
- Where to watch: $0.003/req via x402
- Free tier: 30 searches/month
```

---

## 6. Publication

### APIbase.pro Catalog Entry

```
URL: apibase.pro/catalog/entertainment/tmdb/
──────────────────────────────────────────────────────────────
Provider:       TMDB — The Movie Database
Website:        themoviedb.org
Category:       Movies & TV / Entertainment Discovery
Subcategories:  Movies, TV Shows, Streaming, Actors, Recommendations

Status:         Active ✅
MCP Tools:      7 tools (movie-search, movie-details, movie-discover,
                movie-trending, movie-similar, movie-person, movie-where-to-watch)
Formats:        MCP Tool Definition, OpenAPI 3.1, A2A Agent Card

Pricing:
  Movie search:     $0.002 per request via x402
  Movie details:    $0.005 per request via x402
  Discover:         $0.005 per request via x402

Authentication:  OAuth 2.1 via APIbase (agent registration required)
Coverage:        1,000,000+ movies, 218,000+ TV shows, 180+ countries
Languages:       39 languages natively
Streaming:       Watch provider info (Netflix, Disney+, etc.) by country
```

### GitHub Public Entry

```
github.com/apibase-pro/apibase/apis/entertainment/tmdb/
│
├── README.md
│   # TMDB — Movies & TV Discovery API
│   Discover movies, TV shows, actors, and where to watch.
│   1,000,000+ movies and 218,000+ TV shows from the world's
│   largest community-maintained entertainment database.
│
│   ## Available Tools
│   - movie-search: Search movies and TV shows by title
│   - movie-details: Full info + cast + trailer + streaming
│   - movie-discover: 30+ filters (genre, rating, year, service)
│   - movie-trending: What's popular today/this week
│   - movie-similar: Movies like X
│   - movie-person: Actor/director filmography
│   - movie-where-to-watch: Streaming availability by country
│
│   ## Quick Start
│   POST apibase.pro/api/v1/discover {"query": "movies recommendations"}
│
├── capabilities.json
│   {
│     "provider": "tmdb",
│     "category": "entertainment",
│     "tools_count": 7,
│     "read_auth_required": false,
│     "trade_auth_required": false,
│     "x402_enabled": true,
│     "movies": 1000000,
│     "tv_shows": 218000,
│     "languages": 39,
│     "streaming_providers": true,
│     "recommendations": true,
│     "trending": true
│   }
│
└── examples.md
    # Examples
    ## Search
    POST /api/v1/movies/search {"query": "Inception"}

    ## Details with streaming
    POST /api/v1/movies/details {"id": "27205", "country": "US"}

    ## Discover by mood
    POST /api/v1/movies/discover {"mood": "mind_bending", "min_rating": 7.5}

    ## Where to watch
    POST /api/v1/movies/where-to-watch {"title": "Oppenheimer", "country": "DE"}
```

**Not published on GitHub:** API keys, commercial agreement, affiliate URLs, caching strategy, mood-to-filter mapping, recommendation algorithms.

---

## 7. Traffic Flow Diagram

### Movie Details (permanently cached — 100% margin)

```
AI Agent                    APIbase.pro                     TMDB
    │                           │                               │
    │── movie-details ─────────→│                               │
    │   id="Inception"          │                               │
    │   country="US"            │                               │
    │   Authorization: Bearer...│                               │
    │                           │── Verify agent (OAuth 2.1) ──→│ (internal)
    │                           │── Resolve "Inception" → 27205 │ (internal)
    │                           │── Check cache ────────────────→│ (internal)
    │                           │   Metadata: PERMANENT HIT ✅   │
    │                           │   Watch providers: 18h old ✅   │
    │                           │   (24h TTL, still fresh)       │
    │                           │                               │
    │                           │   [No upstream call!]          │
    │                           │   [Serve entirely from cache]  │
    │                           │   [Margin: 100%]              │
    │                           │                               │
    │                           │   [add affiliate URLs]        │
    │                           │   [charge x402: $0.005]       │
    │                           │                               │
    │←── 200 OK ────────────────│                               │
    │   {                       │                               │
    │     title: "Inception",   │                               │
    │     year: 2010,           │                               │
    │     rating: 8.4,          │                               │
    │     director: "Nolan",    │                               │
    │     streaming: {US:       │                               │
    │       {sub: ["Netflix"]}},│                               │
    │     trailer: "youtube/..."│                               │
    │   }                       │                               │
```

### Discover (cache miss — upstream call)

```
AI Agent                    APIbase.pro                     TMDB
    │                           │                               │
    │── movie-discover ────────→│                               │
    │   genre="sci-fi"          │                               │
    │   min_rating=8            │                               │
    │   streaming_service=      │                               │
    │    "netflix"              │                               │
    │   country="US"            │                               │
    │                           │── Check cache: MISS ──────────│
    │                           │── Resolve "netflix" → 8 ─────→│ (provider ID)
    │                           │                               │
    │                           │── GET /discover/movie ────────→│
    │                           │   ?with_genres=878             │ api.themoviedb.org
    │                           │   &vote_average.gte=8          │
    │                           │   &with_watch_providers=8      │
    │                           │   &watch_region=US             │
    │                           │   &sort_by=popularity.desc     │
    │                           │←── 200 OK ────────────────────│
    │                           │   {results: [{id: 27205,       │
    │                           │     title: "Inception",...}]}  │
    │                           │                               │
    │                           │   [cache results: 6 hour TTL] │
    │                           │   [enrich with posters/trailers│
    │                           │    from permanent cache]       │
    │                           │   [add streaming affiliate]   │
    │                           │   [charge x402: $0.005]       │
    │                           │   [upstream cost: $0.000]     │
    │                           │   [margin: 100%]              │
    │                           │                               │
    │←── 200 OK ────────────────│                               │
    │   {movies: [              │                               │
    │     {title: "Inception",  │                               │
    │      year: 2010,          │                               │
    │      rating: 8.4,         │                               │
    │      poster: "https://.."}│                               │
    │   ]}                      │                               │
```

### Cross-UC: Movie Night Planning

```
AI Agent                    APIbase.pro
    │                           │
    │── "Plan a movie night     │
    │    with pizza delivery"   │
    │                           │
    │── movie-discover ────────→│   (UC-010)
    │   mood="date_night"       │
    │   streaming_service=      │
    │    "netflix"              │
    │←── [movie suggestions] ──│
    │                           │
    │── food-search ───────────→│   (UC-003)
    │   query="pizza delivery"  │
    │   near="user address"     │
    │←── [pizza options] ──────│
    │                           │
    │── weather-now ───────────→│   (UC-005)
    │   city="user city"        │
    │←── [rainy evening ☔] ────│
    │                           │
    │   Agent presents:         │
    │   "Perfect rainy movie    │
    │    night! Here's my pick: │
    │    🎬 La La Land (8.0)    │
    │       on Netflix          │
    │    🍕 Domino's 30 min     │
    │       delivery, $14.99"   │
```

---

## 8. Monetization Model

| Revenue Stream | Mechanism | Expected per Month |
|---------------|-----------|-------------------|
| **Movie search** | $0.002/req via x402. Permanently cached titles. | $50–500 |
| **Movie details** | $0.005/req via x402. Aggregated response (4 endpoints → 1). | $100–1,000 |
| **Discover** | $0.005/req via x402. 30+ filters. | $80–800 |
| **Trending** | $0.002/req via x402. Hourly cache. | $30–300 |
| **Similar/person/watch** | $0.002–0.003/req via x402. | $40–400 |
| **Streaming affiliate CPA** | Amazon Prime signup ~$2-3 CPA via Associates | $20–200 |

### Cost Structure

| Cost Item | Monthly | Notes |
|-----------|---------|-------|
| TMDB API | **$0** | Free (commercial agreement historically $0) |
| TMDB commercial license | **$0** | Written agreement required, no fee |
| **Total upstream cost** | **$0** | |
| **Expected revenue** | **$320–3,200** | API fees + affiliate CPA |
| **Net margin** | **$320–3,200** | **~100%** (no upstream cost!) |

### Permanent Cache Economics

```
Unique to UC-010: data that NEVER expires
──────────────────────────────────────────────────────────────

Permanently cacheable (never changes):
  Movie metadata:     title, year, overview, runtime, genres, budget
  Credits:            cast, director, writer
  Images:             posters, backdrops (hosted on image.tmdb.org)
  Videos:             trailer YouTube keys

Daily cache (24h TTL):
  Watch providers:    which services in which countries

Hourly cache (1h TTL):
  Trending:           what's popular now

Cache growth over time:
  Month 1:   ~10,000 popular movies cached permanently → 70% hit rate
  Month 6:   ~50,000 movies cached → 90% hit rate
  Month 12:  ~100,000 movies cached → 95% hit rate
  Month 24:  ~200,000 movies → 98% hit rate

Impact on margin:
  Month 1:   70% cache → ~85% margin (some upstream calls)
  Month 12:  95% cache → ~98% margin (rarely need upstream)
  Steady state: approaches 100% margin as cache builds

Compare with other UCs:
  UC-005 Weather: 2 min TTL → need fresh data constantly
  UC-006 News:    5 min prefetch → constant upstream calls
  UC-010 Movies:  PERMANENT → cache builds forever, costs → $0
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
| UC-009 | Keepa | Price intel subscription arbitrage | $270–2.7K | $53–497 | 51–90% |
| **UC-010** | **TMDB** | **Permanent cache + streaming CPA** | **$320–3.2K** | **$0** | **~100%** |

**Key insight:** UC-010 — первый UC с **permanent cache**. Метаданные фильмов не устаревают → кэш строится БЕСКОНЕЧНО → маржа стремится к 100% с каждым месяцем. В отличие от weather (2 min TTL) или news (5 min), movie "Inception" (2010) навсегда в кэше.

---

## 9. Lessons Learned

### What works well about this integration

1. **Permanent cache = compounding margin.** Метаданные фильмов — один из немногих типов данных, которые НИКОГДА не устаревают. "Inception" (2010) — title, cast, director, plot — неизменны навсегда. Каждый закэшированный фильм = один upstream call + бесконечные downstream responses. С каждым месяцем кэш растёт → маржа растёт → стремится к 100%.

2. **$0 upstream = pure profit.** TMDB API полностью бесплатный. Даже commercial license исторически $0. Upstream cost = $0 + permanent cache = margin approaching 100%. Один из лучших unit economics в портфолио.

3. **Enormous agent demand.** "What should I watch?" — один из самых частых вопросов пользователей. TMDB Discover с 30+ фильтрами может ответить на любую комбинацию: genre + rating + year + streaming service + cast + mood. Это **killer feature** для entertainment agents.

4. **4+ MCP серверов = доказанный спрос.** TMDB имеет больше community MCP серверов, чем любой другой провайдер в нашем портфолио. Это доказывает, что AI agents активно запрашивают movie/TV данные.

5. **Smart aggregation = value-add.** Agent вызывает 1 endpoint APIbase → получает data из 4 TMDB endpoints (details + credits + videos + watch_providers). Это упрощает работу агента и создаёт ценность, которой нет при прямом использовании TMDB.

### Challenges identified

1. **No deeplinks to streaming services.** Watch providers показывают ИМЯ сервиса (Netflix), но не дают прямую ссылку на фильм в Netflix. Это ограничение JustWatch. Агент может сказать "Inception is on Netflix" но не "click here to watch".

2. **No IMDb/Rotten Tomatoes scores.** TMDB имеет свой рейтинг (community), но не IMDb score и не Tomatometer. Для полной картины рейтингов нужны дополнительные sources (OMDb ToS запрещает commercial).

3. **Attribution required.** ToS требует: "This product uses the TMDB API but is not endorsed or certified by TMDB." Нужно включать в каждый ответ.

4. **Commercial agreement = manual step.** Нужно написать email на sales@themoviedb.org и получить written agreement. Исторически $0, но процесс не автоматизирован.

5. **Watch provider data = JustWatch dependency.** TMDB получает streaming data от JustWatch. Если JustWatch прекратит партнёрство, watch providers могут пропасть.

### Pattern: P10 — Permanent Cache + Downstream CPA

```
Паттерн: Permanent Cache + Downstream CPA
──────────────────────────────────────────────────────────
Условия применения:
  • Upstream API бесплатный
  • Данные PERMANENTLY cacheable (не устаревают)
  • Downstream commerce actions возможны (streaming signup)
  • Кэш строится бесконечно → маржа → 100% over time

Стратегия APIbase:
  1. Использовать бесплатный upstream API
  2. Кэшировать metadata permanently (no TTL)
  3. Обновлять только volatile data (watch providers: 24h, trending: 1h)
  4. Добавлять affiliate CPA links (streaming signups)
  5. Маржа начинается ~85% → grows to ~100% as cache builds

Отличие от P1 (Builder Key Proxy):
  P1: Данные кэшируются с коротким TTL (30s-5min)
  P10: Metadata кэшируется PERMANENTLY → cache grows forever
  P1: Margin стабильна ~100%
  P10: Margin GROWS over time (70% → 85% → 95% → ~100%)

Отличие от P5 (Cache Multiplier):
  P5: Weather кэш 2 min TTL → need constant upstream refresh
  P10: Movie кэш PERMANENT → one upstream call → forever cached
  P5: Multiplier stable (20x average)
  P10: Multiplier INFINITE (permanent data)

Отличие от P8 (Transactional Affiliate):
  P8: Affiliate = ticket purchase (one-time)
  P10: CPA = streaming signup (recurring subscription → higher LTV)
  P8: Auto-injected affiliate URLs
  P10: APIbase constructs CPA links

Применимо к:
  • TMDB (movies/TV — metadata permanent)
  • Потенциально: Wikipedia API (articles permanent)
  • Потенциально: MusicBrainz (music metadata permanent)
  • Потенциально: GeoNames (geographic data permanent)
  • Любой API с data that doesn't change over time
```

### Unique aspects of UC-010 vs previous use cases

| Aspect | UC-001 | UC-002 | UC-003 | UC-004 | UC-005 | UC-006 | UC-007 | UC-008 | UC-009 | **UC-010** |
|--------|--------|--------|--------|--------|--------|--------|--------|--------|--------|---------|
| Category | Crypto | Travel | Food | Finance | Weather | News | Translation | Events | E-commerce | **Movies/TV** |
| Type | Data | Data+booking | Data+ordering | Data | Data | Data | Transform | Data+commerce | Intelligence | **Discovery** |
| Upstream cost | $0 | $0 | ~$200 | $129–329 | $0–190 | $449 | $55–505 | $0 | $53–497 | **$0** |
| Revenue streams | 1 | 1 | 2 | 1 | 1 | 1 | 1 | 2 | 1 | **2 (fees+CPA)** |
| Cache TTL | 30s | Low | Low | 30s | 2min | 5min prefetch | No cache | 1h feed | 15-60min | **PERMANENT** |
| Margin (month 1) | ~100% | ~100% | 60% | 52% | 73% | 31% | 37.5% | ~100% | 51% | **~85%** |
| Margin (month 12) | ~100% | ~100% | 96% | 91% | 95% | 90% | 37.5% | ~100% | 90% | **~98%** |
| Value-add | Normalize | Deeplink | Routing | Bridge | Auto-geo | Enrichment | Quality | Price intel | Compute | **Aggregation+mood** |
| Data permanence | Low | Low | Low | Low | Low | Low | None | Medium | Medium | **PERMANENT** |
| MCP ecosystem | 0 | 0 | 0 | 0 | 0 | 0 | 1 (official) | 2 | 0 | **4+ (community)** |
| MCP tools | 8 | 7 | 6 | 9 | 7 | 5 | 6 | 7 | 7 | **7** |
| Cross-UC synergy | Low | Medium | Low | Low | High | Very High | Maximum | Very High | Medium | **High** |
