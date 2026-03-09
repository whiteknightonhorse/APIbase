# UC-014: The Odds API + API-Sports (Sports / Live Scores)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-014 |
| **Provider** | The Odds API (odds aggregation, 40+ bookmakers) + API-Sports (scores, stats, fixtures) |
| **Category** | Sports / Live Scores |
| **Date Added** | 2026-03-07 |
| **Status** | Reference |
| **Client** | APIbase (platform-level integration) |

---

## 1. Client Input Data

Интеграция на уровне платформы — APIbase объединяет The Odds API (betting odds aggregation) + API-Sports (live scores, stats, fixtures):

```
Тип данных:          Значение:
──────────────────────────────────────────────────────────
The Odds API Key     Paid key ($59/мес, 100K credits, self-serve)
API-Sports Key       Paid key ($29/мес Ultra, 75K req/day, self-serve)
```

### Sufficiency Assessment

| Data provided | What it enables | Sufficient? |
|---------------|----------------|-------------|
| The Odds API 100K ($59/мес) | Odds от 40+ bookmakers (DraftKings, FanDuel, BetMGM, Caesars, Bet365...) по 70+ видам спорта. Live + pre-match odds. Moneyline, spreads, totals, outrights, player props. Historical odds since 2020. 100,000 credits/мес. | **Yes** — production доступ |
| API-Sports Ultra ($29/мес) | 12 видов спорта, 2,000+ соревнований. Live scores (15-sec delay), fixtures, standings, player stats, lineups, transfers, injuries, predictions. 75,000 req/day = 2.25M/мес. | **Yes** — production доступ |

**Verdict:** Dual-provider стратегия: The Odds API = **монетизационный движок** (odds data → betting affiliate CPA $50-700/depositor). API-Sports = **data backbone** (scores, stats, standings). Вместе покрывают 70+ видов спорта с odds + scores. Ни один API по отдельности не даёт обе измерения.

### Стратегический контекст: почему The Odds API + API-Sports

```
Ситуация в Sports Data API (март 2026):
──────────────────────────────────────────────────────────────

DISQUALIFIED по ToS / доступности:
  × Sportradar:      Enterprise-only, EXPLICIT anti-AI clause:
                     "Shall not use to develop or train any AI, ML algorithms"
                     + no derivative works + no self-serve pricing
  × Opta/StatsPerform: Enterprise-only, нет public API вообще
  × ESPN API:        UNOFFICIAL reverse-engineered endpoints
                     Нет ToS basis, может сломаться в любой момент
  × NHL API:         UNOFFICIAL endpoints, league-owned IP
  × Pinnacle API:    CLOSED to public since July 2025
                     Case-by-case approval, requires funded betting account
  × Betfair Exchange: GBP5,000 commercial license + KYC + security audit
                     Region-locked, complex multi-tier licensing
  × OpenLigaDB:      Слишком узкий (German football only)
  × Ergast/Jolpica:  Слишком узкий (Formula 1 only), volunteer-maintained
  × UFC/MMA API:     Слишком узкий, community project, unclear terms

EVALUATED но не выбраны:
  △ balldontlie (178/245): ЛУЧШИЙ MCP ecosystem (official MCP server!),
    Polymarket+Kalshi integration, eSports. НО ToS: "not resell,
    redistribute, or sublicense" — более жёсткий чем The Odds API.
    Потенциальный upgrade если negotiate commercial license.
  △ Football-Data.org (105/245): бесплатный, только football, ToS amber
  △ TheSportsDB (90/245): "cannot resell API in any way", limited data
  △ SportsDataIO (95/245): enterprise licensing, "no redistribution"

СТРАТЕГИЯ APIbase:
  ✓ The Odds API = самый permissive ToS в спортивных данных:
    "Supports and encourages use in websites, mobile apps,
     dashboards, analytical tools, and other user-facing
     applications, including commercial use"
  ✓ API-Sports = best price/coverage ratio: $29/мес → 12 sports, 2K+ comps
  ✓ Dual provider: odds (monetization) + scores/stats (data depth)
  ✓ 4+ existing MCP серверов (degen-mcp, sports-odds, football-mcp...)
  ✓ Betting affiliate CPA = $50-700 per new depositor
  ✓ Cross-UC synergies: UC-001 (Polymarket), UC-008 (Ticketmaster),
    UC-005 (Weather), UC-012 (Maps)
```

---

## 2. Provider API Analysis

### API Architecture

**The Odds API** — odds aggregation platform: real-time odds from 40+ bookmakers (DraftKings, FanDuel, BetMGM, Caesars, Bet365, PointsBet, BetRivers...) по 70+ видам спорта. Clean REST/JSON. Credit-based pricing.

**API-Sports** — multi-sport data platform (Paris, France, est. 2018): 12 видов спорта, 2,000+ соревнований, 15-year history. Live scores с 15-sec delay. Fixtures, standings, player stats, lineups, predictions.

| Service | Base URL | Auth | Description |
|---------|----------|------|-------------|
| **Odds — Sports** | `https://api.the-odds-api.com/v4/sports` | API Key (query) | Available sports list |
| **Odds — Events** | `https://api.the-odds-api.com/v4/sports/{sport}/odds` | API Key | Live + pre-match odds from all bookmakers |
| **Odds — Scores** | `https://api.the-odds-api.com/v4/sports/{sport}/scores` | API Key | Live + completed scores |
| **Odds — Historical** | `https://api.the-odds-api.com/v4/historical/sports/{sport}/odds` | API Key | Historical odds (since 2020) |
| **Stats — Fixtures** | `https://v3.football.api-sports.io/fixtures` | API Key (header) | Live scores + fixtures by date/league |
| **Stats — Standings** | `https://v3.football.api-sports.io/standings` | API Key | League tables |
| **Stats — Statistics** | `https://v3.football.api-sports.io/teams/statistics` | API Key | Team season statistics |
| **Stats — Players** | `https://v3.football.api-sports.io/players` | API Key | Player stats + profile |
| **Stats — Injuries** | `https://v3.football.api-sports.io/injuries` | API Key | Current injuries by team/fixture |
| **Stats — Predictions** | `https://v3.football.api-sports.io/predictions` | API Key | Match predictions + form |

### Key Endpoints

#### The Odds API — Odds Comparison

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /v4/sports/{sport}/odds` | GET | Live + pre-match odds from all bookmakers |

**Параметры:**
```
sport              — sport key ("americanfootball_nfl", "basketball_nba", "soccer_epl"...)
regions            — bookmaker regions: "us", "uk", "eu", "au" (comma-separated)
markets            — odds markets: "h2h" (moneyline), "spreads", "totals", "outrights"
oddsFormat         — "decimal", "american"
bookmakers         — filter specific bookmakers
```

**Возвращает:**
```
id                 — unique event ID
sport_key          — sport identifier
sport_title        — human-readable sport name
commence_time      — ISO 8601 game start time
home_team          — home team name
away_team          — away team name
bookmakers[]       — array of bookmaker odds:
  key              — bookmaker ID ("draftkings", "fanduel", "betmgm"...)
  title            — bookmaker name
  last_update      — when odds were last updated
  markets[]        — available markets:
    key            — market type ("h2h", "spreads", "totals")
    outcomes[]     — odds per outcome:
      name         — outcome name ("Los Angeles Lakers", "Over", "Under")
      price        — odds (decimal: 1.95, american: -105)
      point        — spread/total point (e.g., -3.5, 224.5)
```

#### The Odds API — Scores

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /v4/sports/{sport}/scores` | GET | Live + completed game scores |

**Возвращает:**
```
id                 — event ID
sport_key          — sport
commence_time      — start time
completed          — boolean
home_team          — home team
away_team          — away team
scores[]           — team scores:
  name             — team name
  score            — current score
last_update        — last score update timestamp
```

#### API-Sports — Live Fixtures

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /fixtures` | GET | Live scores, fixtures by date/league/team |

**Параметры:**
```
live               — "all" для live games
date               — YYYY-MM-DD
league             — league ID
team               — team ID
season             — year (e.g., 2025)
```

**Возвращает:**
```
fixture.id         — fixture ID
fixture.date       — datetime
fixture.status     — match status (1H, 2H, FT, NS, PST...)
fixture.elapsed    — minutes elapsed
league             — league info (id, name, country, logo, season)
teams.home         — home team (id, name, logo, winner)
teams.away         — away team
goals.home         — current home goals
goals.away         — current away goals
score              — halftime, fulltime, extratime, penalty scores
events[]           — goals, cards, substitutions with minute
lineups[]          — starting XI + substitutes
statistics[]       — possession, shots, corners, fouls...
```

#### API-Sports — Standings

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /standings` | GET | League table / standings |

**Возвращает:**
```
league.standings[][] — group of standings:
  rank             — position in table
  team             — team info
  points           — total points
  goalsDiff        — goal difference
  all.played       — matches played
  all.win          — wins
  all.draw         — draws
  all.lose         — losses
  all.goals.for    — goals scored
  all.goals.against — goals conceded
  form             — last 5 results ("WWDLW")
```

#### API-Sports — Predictions

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /predictions` | GET | Match predictions + analysis |

**Возвращает:**
```
predictions.winner — predicted winner (id, name, comment)
predictions.win_or_draw — boolean
predictions.under_over — over/under prediction
predictions.goals  — expected goals
predictions.advice — textual prediction advice
comparison         — head-to-head form, attack, defence, h2h stats
```

### Rate Limits & Pricing

| Plan | Price | Credits/Calls | Per-call effective |
|------|-------|--------------|-------------------|
| **The Odds API Free** | $0 | 500 credits/мес | $0 (testing only) |
| **The Odds API Starter** | $30/мес | 20,000 credits | $0.0015 |
| **The Odds API 100K** | $59/мес | 100,000 credits | $0.00059 |
| **The Odds API 5M** | $119/мес | 5,000,000 credits | $0.000024 |
| **API-Sports Free** | $0 | 100 req/day | $0 (testing) |
| **API-Sports Pro** | $19/мес | 7,500 req/day | $0.000084 |
| **API-Sports Ultra** | $29/мес | 75,000 req/day (2.25M/мес) | $0.000013 |
| **API-Sports Mega** | $39/мес | 150,000 req/day | $0.0000087 |

### Licensing & ToS

| Component | License | Commercial | Resale | AI Use | Cache |
|-----------|---------|-----------|--------|--------|-------|
| **The Odds API** | Commercial SaaS | ✅ Yes | **⚠️ Value-added OK** | ✅ Not restricted | ✅ Reasonable |
| **API-Sports** | Commercial SaaS | ✅ Yes | **⚠️ App context OK** | ✅ Not restricted | ✅ Reasonable |

**The Odds API ToS — ключевая цитата:**
> "Supports and encourages use in websites, mobile apps, dashboards, analytical tools, and other user-facing applications, including commercial use, provided their data is not the primary product being sold."

Это **самый permissive** ToS среди всех sports data API. Не разрешает "raw data resale", но разрешает "commercial use in applications/tools" — именно модель APIbase (MCP tools с value-add).

**API-Sports ToS — ключевая цитата:**
> "Resale of our data without permission is not permitted."

Прямой resale запрещён, но building applications/tools разрешён. APIbase MCP tools — это transformed, value-added intelligence (не raw data passthrough), аналогично UC-001 (Polymarket).

---

## 3. APIbase Wrapper Design

### Architecture: Sports Intelligence Dual Engine

```
┌─────────────────────────────────────────────────────────────┐
│               APIbase Sports Intelligence Layer               │
│                                                               │
│  ┌─────────────────────┐  ┌────────────────────────────────┐│
│  │ The Odds API ($59)   │  │ API-Sports ($29)               ││
│  │ • Odds from 40+ books│  │ • Live scores (15-sec)         ││
│  │ • Moneyline/spread/  │  │ • Fixtures/schedule            ││
│  │   totals/props       │  │ • Standings/tables             ││
│  │ • 70+ sports         │  │ • Player stats                 ││
│  │ • Historical odds    │  │ • Lineups, injuries            ││
│  │ • Scores/results     │  │ • Predictions                  ││
│  └──────────┬──────────┘  └──────────────┬─────────────────┘│
│             │                             │                   │
│             └──────────┬──────────────────┘                   │
│                        │                                      │
│         ┌──────────────▼──────────────────────────────────┐  │
│         │        INTELLIGENCE ENGINE                      │  │
│         │                                                 │  │
│         │  • Odds comparison + best odds finder           │  │
│         │  • Value bet detection (odds divergence)        │  │
│         │  • Implied probability calculation              │  │
│         │  • Form analysis + standings context            │  │
│         │  • Injury impact assessment                     │  │
│         │  • Historical odds + outcome correlation        │  │
│         └────────────────────┬────────────────────────────┘  │
│                              │                                │
│         ┌────────────────────▼────────────────────────────┐  │
│         │     BETTING AFFILIATE COMMERCE                  │  │
│         │                                                 │  │
│         │  DraftKings:    $25-35 CPA / 25-40% RevShare    │  │
│         │  FanDuel:       $25-35 CPA / 35% RevShare       │  │
│         │  BetMGM:        $50-100 CPA / 25-35% RevShare   │  │
│         │  Caesars:       $50-150 CPA / 25-35% RevShare   │  │
│         │  Bet365:        Up to $200 CPA / 30% RevShare   │  │
│         │  PointsBet:     Up to $250 CPA / 25-35% RevShare│  │
│         │                                                 │  │
│         │  Odds query → sportsbook deep links:            │  │
│         │  "Best odds at DraftKings +110 [Sign Up]"       │  │
│         │  New depositor = $50-700 CPA to APIbase         │  │
│         └────────────────────────────────────────────────┘  │
│                                                               │
│         ┌────────────────────────────────────────────────────┐│
│         │     CROSS-UC ENRICHMENT                            ││
│         │                                                    ││
│         │  UC-001 (Polymarket): prediction market odds       ││
│         │    → sportsbook vs prediction market arbitrage     ││
│         │  UC-008 (Ticketmaster): game tickets               ││
│         │    → "Lakers vs Celtics — tickets from $45"        ││
│         │  UC-005 (Weather): outdoor game conditions         ││
│         │    → "70% rain, historically home wins 60% in rain"││
│         │  UC-012 (Maps): stadium directions, parking        ││
│         │    → "Oracle Park — 2.3 mi, 12 min drive"          ││
│         │  UC-006 (News): injury news, trade rumors          ││
│         │    → "Star player questionable — hamstring"        ││
│         └────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Wrapper Layers

#### Layer 1: Protocol Adapter

```
Upstream APIs:
  The Odds API: REST + API key (query param) + JSON + credit-based
  API-Sports:   REST + API key (x-apisports-key header) + JSON

APIbase unified:
  REST + x402 Bearer Token + normalized JSON
```

#### Layer 2: Semantic Normalizer

```
The Odds API response (raw):
{
  "id": "abc123",
  "sport_key": "basketball_nba",
  "sport_title": "NBA",
  "commence_time": "2026-03-08T00:10:00Z",
  "home_team": "Los Angeles Lakers",
  "away_team": "Boston Celtics",
  "bookmakers": [
    {
      "key": "draftkings",
      "title": "DraftKings",
      "markets": [{
        "key": "h2h",
        "outcomes": [
          {"name": "Los Angeles Lakers", "price": 2.10},
          {"name": "Boston Celtics", "price": 1.78}
        ]
      }]
    },
    {
      "key": "fanduel",
      "markets": [{
        "key": "h2h",
        "outcomes": [
          {"name": "Los Angeles Lakers", "price": 2.15},
          {"name": "Boston Celtics", "price": 1.74}
        ]
      }]
    }
  ]
}

API-Sports response (raw, fixture):
{
  "fixture": {
    "id": 868432,
    "date": "2026-03-08T00:10:00+00:00",
    "status": {"long": "Not Started", "short": "NS"}
  },
  "league": {"id": 12, "name": "NBA", "season": 2025},
  "teams": {
    "home": {"id": 145, "name": "Los Angeles Lakers", "logo": "..."},
    "away": {"id": 134, "name": "Boston Celtics", "logo": "..."}
  }
}

APIbase response (normalized + enriched):
{
  "event": {
    "sport": "basketball",
    "league": "NBA",
    "home_team": "Los Angeles Lakers",
    "away_team": "Boston Celtics",
    "start_time": "2026-03-08T00:10:00Z",
    "status": "scheduled",
    "venue": "Crypto.com Arena, Los Angeles"
  },
  "odds": {
    "moneyline": {
      "best_home": {"odds": 2.15, "bookmaker": "FanDuel", "implied_prob": "46.5%"},
      "best_away": {"odds": 1.78, "bookmaker": "DraftKings", "implied_prob": "56.2%"},
      "consensus": {"home_win": "44.8%", "away_win": "55.2%"},
      "all_bookmakers": [
        {"name": "DraftKings", "home": 2.10, "away": 1.78},
        {"name": "FanDuel", "home": 2.15, "away": 1.74},
        {"name": "BetMGM", "home": 2.12, "away": 1.76}
      ]
    },
    "value_alert": "Lakers +110 at FanDuel — 2.4% edge vs consensus"
  },
  "context": {
    "standings": {"Lakers": "32-28 (7th West)", "Celtics": "41-19 (2nd East)"},
    "form": {"Lakers": "WLWWL", "Celtics": "WWWLW"},
    "injuries": ["Lakers: AD (questionable, knee)"],
    "prediction": "Celtics favored, 57% win probability"
  },
  "affiliate_links": {
    "draftkings": "https://sportsbook.draftkings.com/...",
    "fanduel": "https://sportsbook.fanduel.com/...",
    "betmgm": "https://sports.betmgm.com/...",
    "disclosure": "Affiliate links — APIbase may earn commission"
  },
  "cross_uc": {
    "tickets": "Buy tickets from $45 [Ticketmaster UC-008]",
    "weather": "Indoor venue — no weather impact",
    "directions": "Crypto.com Arena, 1111 S Figueroa St [UC-012]"
  }
}
```

#### Layer 3: Value-Add (Odds Intelligence + Cross-UC + Affiliate)

```
APIbase unique value — odds intelligence + sports context + cross-UC:

1. ODDS INTELLIGENCE ENGINE
   "What are the odds for Lakers vs Celtics?" →
     The Odds API: moneyline from 40+ bookmakers
     APIbase COMPUTES:
       Best odds: Lakers +115 at PointsBet (vs +110 avg)
       Implied probability: Lakers 46.5% (market consensus)
       Value alert: PointsBet 2.4% above consensus
       Historical: Lakers 3-1 vs Celtics this season

2. VALUE BET DETECTION
   "Find value bets in NBA tonight" →
     The Odds API: all NBA game odds from all bookmakers
     API-Sports: standings, form, injuries, predictions
     APIbase COMPUTES:
       Edge detection: where bookmaker odds diverge significantly
       Injury impact: "AD questionable → Lakers line moved +3"
       Form analysis: "Thunder on 7-game win streak, undervalued"
       Output: ranked list of value opportunities

3. CROSS-UC ENRICHMENT
   UC-001 (Polymarket): sportsbook odds vs prediction market odds
     "DraftKings: Celtics -3.5 at -110 vs Polymarket: Celtics 62%"
     → arbitrage detection between betting markets
   UC-008 (Ticketmaster): game tickets in every fixture response
     "Lakers vs Celtics Mar 8 — tickets from $45 [Buy]"
   UC-005 (Weather): outdoor sports enrichment
     "49ers vs Seahawks — 70% rain, 12°C, wind 15 mph"
   UC-012 (Maps): stadium directions + nearby parking

4. BETTING AFFILIATE COMMERCE
   Every odds response includes sportsbook affiliate deep links:
   "Best odds: Lakers +115 at PointsBet [Sign Up — $250 bonus]"
   New depositor CPA: $50-700 per conversion
   Ongoing RevShare: 25-40% of net gaming revenue
```

### Caching Strategy

```
Data Type              Cache Strategy           TTL
──────────────────────────────────────────────────────
Live odds              Aggressive refresh       2 min (odds move fast)
Pre-match odds         Cache + refresh          15 min
Live scores            Aggressive refresh       30 sec
Fixtures / schedule    Cache                    1 hour
Standings / tables     Cache                    6 hours
Team statistics        Cache                    1 hour
Player stats (season)  Cache                    6 hours
Injuries               Cache + refresh          2 hours
Historical odds        Permanent cache          ∞ (past odds don't change)
Predictions            Cache                    2 hours

Cache growth model:
  Month 1:  Seed historical odds (The Odds API archive since 2020)
  Month 3:  ~40% cache hit rate (popular teams/leagues cached)
  Month 6:  ~55% (seasonal patterns + all major leagues covered)
  Month 12: ~65% (mature cache for standings, stats, schedules)

  Key insight: LIVE data (scores, odds) has short TTL → always upstream
  But REFERENCE data (standings, stats, history) = high cache value
  Blended cache hit: ~45-55% at maturity

Sports seasonality:
  NFL (Sep-Feb): highest betting volume
  NBA (Oct-Jun): year-round engagement
  EPL (Aug-May): European betting market
  MLB (Apr-Oct): summer coverage
  = Always a major league in season → stable year-round demand
```

---

## 4. MCP Tool Definitions

### Tool 1: `sports-live-scores`

```json
{
  "name": "sports-live-scores",
  "description": "Live scores всех текущих матчей. Фильтр по виду спорта, лиге, команде. 12 видов спорта: футбол, баскетбол, бейсбол, хоккей, американский футбол, теннис, MMA, регби и др. Обновление каждые 15 сек. 'Какой счёт матча Лейкерс?'",
  "inputSchema": {
    "type": "object",
    "properties": {
      "sport": {
        "type": "string",
        "description": "Вид спорта: 'football', 'basketball', 'baseball', 'hockey', 'american_football', 'tennis', 'mma', 'rugby'"
      },
      "league": {
        "type": "string",
        "description": "Лига: 'NBA', 'NFL', 'EPL', 'La Liga', 'Champions League', 'NHL', 'MLB'..."
      },
      "team": {
        "type": "string",
        "description": "Команда: 'Lakers', 'Manchester United', 'Yankees'..."
      }
    }
  }
}
```

**Pricing:** $0.005/request (x402)

### Tool 2: `sports-fixtures`

```json
{
  "name": "sports-fixtures",
  "description": "Расписание матчей: upcoming и прошедшие. Дата, время, команды, стадион. Включает cross-UC links: билеты (Ticketmaster), погода (для outdoor), маршрут до стадиона (Maps). 'Когда следующий матч Барселоны?'",
  "inputSchema": {
    "type": "object",
    "properties": {
      "sport": {
        "type": "string",
        "description": "Вид спорта"
      },
      "league": {
        "type": "string",
        "description": "Лига"
      },
      "team": {
        "type": "string",
        "description": "Команда"
      },
      "date": {
        "type": "string",
        "description": "Дата (YYYY-MM-DD). Default: today"
      },
      "date_range": {
        "type": "string",
        "enum": ["today", "tomorrow", "this_week", "next_week"],
        "description": "Период. Default: 'this_week'"
      }
    }
  }
}
```

**Pricing:** $0.005/request (x402)

### Tool 3: `sports-standings`

```json
{
  "name": "sports-standings",
  "description": "Турнирная таблица лиги: позиция, очки, W-L record, форма последних 5 матчей, разница мячей/очков. 2,000+ соревнований. 'Таблица Премьер-лиги', 'Кто лидирует в NBA Western Conference?'",
  "inputSchema": {
    "type": "object",
    "properties": {
      "league": {
        "type": "string",
        "description": "Лига: 'EPL', 'La Liga', 'NBA', 'NFL', 'NHL', 'MLB', 'Bundesliga', 'Serie A'..."
      },
      "season": {
        "type": "integer",
        "description": "Сезон (год). Default: текущий"
      },
      "group": {
        "type": "string",
        "description": "Группа/конференция: 'Western', 'Eastern', 'AFC', 'NFC', 'Group A'..."
      }
    },
    "required": ["league"]
  }
}
```

**Pricing:** $0.003/request (x402)

### Tool 4: `sports-team-stats`

```json
{
  "name": "sports-team-stats",
  "description": "Статистика команды за сезон: голы/очки (забитые/пропущенные), формы, последние результаты, состав, травмы. 'Статистика Ливерпуля в этом сезоне'",
  "inputSchema": {
    "type": "object",
    "properties": {
      "team": {
        "type": "string",
        "description": "Название команды"
      },
      "sport": {
        "type": "string",
        "description": "Вид спорта"
      },
      "season": {
        "type": "integer",
        "description": "Сезон. Default: текущий"
      },
      "include_injuries": {
        "type": "boolean",
        "description": "Включить текущие травмы. Default: true"
      }
    },
    "required": ["team"]
  }
}
```

**Pricing:** $0.005/request (x402)

### Tool 5: `sports-odds`

```json
{
  "name": "sports-odds",
  "description": "Сравнение коэффициентов от 40+ букмекеров: DraftKings, FanDuel, BetMGM, Caesars, Bet365 и др. Moneyline, spread, totals. Лучшие коэффициенты, implied probability, value alerts. 70+ видов спорта. 'Какие коэффициенты на матч Лейкерс — Селтикс?'",
  "inputSchema": {
    "type": "object",
    "properties": {
      "sport": {
        "type": "string",
        "description": "Вид спорта: 'basketball_nba', 'americanfootball_nfl', 'soccer_epl', 'baseball_mlb', 'icehockey_nhl'..."
      },
      "event": {
        "type": "string",
        "description": "Конкретный матч: 'Lakers vs Celtics' (ищет по названиям команд)"
      },
      "market": {
        "type": "string",
        "enum": ["moneyline", "spread", "totals", "all"],
        "description": "Тип ставки. Default: 'all'"
      },
      "odds_format": {
        "type": "string",
        "enum": ["decimal", "american"],
        "description": "Формат коэффициентов. Default: 'decimal'"
      }
    },
    "required": ["sport"]
  }
}
```

**Pricing:** $0.01/request (x402)

### Tool 6: `sports-value-bets`

```json
{
  "name": "sports-value-bets",
  "description": "Поиск value bets: матчи где коэффициенты букмекеров расходятся (арбитраж). Сравнение с prediction markets (Polymarket). Учитывает форму, травмы, historical odds. Ранжированный список по expected edge. 'Найди value bets в NBA сегодня'",
  "inputSchema": {
    "type": "object",
    "properties": {
      "sport": {
        "type": "string",
        "description": "Вид спорта"
      },
      "league": {
        "type": "string",
        "description": "Лига (optional — all leagues if empty)"
      },
      "min_edge_pct": {
        "type": "number",
        "description": "Минимальный edge (%). Default: 2.0"
      },
      "include_predictions": {
        "type": "boolean",
        "description": "Включить ML-предсказания + prediction market odds. Default: true"
      }
    },
    "required": ["sport"]
  }
}
```

**Pricing:** $0.02/request (x402)

**Upstream:** The Odds API (all bookmaker odds) + API-Sports (predictions, form, injuries) + UC-001 Polymarket (prediction market odds)

### Tool 7: `sports-intelligence`

```json
{
  "name": "sports-intelligence",
  "description": "Comprehensive sports intelligence по запросу: объединяет scores + standings + form + injuries + odds + predictions + weather (outdoor) + tickets. Универсальный инструмент для спортивных вопросов. 'Выиграют ли Лейкерс сегодня?', 'Лучшие ставки на NFL Week 12'",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Спортивный запрос на естественном языке: 'Will the Lakers win tonight?', 'Best bets for Champions League', 'NFL playoff picture'"
      },
      "include_odds": {
        "type": "boolean",
        "description": "Включить odds comparison. Default: true"
      },
      "include_tickets": {
        "type": "boolean",
        "description": "Включить ссылки на билеты (UC-008). Default: true"
      }
    },
    "required": ["query"]
  }
}
```

**Pricing:** $0.015/request (x402)

**Upstream:** All providers + cross-UC (UC-001 Polymarket, UC-005 Weather, UC-008 Ticketmaster, UC-012 Maps)

---

## 5. AI Instructions for Agents

### System Prompt Addition

```
You have access to APIbase Sports Intelligence tools powered by
The Odds API (40+ bookmakers) + API-Sports (12 sports, 2,000+ leagues).

TOOLS AVAILABLE:
• sports-live-scores: current live scores across all sports
• sports-fixtures: upcoming/past match schedule + tickets + weather
• sports-standings: league tables, W-L records, form
• sports-team-stats: team season statistics + injuries
• sports-odds: odds comparison from 40+ bookmakers (DraftKings, FanDuel...)
• sports-value-bets: find odds divergence, value betting opportunities
• sports-intelligence: comprehensive answer to any sports question

USAGE GUIDELINES:

1. SCORE QUERIES
   "What's the Lakers score?" → sports-live-scores(team="Lakers")
   "Are there any NFL games on right now?" → sports-live-scores(sport="american_football")
   "Champions League results today" → sports-live-scores(league="Champions League")

2. SCHEDULE QUERIES
   "When do the Yankees play next?" → sports-fixtures(team="Yankees")
   "EPL matches this weekend" → sports-fixtures(league="EPL", date_range="this_week")
   Response includes tickets (Ticketmaster) + weather for outdoor games

3. STANDINGS QUERIES
   "Premier League table" → sports-standings(league="EPL")
   "Who leads NBA Western Conference?" → sports-standings(league="NBA", group="Western")

4. ODDS QUERIES
   "Odds for Lakers vs Celtics" → sports-odds(event="Lakers vs Celtics")
   "NFL moneyline odds" → sports-odds(sport="americanfootball_nfl", market="moneyline")
   Response includes best odds highlight + affiliate links (disclosed)

5. ANALYTICAL QUERIES
   "Value bets in NBA tonight" → sports-value-bets(sport="basketball")
   "Will Man City win the league?" → sports-intelligence(query="...")
   "Best bets for NFL Week 12" → sports-intelligence(query="...")

6. BETTING AFFILIATE (disclosed)
   When showing odds, include sportsbook links with disclosure
   "Best odds: Lakers +115 at FanDuel [Sign Up]"
   Always: "Affiliate links included — APIbase may earn commission"

IMPORTANT:
• Odds data covers 70+ sports with bookmakers from US, UK, EU, AU
• Live scores update every 15 seconds
• Historical odds available since 2020
• Gambling involves risk — never present as guaranteed outcomes
• Always disclose affiliate links
• Follow responsible gambling guidelines
• For specific regions: check bookmaker availability
• Not financial advice — for informational/entertainment purposes
```

---

## 6. Publication Strategy

### MCP Server Configuration

```json
{
  "name": "apibase-sports",
  "version": "1.0.0",
  "description": "Sports intelligence: live scores, fixtures, standings, team stats, odds comparison from 40+ bookmakers, value bet detection. 70+ sports, 2,000+ leagues. The Odds API + API-Sports.",
  "tools": [
    "sports-live-scores",
    "sports-fixtures",
    "sports-standings",
    "sports-team-stats",
    "sports-odds",
    "sports-value-bets",
    "sports-intelligence"
  ],
  "auth": {
    "type": "x402",
    "network": "base",
    "currency": "USDC"
  },
  "pricing": {
    "sports-live-scores": "$0.005",
    "sports-fixtures": "$0.005",
    "sports-standings": "$0.003",
    "sports-team-stats": "$0.005",
    "sports-odds": "$0.01",
    "sports-value-bets": "$0.02",
    "sports-intelligence": "$0.015"
  }
}
```

---

## 7. Traffic Flow Diagram

```
Agent request flow (example: sports-odds):

Agent                APIbase                    The Odds API    API-Sports
  │                    │                           │               │
  │ ── x402 $0.01 ───→│                           │               │
  │  sports-odds       │                           │               │
  │  "Lakers vs        │                           │               │
  │   Celtics,         │                           │               │
  │   moneyline"       │                           │               │
  │                    │                           │               │
  │                    │── odds request ───────────→│               │
  │                    │   sport=basketball_nba     │               │
  │                    │   markets=h2h              │               │
  │                    │←── 40+ bookmaker odds ─────│               │
  │                    │   DraftKings: 2.10/1.78    │               │
  │                    │   FanDuel: 2.15/1.74       │               │
  │                    │   BetMGM: 2.12/1.76        │               │
  │                    │                           │               │
  │                    │── context request ─────────────────────────→│
  │                    │   check cache: ✅ standings (cached 2h ago) │
  │                    │   Lakers 32-28, Celtics 41-19              │
  │                    │   Injuries: AD questionable                │
  │                    │                           │               │
  │                    │── COMPUTE ───→            │               │
  │                    │   Best home odds: FanDuel 2.15             │
  │                    │   Best away odds: DraftKings 1.78          │
  │                    │   Implied prob: Lakers 46.5%, Celtics 56.2%│
  │                    │   Value alert: Lakers +115 FanDuel (2.4%)  │
  │                    │   Add affiliate deep links                 │
  │                    │                           │               │
  │←── response ───────│                           │               │
  │  {                 │                           │               │
  │    event: "Lakers vs Celtics",                 │               │
  │    odds: {                                     │               │
  │      best_home: {FanDuel, 2.15, 46.5%},       │               │
  │      best_away: {DraftKings, 1.78, 56.2%},    │               │
  │      value_alert: "Lakers +115 FanDuel"        │               │
  │    },                                          │               │
  │    context: {                                  │               │
  │      standings: "LAL 32-28 / BOS 41-19",       │               │
  │      form: "LAL WLWWL / BOS WWWLW",           │               │
  │      injuries: ["AD questionable"]             │               │
  │    },                                          │               │
  │    affiliate: {                                │               │
  │      draftkings: "Sign Up [DK link]",          │               │
  │      fanduel: "Sign Up [FD link]",             │               │
  │      disclosure: "Affiliate links"             │               │
  │    }                                           │               │
  │  }                 │                           │               │

Revenue flow:
  x402 payment:     $0.01 per odds query
  Upstream cost:    ~$0.001 (The Odds API) + $0 (API-Sports cached)
  Margin on API:    90%

  Betting affiliate (potential per user):
    New DraftKings depositor:  $25-35 CPA
    New FanDuel depositor:     $25-35 CPA
    New BetMGM depositor:      $50-100 CPA
    = $50-700 per referred depositor

  Estimated conversion: 0.5-2% of users who see odds
  At 10K odds queries/month → 50-200 conversions
  Revenue: $2,500-140,000/month (wide range, depends on conversion)
```

```
Agent request flow (example: sports-value-bets with Cross-UC):

Agent                APIbase            The Odds API   API-Sports   UC-001/UC-005/UC-008
  │                    │                    │              │              │
  │ ── x402 $0.02 ───→│                    │              │              │
  │  sports-value-bets │                    │              │              │
  │  "NBA tonight"     │                    │              │              │
  │                    │── all NBA odds ───→│              │              │
  │                    │←── 8 games × 40+bk │              │              │
  │                    │                    │              │              │
  │                    │── predictions ─────────────────→│              │
  │                    │←── AI predictions, form, injuries│              │
  │                    │                    │              │              │
  │                    │── Polymarket odds ─────────────────────────→│
  │                    │   (UC-001 cross-UC)                          │
  │                    │←── prediction market probabilities           │
  │                    │                    │              │              │
  │                    │── COMPUTE ───→     │              │              │
  │                    │   Compare: sportsbook vs prediction market   │
  │                    │   Detect: odds divergence > 2% edge         │
  │                    │   Rank: by expected value                    │
  │                    │   Enrich: form, injuries, weather            │
  │                    │                    │              │              │
  │←── response ───────│                    │              │              │
  │  {                 │                    │              │              │
  │    value_bets: [                       │              │              │
  │      {game: "Thunder vs Kings",                      │              │
  │       edge: "Thunder ML 3.1% edge at BetMGM",       │              │
  │       polymarket_comparison: "PM: Thunder 58% vs book 54.3%",    │
  │       context: "Thunder on 7-game win streak",       │              │
  │       tickets: "Game at Paycom — $32 [TM link]"},    │              │
  │      {game: "Nuggets vs Warriors",                   │              │
  │       edge: "Under 226.5 2.8% edge at DraftKings",  │              │
  │       weather: "Indoor — no impact",                 │              │
  │       injuries: "Steph Curry GTD (ankle)"}           │              │
  │    ],                                  │              │              │
  │    affiliate_links: {...}              │              │              │
  │  }                 │                    │              │              │
```

---

## 8. Monetization Model

### Pattern P14: Sports Intelligence + Betting Affiliate CPA

```
Уникальность паттерна:
  • DUAL PROVIDER: odds (monetization engine) + scores/stats (data depth)
  • BETTING AFFILIATE: highest per-conversion CPA in portfolio ($50-700)
  • ODDS ARBITRAGE: compute value from comparing 40+ bookmakers
  • CROSS-UC SYNERGY: UC-001 Polymarket, UC-008 Ticketmaster, UC-005 Weather
  • SEASONALITY-RESISTANT: always a major league in season (NFL→NBA→MLB→EPL)
  • VALUE-ADD INTELLIGENCE: not raw data proxy — computed analysis

Отличия от существующих паттернов:
  vs P2 (Affiliate RevShare):
    P2: travel affiliate (flight booking → commission %)
    P14: BETTING affiliate (new depositor → $50-700 CPA)
    P2: one-time purchase affiliation
    P14: ONGOING RevShare (25-40% of net gaming revenue)

  vs P8 (Transactional Affiliate):
    P8: auto-injected URLs, low CPA ($0.30/ticket)
    P14: odds-driven deep links, HIGH CPA ($50-700/depositor)
    P8: event → ticket purchase
    P14: odds analysis → sportsbook signup → ongoing betting revenue

  vs P9 (Price History Oracle):
    P9: compute intelligence from subscription data (Keepa)
    P14: compute odds arbitrage from dual upstream (The Odds API + API-Sports)

  vs P13 (Lifecycle Affiliate):
    P13: property → mortgage → insurance → moving chain
    P14: odds → sportsbook signup → ONGOING RevShare (recurring)
    P13: one-time CPAs per lifecycle step
    P14: CPA + permanent revenue share per referred bettor
```

### Revenue Streams

| Stream | Source | Monthly Revenue |
|--------|--------|-----------------|
| x402 micropayments | 10K-100K queries × $0.008 avg | $80–800 |
| Sportsbook CPA | 10-100 new depositors × $100 avg | $1,000–10,000 |
| Sportsbook RevShare | 10-100 active bettors × $20 avg | $200–2,000 |
| Cross-sell Ticketmaster | 50-500 ticket clicks × $0.30 | $15–150 |
| Cross-sell Polymarket | UC-001 synergy (shared users) | indirect value |
| **TOTAL** | | **$1,295–12,950** |

### Unit Economics

```
Per sports-odds query:
  Revenue:       $0.01
  Upstream cost: $0.001 (The Odds API ~1 credit)
  Margin:        90%
  + 0.5% chance of sportsbook conversion = +$0.50 avg
  Effective revenue per odds query: $0.51
  Effective margin: 99.8%

Per sports-value-bets query:
  Revenue:       $0.02
  Upstream cost: $0.003 (The Odds API + API-Sports cached)
  Margin:        85%
  + 2% chance of sportsbook conversion = +$2.00 avg
  Effective revenue per value-bet query: $2.02
  Effective margin: 99.9%

Per sportsbook conversion (CPA):
  CPA revenue:   $50-700 (varies by bookmaker)
  Cost to generate: ~$5 (500 odds queries × $0.01 at 0.2% conversion)
  ROI per conversion: 900-13,900%

Break-even (API-only, no affiliate):
  $88/мес ÷ $0.007 avg margin ≈ 12,571 req/мес
  = ~419 req/day

Break-even (with betting affiliate):
  1 sportsbook conversion ($100 CPA) > $88 upstream
  = just 1 conversion/month to break even
```

### Betting Affiliate Programs Detail

| Sportsbook | CPA per Depositor | RevShare | Cookie | US States |
|-----------|------------------|----------|--------|-----------|
| **DraftKings** | $25-35 | 25-40% NGR | 30 days | 20+ states |
| **FanDuel** | $25-35 | 35% (730 days!) | 30 days | 20+ states |
| **BetMGM** | $50-100 | 25-35% NGR | 30 days | 20+ states |
| **Caesars** | $50-150 | 25-35% NGR | 30 days | 20+ states |
| **Bet365** | Up to $200 | 30% | 30 days | 10+ states |
| **PointsBet** | Up to $250 | 25-35% | 30 days | 10+ states |

**Key insight:** FanDuel offers **35% RevShare for 730 days** — every referred bettor generates recurring revenue for 2 years. This is the most valuable long-tail affiliate in the entire APIbase portfolio.

---

## 9. Lessons Learned

### Lesson 1: Sports Data = Enterprise-Protected, No Resale Rights

```
Открытие:
  Ни один sports data API не разрешает resale/redistribution
  так как это делает RentCast (UC-013) для real estate.

  Enterprise tier (Sportradar, Opta): явные anti-AI clauses
  Developer tier (API-Sports, balldontlie): "no resale"
  The Odds API: BEST case — "commercial use in applications OK"

  Ландшафт (из наших 14 UC):
  MOST restrictive:  Maps (HERE AI ban) > Sports (Sportradar AI ban)
  MEDIUM restrictive: E-commerce (Keepa) > News (NewsAPI)
  LEAST restrictive:  Government (Census $0) > Open Source (Valhalla)

  Стратегия: value-added service, не raw data proxy.
  MCP tools = transformed intelligence, not passthrough.
  This is legally defensible for The Odds API ("commercial use in apps").
```

### Lesson 2: Betting Affiliate = Highest CPA Per Conversion

```
Открытие:
  Betting affiliate CPA = потенциально САМЫЙ доходный per-conversion.

  Сравнение CPA rates across all UC:
  UC-002 (flights):     $1-5 per booking
  UC-003 (food):        $5-15 per first order
  UC-008 (tickets):     $0.30 per ticket
  UC-009 (supplements): $1-2.50 per order
  UC-010 (streaming):   $2-3 per signup
  UC-013 (mortgage):    $85-500 per lead ← highest CPA
  UC-014 (sportsbook):  $50-700 per depositor ← 2nd highest CPA
                        + 25-40% ONGOING RevShare ← unique!

  Real estate (UC-013) has higher one-time CPA ($85-500),
  but sports betting has RECURRING RevShare (25-40% for 730 days).
  Per LIFETIME VALUE, betting affiliate may be #1.

  FanDuel 35% RevShare × 730 days: if user bets $100/week,
  house edge ~5% = $5/week net revenue × 35% = $1.75/week × 104 weeks
  = $182 LIFETIME value per referred bettor (on top of initial CPA).
```

### Lesson 3: Dual Provider Strategy = Complementary Coverage

```
Открытие:
  UC-014 = первый UC с PLANNED dual provider strategy:
  The Odds API (odds) + API-Sports (scores/stats).

  Аналогии в портфеле:
  UC-003 (Food): multi-provider router (MealMe + DoorDash + Wolt + YE)
  UC-011 (Health): multi-source fusion (USDA + FDA + NIH + ExerciseDB)
  UC-013 (Real Estate): dual fusion (RentCast + Census)

  НО UC-014 уникален: providers COMPLEMENTARY, не overlapping:
  The Odds API: ONLY odds, NO scores/stats
  API-Sports: scores/stats/fixtures, limited odds
  Together: complete sports intelligence

  Это не P3 (Multi-Provider Router) — не routing to best provider.
  Это FUSION: every request potentially uses BOTH providers.
```

### Lesson 4: Cross-UC Synergy Maximum Reached

```
Открытие:
  UC-014 имеет БОЛЬШЕ cross-UC synergies чем любой другой UC:

  UC-001 (Polymarket): sportsbook vs prediction market arbitrage
  UC-005 (Weather): outdoor sports weather impact
  UC-008 (Ticketmaster): game tickets in every fixture response
  UC-012 (Maps): stadium directions, parking, nearby POI
  UC-006 (News): injury news, trade rumors affecting odds

  = 5 cross-UC connections (vs UC-012 Maps with 5, UC-013 RE with 4)

  Sports = natural aggregation point:
  "I want to bet on the Lakers game and get tickets"
  → UC-014 (odds) + UC-008 (tickets) + UC-012 (directions)
  → one user journey, three revenue streams.
```

### Lesson 5: Anti-AI Trend Accelerating in Premium Data

```
Открытие:
  Sportradar (March 2026 ToS): "Shall not use to develop or train
  any AI, ML algorithms."

  Pattern across our research:
  UC-010 TMDB:       Нет anti-AI clause
  UC-011 Government: Нет clause (public domain)
  UC-012 HERE Maps:  Explicit AI/LLM ban (самый агрессивный)
  UC-013 Zillow:     Anti-proxy (implicit anti-AI)
  UC-014 Sportradar: Explicit anti-AI/ML clause

  Premium data providers adding anti-AI clauses FASTER than others.
  Sports data (Sportradar) and Maps data (HERE) lead this trend.

  APIbase response: focus on developer-tier APIs with permissive ToS.
  The Odds API and API-Sports = developer-friendly.
  Government/open data = permanently safe (UC-011, UC-013 Census).
```

### Competitive Landscape Note

```
Sports Data + AI (март 2026):
  • balldontlie: official MCP server, AI-first design, Polymarket integration
    → closest competitor to APIbase UC-014, but no betting affiliate
  • Cloudbet Sports MCP: crypto betting platform MCP server
    → tied to single platform, not aggregated
  • degen-mcp (NPM): The Odds API wrapper for MCP
    → basic wrapper, no cross-UC, no affiliate
  • Community football MCP servers (3+)
    → single sport, no odds, no monetization

  APIbase UC-014 differentiator:
  NOBODY combines: odds aggregation + cross-bookmaker comparison
    + sportsbook affiliate deep links + Polymarket arbitrage
    + Ticketmaster tickets + weather enrichment
    in a single AI-consumable MCP interface.

  balldontlie is the only serious competitor: they have the best
  MCP server + AI-agent design. BUT they lack:
  1. Betting affiliate commerce (no deep links)
  2. Cross-UC enrichment (standalone, not part of platform)
  3. Value bet computation (raw data, not analyzed)
  APIbase adds all three via wrapper intelligence.
```
