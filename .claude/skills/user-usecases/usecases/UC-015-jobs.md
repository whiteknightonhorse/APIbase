# UC-015: BLS + O*NET + ESCO + CareerJet (Jobs / Recruiting / Career Intelligence)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-015 |
| **Provider** | BLS (salary data) + O\*NET (occupation taxonomy) + ESCO (EU skills) + CareerJet (job listings + affiliate CPC) |
| **Category** | Jobs / Recruiting / Career Intelligence |
| **Date Added** | 2026-03-07 |
| **Status** | Reference |
| **Client** | APIbase (platform-level integration) |

---

## 1. Client Input Data

Интеграция на уровне платформы — APIbase объединяет 3 government/open data источника + 1 affiliate job aggregator:

```
Тип данных:          Значение:
──────────────────────────────────────────────────────────
BLS API Key          Free registration от api.bls.gov (мгновенный)
O*NET Credentials    Free registration от services.onetcenter.org
ESCO API             No key required (open data)
CareerJet            Affiliate publisher account (free registration)
```

### Sufficiency Assessment

| Data provided | What it enables | Sufficient? |
|---------------|----------------|-------------|
| BLS API v2 (free) | 830+ occupations: salary percentiles (10th/25th/50th/75th/90th), national/state/metro wages, employment projections, CPI cost-of-living. 500 queries/day for 50 series. | **Yes** — production доступ |
| O\*NET Web Services (free) | 900+ occupations: tasks, skills, knowledge, abilities, work values, technology proficiencies, career pathways. | **Yes** — production доступ |
| ESCO API (free) | EU occupations, skills, competences, qualifications. 27 языков. EUPL 1.2 license. | **Yes** — multilingual enrichment |
| CareerJet Publisher (free) | Millions of job listings globally. Built-in CPC affiliate: earn per click on apply links. 2-tier affiliate (10% of sub-affiliates). | **Yes** — monetization engine |

**Verdict:** Четырёхсторонняя стратегия: **BLS** = authoritative US salary data (public domain, $0), **O\*NET** = occupation intelligence taxonomy (free, conditional), **ESCO** = EU skills mapping (EUPL, $0), **CareerJet** = job listings + **affiliate CPC revenue engine** (единственный job API DESIGNED for redistribution). Upstream cost = **$0**. Третий UC с полностью бесплатным upstream (после UC-011 Health, UC-010 TMDB).

### Стратегический контекст: почему BLS + O*NET + ESCO + CareerJet

```
Ситуация в Jobs / Recruiting API (март 2026):
──────────────────────────────────────────────────────────────

DISQUALIFIED по ToS / доступности:
  × Indeed API:      DEPRECATED, "not available for new integrations"
  × LinkedIn Jobs:   "Currently not accepting new partnerships"
                     + "may not make API available to any third party"
  × Glassdoor:       Partner-only, "not provided publicly"
  × Monster API:     DEPRECATED
  × Levels.fyi:      "Use site data to train any AI or ML" — BANNED
                     + "shall not commercially exploit the Services"
  × Apollo.io:       "may not sublicense, sell, or distribute the APIs"
                     "solely for your internal business purposes"
  × The Muse:        "will not sublicense, transfer, distribute,
                     lease, loan, sell or otherwise make available the API"
  × Reed.co.uk:      "shall not resell any Services"
  × USAJobs:         "may not rent, lease, loan, sell, trade or create
                     derivative works of USAJOBS API services and data"
  × Himalayas:       "must not be on-sold or supplied to third parties"
  × PayScale:        Enterprise-only, no public redistribution
  × Crunchbase:      Enterprise licensing required
  × Clearbit:        HubSpot-integrated, enterprise model
  × Greenhouse/Lever/Workable: Customer-only ATS APIs
  × Comparably:      No public API exists

EVALUATED но не выбраны как primary:
  △ Adzuna (185/245):       Rich salary analytics, 12 countries, existing MCP.
                            НО ToS requires "written consent" for aggregated use.
                            Potential Phase 2 upgrade с reseller agreement.
  △ JSearch (175/245):      Meta-aggregator (LinkedIn, Indeed, Glassdoor).
                            Upstream data sources have restrictive ToS — legal gray.
  △ RemoteOK (151/245):     Free но $10K/mo for premium API. Must link back.
  △ Jooble (145/245):       69 countries но unclear redistribution terms.

СТРАТЕГИЯ APIbase:
  ✓ BLS = US Government PUBLIC DOMAIN data. Нет copyright.
    "BLS material is free to use without specific permission."
    830 occupations × national/state/metro wages × percentiles.
    THE authoritative US salary data source.
  ✓ O*NET = US DOL occupation taxonomy. 900+ occupations.
    Skills, abilities, knowledge, tasks, technology proficiency.
    Conditional ToS: must provide free version alongside paid.
  ✓ ESCO = EU Commission open data (EUPL 1.2).
    27 languages × skills × competences × qualifications.
    Free for ALL commercial redistribution.
  ✓ CareerJet = DESIGNED for redistribution (affiliate model).
    Every apply click = CPC revenue to APIbase.
    2-tier affiliate: 10% of sub-affiliate earnings.
    Единственный job API чья бизнес-модель = redistribution.
```

---

## 2. Provider API Analysis

### API Architecture

**BLS (Bureau of Labor Statistics)** — US Government official wage and employment data. 830+ occupations with percentile wages (10th/25th/50th/75th/90th) at national, state, and metro levels. Employment projections (10-year). CPI (Consumer Price Index) for cost-of-living. Public domain, $0.

**O\*NET (Occupational Information Network)** — US DOL occupation taxonomy. 900+ occupations with tasks, skills (35 elements), knowledge (33 elements), abilities (52 elements), work values, technology skills. Used by every HR system in the US.

**ESCO (European Skills/Competences/Qualifications)** — EU Commission standardized taxonomy. 3,008 occupations, 13,890 skills/competences, 8 transversal skills. Available in 27 EU languages.

**CareerJet** — global job search aggregator. Millions of listings across multiple countries. Built-in affiliate CPC model for publishers.

| Service | Base URL | Auth | Description |
|---------|----------|------|-------------|
| **BLS OEWS** | `https://api.bls.gov/publicAPI/v2/timeseries/data/` | API Key (header) | Occupational Employment and Wage Statistics |
| **BLS CPI** | `https://api.bls.gov/publicAPI/v2/timeseries/data/` | API Key | Consumer Price Index (cost of living) |
| **BLS Projections** | `https://api.bls.gov/publicAPI/v2/timeseries/data/` | API Key | Employment projections (10-year) |
| **O\*NET Search** | `https://services.onetcenter.org/ws/online/search` | Basic Auth | Search occupations by keyword |
| **O\*NET Details** | `https://services.onetcenter.org/ws/online/occupations/{code}` | Basic Auth | Full occupation profile |
| **ESCO Occupations** | `https://ec.europa.eu/esco/api/resource/occupation` | None | EU occupation data |
| **ESCO Skills** | `https://ec.europa.eu/esco/api/resource/skill` | None | EU skills taxonomy |
| **CareerJet Search** | `https://public.api.careerjet.net/search` | Affiliate ID | Job listings with CPC links |

### Key Endpoints

#### BLS OEWS (Salary Data)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /publicAPI/v2/timeseries/data/` | POST | Wage data by occupation × geography |

**Series ID format:**
```
OEUM [area_code] [industry_code] [occupation_code] [data_type]

Examples:
OEUM003610000000015-0000003  — New York metro, all industries, all occupations, annual mean
OEUM000000000000015-1300003  — National, software developers, annual mean
```

**Data types:**
```
01 — Employment
03 — Hourly mean wage
04 — Annual mean wage
07 — Hourly 10th percentile
08 — Hourly 25th percentile
09 — Hourly median (50th)
10 — Hourly 75th percentile
11 — Hourly 90th percentile
12 — Annual 10th percentile
13 — Annual 25th percentile
14 — Annual median (50th)
15 — Annual 75th percentile
16 — Annual 90th percentile
```

**Возвращает:**
```
seriesID           — series identifier
year               — data year (e.g., 2024)
period             — "A01" (annual)
value              — wage value ($)
```

#### O*NET — Occupation Details

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /ws/online/occupations/{code}` | GET | Full occupation profile |
| `GET /ws/online/occupations/{code}/summary/skills` | GET | Skills for occupation |
| `GET /ws/online/occupations/{code}/summary/knowledge` | GET | Knowledge areas |
| `GET /ws/online/occupations/{code}/summary/abilities` | GET | Required abilities |
| `GET /ws/online/occupations/{code}/summary/technology_skills` | GET | Technology proficiencies |
| `GET /ws/online/occupations/{code}/summary/tasks` | GET | Typical job tasks |

**O\*NET Code format:**
```
15-1252.00 — Software Developers
13-2011.00 — Accountants and Auditors
29-1141.00 — Registered Nurses
11-1021.00 — General and Operations Managers
```

**Возвращает (skills example):**
```
element[]          — skill elements:
  id               — skill code (e.g., "2.A.1.a")
  name             — skill name ("Reading Comprehension")
  description      — skill description
  score.value      — importance rating (0-100)
  score.scale      — "Importance" or "Level"
```

#### CareerJet — Job Search

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /search` | GET | Search job listings with affiliate links |

**Параметры:**
```
keywords           — search terms ("software developer")
location           — city, state, country ("New York, NY")
sort               — "relevance" or "date"
page               — pagination
contracttype       — "p" (permanent), "c" (contract), "t" (temporary)
contractperiod     — "f" (full-time), "p" (part-time)
```

**Возвращает:**
```
jobs[]             — job listings:
  title            — job title
  company          — company name
  locations        — job location
  description      — job description snippet
  salary           — salary range (when available)
  date             — posting date
  url              — AFFILIATE apply link (generates CPC revenue)
```

### Rate Limits & Pricing

| Plan | Price | Limits | Per-call effective |
|------|-------|--------|-------------------|
| **BLS v2 (registered)** | $0 | 500 queries/day for 50 series, 20 years | $0.00 |
| **BLS v1 (unregistered)** | $0 | 25 queries/day | $0.00 |
| **O\*NET** | $0 | Reasonable use (no hard limit documented) | $0.00 |
| **ESCO** | $0 | No hard limit documented | $0.00 |
| **CareerJet** | $0 | 1000 req/hr | $0.00 + affiliate CPC revenue |

### Licensing & ToS

| Component | License | Commercial | Resale | AI Use | Cache |
|-----------|---------|-----------|--------|--------|-------|
| **BLS Data** | US Government Public Domain | ✅ Yes | **✅ Explicitly Yes** | ✅ Yes | ✅ Permanent |
| **O\*NET** | US DOL Free Use | ✅ Yes (conditional) | **⚠️ Must offer free tier** | ✅ Yes | ✅ Quarterly refresh |
| **ESCO** | EUPL 1.2 / Apache 2.0 | ✅ Yes | **✅ Open redistribution** | ✅ Yes | ✅ Bulk download |
| **CareerJet** | Affiliate Publisher | ✅ Yes (affiliate) | **✅ Designed for it** | ✅ Not restricted | ✅ Reasonable |

**BLS ToS — ключевая цитата:**
> "BLS material, except where otherwise noted, is in the public domain and may be reproduced without permission."

**O\*NET ToS — ключевое условие:**
> "Developers of paid or registration-required applications must obtain permission from the Center before including information in any non-freely-available release, UNLESS information is also available from a free, publicly accessible application."

APIbase решение: предоставить бесплатный tier (первые N запросов/мес бесплатно) наряду с paid x402 tier → полностью соответствует O\*NET conditions.

**CareerJet — бизнес-модель:**
> API designed for publishers. Every job listing URL contains affiliate tracking. Click → CPC revenue to APIbase.

---

## 3. APIbase Wrapper Design

### Architecture: Career Intelligence Fusion

```
┌─────────────────────────────────────────────────────────────┐
│               APIbase Career Intelligence Layer               │
│                                                               │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────┐│
│  │ BLS ($0)          │  │ O*NET ($0)        │  │ ESCO ($0)  ││
│  │ • Salary percentls│  │ • Skills taxonomy │  │ • EU skills ││
│  │ • State/metro     │  │ • Abilities       │  │ • 27 langs ││
│  │ • Projections     │  │ • Knowledge       │  │ • Qualifs  ││
│  │ • CPI/cost of life│  │ • Tasks           │  │ • Competens││
│  │ • 830 occupations │  │ • Technology      │  │ • 3K occups││
│  └────────┬─────────┘  └────────┬─────────┘  └─────┬──────┘│
│           │                      │                   │        │
│           └──────────┬───────────┴───────────────────┘        │
│                      │                                        │
│         ┌────────────▼─────────────────────────────────┐     │
│         │        INTELLIGENCE ENGINE                    │     │
│         │                                               │     │
│         │  • Salary lookup by occupation × location     │     │
│         │  • Salary comparison across cities (COL adj)  │     │
│         │  • Skills gap analysis (current → target)     │     │
│         │  • Career path recommendation                 │     │
│         │  • Hiring trends + employment projections     │     │
│         │  • Compensation benchmarking (B2B compliance) │     │
│         └──────────────────┬────────────────────────────┘     │
│                            │                                  │
│  ┌─────────────────────────▼─────────────────────────────┐   │
│  │ CareerJet ($0 + CPC revenue)                           │   │
│  │ • Job search: millions of listings globally             │   │
│  │ • Every "Apply" URL = affiliate CPC click               │   │
│  │ • Revenue: $0.10-0.50 per apply click                   │   │
│  │ • 2-tier affiliate: +10% of sub-affiliate earnings      │   │
│  └─────────────────────────┬─────────────────────────────┘   │
│                            │                                  │
│         ┌──────────────────▼────────────────────────────┐    │
│         │     CAREER SERVICES AFFILIATE FUNNEL          │    │
│         │                                               │    │
│         │  Underpaid detected → job search → resume:    │    │
│         │                                               │    │
│         │  Resume writing:   TopResume ($60-140, 20-30%)│    │
│         │  Interview prep:   Various ($20-50, 15-30%)   │    │
│         │  Online courses:   Coursera/Udemy (15-45%)    │    │
│         │  Certifications:   Various ($50-200, 10-20%)  │    │
│         │  Career coaching:  Various ($50-200, 10-20%)  │    │
│         │                                               │    │
│         │  Skills gap → "Learn Python" → Coursera link  │    │
│         │  Underpaid → "Here are 10 better jobs" → CPC  │    │
│         │  New job → relocation → UC-012 + UC-013       │    │
│         └────────────────────────────────────────────────┘   │
│                                                               │
│         ┌────────────────────────────────────────────────────┐│
│         │     CROSS-UC ENRICHMENT                            ││
│         │                                                    ││
│         │  UC-007 (Translation): multilingual job search     ││
│         │    → ESCO 27-language taxonomy + DeepL descriptions││
│         │  UC-012 (Maps): commute analysis                   ││
│         │    → "This job: 45 min commute from your home"     ││
│         │  UC-013 (Real Estate): relocation housing          ││
│         │    → "Moving for job? Median rent $1,850 in Denver"││
│         │  UC-006 (News): layoff/hiring news                 ││
│         │    → "Tech layoffs: 5K open roles at hiring firms" ││
│         │  UC-008 (Events): career fairs, networking         ││
│         │    → "Data Science meetup near you Thursday"        ││
│         └────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Wrapper Layers

#### Layer 1: Protocol Adapter

```
Upstream APIs:
  BLS:       REST + API key (header) + JSON + series ID system
  O*NET:     REST + Basic Auth + XML/JSON + SOC codes
  ESCO:      REST + no auth + JSON-LD/SKOS + URI-based
  CareerJet: REST + affiliate ID (query param) + JSON

APIbase unified:
  REST + x402 Bearer Token + normalized JSON
```

#### Layer 2: Semantic Normalizer

```
BLS response (raw):
{
  "Results": {
    "series": [{
      "seriesID": "OEUM000000000000015-1252004",
      "data": [{"year": "2024", "period": "A01", "value": "130270"}]
    }]
  }
}

O*NET response (raw):
{
  "code": "15-1252.00",
  "title": "Software Developers",
  "skills": [
    {"id": "2.A.1.f", "name": "Complex Problem Solving", "score": {"value": "81"}},
    {"id": "2.B.3.a", "name": "Programming", "score": {"value": "85"}}
  ]
}

ESCO response (raw, JSON-LD):
{
  "uri": "http://data.europa.eu/esco/occupation/f2b15a0e-...",
  "title": "software developer",
  "hasEssentialSkill": [
    {"uri": "...", "title": "analyse software specifications"}
  ]
}

APIbase response (normalized + fused):
{
  "occupation": {
    "title": "Software Developers",
    "soc_code": "15-1252",
    "esco_uri": "http://data.europa.eu/esco/occupation/f2b15a0e-..."
  },
  "salary": {
    "national": {
      "annual_median": 130270,
      "annual_mean": 138100,
      "percentiles": {
        "p10": 74250, "p25": 98580,
        "p50": 130270, "p75": 166780, "p90": 197900
      }
    },
    "by_metro": [
      {"area": "San Jose-Sunnyvale-Santa Clara, CA", "annual_median": 175000},
      {"area": "New York-Newark-Jersey City, NY", "annual_median": 145000},
      {"area": "Austin-Round Rock-Georgetown, TX", "annual_median": 135000}
    ]
  },
  "skills": {
    "top_skills": [
      {"name": "Programming", "importance": 85, "level": "High"},
      {"name": "Complex Problem Solving", "importance": 81, "level": "High"},
      {"name": "Systems Analysis", "importance": 78, "level": "High"}
    ],
    "top_technologies": ["Python", "JavaScript", "SQL", "AWS", "Git"]
  },
  "outlook": {
    "growth_10yr": "+25%",
    "growth_label": "Much faster than average",
    "projected_openings_annual": 153900,
    "median_education": "Bachelor's degree"
  },
  "context": {
    "salary_vs_all": "Top 10% of all US occupations",
    "affordability": {
      "san_jose": "Salary high but COL adjusted: effective $105K",
      "austin": "Best affordability — salary $135K, COL 95% of national"
    }
  }
}
```

#### Layer 3: Value-Add (Career Intelligence + Affiliate Funnel)

```
APIbase unique value — salary intelligence + career planning + job monetization:

1. SALARY INTELLIGENCE
   "How much do software engineers make in Austin?" →
     BLS: national median $130K + Austin metro $135K
     BLS CPI: Austin COL = 95% of national average
     APIbase COMPUTES: "Real purchasing power: $142K equivalent.
     Austin offers best affordability among top-10 tech metros."

2. SKILLS GAP ANALYSIS
   "I'm a data analyst, want to become ML engineer" →
     O*NET: Data Analyst skills (SQL, statistics, visualization)
     O*NET: ML Engineer skills (Python, TensorFlow, math)
     APIbase COMPUTES:
       Missing skills: Deep Learning, TensorFlow, PyTorch
       Matching skills: Python, Statistics, SQL (85% transferable)
       Recommended: "Learn Deep Learning — Coursera $49" [affiliate]
       Salary jump: $85K → $150K (+76%)

3. JOB SEARCH + MONETIZED APPLY
   "Find ML engineer jobs in Austin" →
     CareerJet: 150 listings matching "ML engineer Austin"
     BLS: median salary $155K for ML engineers
     APIbase enrichment: "12 listings above median [Apply]"
     Every "Apply" click → $0.10-0.50 CPC affiliate revenue

4. CAREER SERVICES FUNNEL
   Agent detects: user is underpaid by 20% →
     Step 1: salary-lookup ($0.02) → "You're at P25, market P50 is 20% higher"
     Step 2: job-search ($0.03) → "Here are 15 better-paying jobs" → CPC clicks
     Step 3: skills-analysis ($0.02) → "You need AWS certification" → Coursera [affiliate]
     Step 4: "Upgrade resume?" → TopResume [affiliate $60-140]
     Step 5: User gets new job in Denver → UC-012 commute + UC-013 housing
     TOTAL FUNNEL: $0.07 x402 + $5-50 affiliate + cross-UC revenue

5. COMPENSATION BENCHMARKING (B2B)
   Employer: "What should I pay a product manager in NYC?" →
     BLS: PM in NYC metro: P25 $125K, P50 $155K, P75 $190K
     Salary transparency compliance: NYC Local Law 32 requires disclosure
     APIbase: "Compliant range: $130K-185K (P25-P75). Market-competitive: $150K-165K."
     Premium B2B pricing: $0.10/query
```

### Caching Strategy

```
Data Type              Cache Strategy           TTL
──────────────────────────────────────────────────────
BLS OEWS wages         Permanent until refresh   12 months (annual May release)
BLS CPI                Cache + monthly refresh   30 days
BLS Projections        Permanent until refresh   24 months (biennial)
O*NET occupation data  Cache + quarterly check   90 days
O*NET skills/abilities Cache + quarterly check   90 days
ESCO taxonomy          Permanent (versioned)     12 months
CareerJet listings     Short-term cache          4 hours (listings dynamic)

Cache growth model:
  Day 1:   Bulk download BLS OEWS (all 830 occupations × all metros)
           Bulk download O*NET database (available as CSV/XML)
           Bulk download ESCO taxonomy (linked open data)
           = ~95% cache hit rate immediately

  This is the HIGHEST day-1 cache hit of any UC:
  UC-011 Health: ~90% (USDA 3.1 GB bulk)
  UC-015 Jobs:  ~95% (BLS + O*NET + ESCO bulk downloads)

  Only CareerJet (job listings) requires live upstream calls.
  All intelligence tools serve 100% from cache.
```

---

## 4. MCP Tool Definitions

### Tool 1: `salary-lookup`

```json
{
  "name": "salary-lookup",
  "description": "Зарплата по профессии: медиана, mean, перцентили (10th/25th/50th/75th/90th) — national, по штату и metro area. 830+ профессий (BLS official data). 'Сколько зарабатывают software engineers?' 'Зарплата медсестры в Техасе'",
  "inputSchema": {
    "type": "object",
    "properties": {
      "occupation": {
        "type": "string",
        "description": "Профессия: 'software developer', 'registered nurse', 'data scientist', 'accountant'"
      },
      "location": {
        "type": "string",
        "description": "Локация: 'national', штат ('Texas'), metro ('Austin, TX'). Default: 'national'"
      },
      "compare_locations": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Сравнить зарплаты в нескольких городах: ['Austin', 'Denver', 'NYC']"
      }
    },
    "required": ["occupation"]
  }
}
```

**Pricing:** $0.02/request (x402)

### Tool 2: `job-search`

```json
{
  "name": "job-search",
  "description": "Поиск вакансий по ключевым словам, локации, типу. Миллионы позиций globally. Каждый результат содержит ссылку Apply. Фильтры: remote, full-time/part-time, зарплата. 'Найди вакансии ML engineer в Austin', 'Remote Python jobs'",
  "inputSchema": {
    "type": "object",
    "properties": {
      "keywords": {
        "type": "string",
        "description": "Ключевые слова: 'machine learning engineer', 'product manager'"
      },
      "location": {
        "type": "string",
        "description": "Локация: 'Austin, TX', 'London', 'remote'"
      },
      "contract_type": {
        "type": "string",
        "enum": ["permanent", "contract", "temporary", "any"],
        "description": "Тип контракта. Default: 'any'"
      },
      "work_type": {
        "type": "string",
        "enum": ["full_time", "part_time", "any"],
        "description": "Полный/частичный день. Default: 'any'"
      },
      "salary_min": {
        "type": "integer",
        "description": "Минимальная зарплата ($)"
      },
      "sort": {
        "type": "string",
        "enum": ["relevance", "date"],
        "description": "Сортировка. Default: 'relevance'"
      },
      "limit": {
        "type": "integer",
        "description": "Количество результатов (1-50). Default: 10"
      }
    },
    "required": ["keywords"]
  }
}
```

**Pricing:** $0.03/request (x402)

### Tool 3: `skills-analysis`

```json
{
  "name": "skills-analysis",
  "description": "Навыки, знания, способности и технологии для профессии. US (O*NET, 900+ профессий) + EU (ESCO, 27 языков). Рейтинг важности каждого навыка. 'Какие навыки нужны data scientist?', 'Что должен знать product manager?'",
  "inputSchema": {
    "type": "object",
    "properties": {
      "occupation": {
        "type": "string",
        "description": "Профессия"
      },
      "taxonomy": {
        "type": "string",
        "enum": ["onet", "esco", "both"],
        "description": "Таксономия: US (O*NET), EU (ESCO), или обе. Default: 'both'"
      },
      "language": {
        "type": "string",
        "description": "Язык для ESCO данных (ISO 639-1). Default: 'en'"
      },
      "include_technologies": {
        "type": "boolean",
        "description": "Включить technology skills. Default: true"
      }
    },
    "required": ["occupation"]
  }
}
```

**Pricing:** $0.02/request (x402)

### Tool 4: `salary-comparison`

```json
{
  "name": "salary-comparison",
  "description": "Сравнение зарплат по городам с учётом стоимости жизни (COL). BLS CPI adjustment → 'реальная покупательная способность'. 'Где лучше: $150K в SF или $120K в Austin?'",
  "inputSchema": {
    "type": "object",
    "properties": {
      "occupation": {
        "type": "string",
        "description": "Профессия"
      },
      "locations": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Города для сравнения: ['San Francisco', 'Austin', 'Denver', 'NYC']"
      },
      "current_salary": {
        "type": "integer",
        "description": "Текущая зарплата ($) — для расчёта 'am I underpaid?'"
      },
      "current_location": {
        "type": "string",
        "description": "Текущий город (для COL adjustment)"
      }
    },
    "required": ["occupation", "locations"]
  }
}
```

**Pricing:** $0.03/request (x402)

### Tool 5: `career-path`

```json
{
  "name": "career-path",
  "description": "Карьерный путь: от текущей роли к целевой. Какие навыки добавить, ожидаемый рост зарплаты, рекомендованные сертификации/курсы. 'Как перейти из data analyst в ML engineer?', 'Career path for product manager'",
  "inputSchema": {
    "type": "object",
    "properties": {
      "current_role": {
        "type": "string",
        "description": "Текущая роль: 'data analyst', 'junior developer'"
      },
      "target_role": {
        "type": "string",
        "description": "Целевая роль: 'ML engineer', 'engineering manager'"
      },
      "current_skills": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Текущие навыки: ['Python', 'SQL', 'statistics']"
      }
    },
    "required": ["current_role", "target_role"]
  }
}
```

**Pricing:** $0.05/request (x402)

### Tool 6: `hiring-trends`

```json
{
  "name": "hiring-trends",
  "description": "Прогноз рынка труда: рост/сокращение профессии на 10 лет, ежегодные вакансии, отрасли-лидеры, fastest-growing related occupations. BLS Employment Projections. 'Будет ли спрос на data scientists через 5 лет?'",
  "inputSchema": {
    "type": "object",
    "properties": {
      "occupation": {
        "type": "string",
        "description": "Профессия"
      },
      "include_related": {
        "type": "boolean",
        "description": "Включить related occupations и их прогнозы. Default: true"
      }
    },
    "required": ["occupation"]
  }
}
```

**Pricing:** $0.02/request (x402)

### Tool 7: `compensation-benchmark`

```json
{
  "name": "compensation-benchmark",
  "description": "Benchmark зарплат для compliance с salary transparency laws (NYC, CA, CO, EU). Pay range по перцентилям, comparable titles, market positioning. B2B инструмент для HR/рекрутеров. 'Какой compliant pay range для product manager в NYC?'",
  "inputSchema": {
    "type": "object",
    "properties": {
      "job_title": {
        "type": "string",
        "description": "Должность"
      },
      "location": {
        "type": "string",
        "description": "Локация (для compliance: NYC, California, Colorado...)"
      },
      "company_size": {
        "type": "string",
        "enum": ["startup", "mid", "enterprise", "any"],
        "description": "Размер компании (влияет на pay positioning). Default: 'any'"
      },
      "experience_level": {
        "type": "string",
        "enum": ["entry", "mid", "senior", "lead", "executive", "any"],
        "description": "Уровень опыта. Default: 'any'"
      }
    },
    "required": ["job_title", "location"]
  }
}
```

**Pricing:** $0.10/request (x402) — B2B premium pricing

---

## 5. AI Instructions for Agents

### System Prompt Addition

```
You have access to APIbase Career Intelligence tools powered by
BLS (US official salary data) + O*NET (occupation taxonomy) +
ESCO (EU skills, 27 languages) + CareerJet (global job listings).

TOOLS AVAILABLE:
• salary-lookup: salary percentiles for 830+ occupations by location
• job-search: millions of job listings globally with Apply links
• skills-analysis: required skills/knowledge/abilities for any role
• salary-comparison: compare salaries across cities (COL adjusted)
• career-path: plan career transition (current → target role)
• hiring-trends: employment growth projections (10-year outlook)
• compensation-benchmark: salary transparency compliance for employers

USAGE GUIDELINES:

1. SALARY QUERIES
   "How much do nurses make?" → salary-lookup(occupation="registered nurse")
   "Software engineer salary in Austin vs NYC" → salary-comparison
   "Am I underpaid at $85K as data analyst?" → salary-lookup + comparison

2. JOB SEARCH QUERIES
   "Find remote Python jobs" → job-search(keywords="Python", location="remote")
   "ML engineer jobs in Austin" → job-search + salary-lookup for context
   Response includes Apply links (affiliate — disclose)

3. CAREER PLANNING
   "How do I become a data scientist?" → career-path + skills-analysis
   "What skills do I need for product management?" → skills-analysis
   "Is AI engineering a growing field?" → hiring-trends

4. EMPLOYER / HR QUERIES
   "What should I pay a PM in NYC?" → compensation-benchmark
   "Salary range for compliance in California?" → compensation-benchmark
   Premium B2B pricing for compensation queries

5. AFFILIATE LINKS (disclosed)
   Job apply links are affiliate — disclose in response
   Course/certification recommendations may include affiliate links
   Resume service recommendations may include affiliate links
   Always: "Some links may be affiliate — APIbase may earn commission"

IMPORTANT:
• Salary data is BLS official (US Government, updated annually)
• O*NET/ESCO data covers US + EU occupations/skills
• Job listings via CareerJet (global coverage)
• Salary data ≠ guaranteed offer — market varies
• For specific negotiations → recommend consulting career coach
• Not legal/financial advice for employment decisions
• BLS data covers US; ESCO covers EU; limited data for other regions
```

---

## 6. Publication Strategy

### MCP Server Configuration

```json
{
  "name": "apibase-careers",
  "version": "1.0.0",
  "description": "Career intelligence: salary data (830+ occupations, US official BLS), job search (millions globally), skills analysis, career path planning, hiring trends, compensation benchmarking. BLS + O*NET + ESCO + CareerJet.",
  "tools": [
    "salary-lookup",
    "job-search",
    "skills-analysis",
    "salary-comparison",
    "career-path",
    "hiring-trends",
    "compensation-benchmark"
  ],
  "auth": {
    "type": "x402",
    "network": "base",
    "currency": "USDC"
  },
  "pricing": {
    "salary-lookup": "$0.02",
    "job-search": "$0.03",
    "skills-analysis": "$0.02",
    "salary-comparison": "$0.03",
    "career-path": "$0.05",
    "hiring-trends": "$0.02",
    "compensation-benchmark": "$0.10"
  }
}
```

---

## 7. Traffic Flow Diagram

```
Agent request flow (example: career-path with full funnel):

Agent                APIbase                BLS    O*NET   CareerJet
  │                    │                     │       │        │
  │ ── x402 $0.05 ───→│                     │       │        │
  │  career-path       │                     │       │        │
  │  current: "data    │                     │       │        │
  │   analyst"         │                     │       │        │
  │  target: "ML       │                     │       │        │
  │   engineer"        │                     │       │        │
  │                    │                     │       │        │
  │                    │── salary data ──────→│       │        │
  │                    │   check cache: ✅    │       │        │
  │                    │   Data Analyst: $85K │       │        │
  │                    │   ML Engineer: $150K │       │        │
  │                    │                     │       │        │
  │                    │── skills data ──────────────→│        │
  │                    │   check cache: ✅            │        │
  │                    │   DA: SQL, statistics, viz   │        │
  │                    │   MLE: Python, TF, math      │        │
  │                    │                     │       │        │
  │                    │── COMPUTE ───→      │       │        │
  │                    │   Skills overlap: 65%        │        │
  │                    │   Missing: Deep Learning,    │        │
  │                    │   TensorFlow, PyTorch        │        │
  │                    │   Salary jump: +76%          │        │
  │                    │   Projected growth: +25%     │        │
  │                    │                     │       │        │
  │←── response ───────│                     │       │        │
  │  {                 │                     │       │        │
  │    current: {role: "Data Analyst", salary: $85K},         │
  │    target: {role: "ML Engineer", salary: $150K},          │
  │    salary_jump: "+76% ($65K increase)",                   │
  │    skills_gap: {                                          │
  │      matching: ["Python", "Statistics", "SQL"],           │
  │      missing: ["Deep Learning", "TensorFlow", "PyTorch"],│
  │      transferable_pct: 65%                                │
  │    },                                    │       │        │
  │    recommended_learning: [               │       │        │
  │      "Deep Learning Specialization — Coursera $49 [link]",│
  │      "TensorFlow Developer Cert — Google $100 [link]"     │
  │    ],                                    │       │        │
  │    outlook: {growth: "+25%", openings: "153,900/yr"},     │
  │    next_steps: [                         │       │        │
  │      "1. Complete Deep Learning course (3 months)",       │
  │      "2. Build 2-3 ML projects (portfolio)",              │
  │      "3. Update resume [TopResume $89 link]",             │
  │      "4. Apply to ML roles [search 45 open positions]"    │
  │    ]                                     │       │        │
  │  }                 │                     │       │        │

Revenue flow:
  x402 payment:     $0.05 per career-path query
  Upstream cost:    $0.00 (BLS + O*NET served from cache)
  Margin:           100%

  Affiliate funnel (potential per user journey):
    Coursera course:   $7-22 (15-45% of $49 course)
    Resume writing:    $18-42 (20-30% of $89 service)
    Job apply clicks:  $0.50-2.50 (5 clicks × $0.10-0.50 CPC)
    = $25-67 affiliate revenue per active career changer

  0.5% of salary-lookup users → full career funnel
  At 100K salary queries/month → 500 career changers
  Revenue: $12,500-33,500/month from career funnel alone
```

---

## 8. Monetization Model

### Pattern P15: Salary Intelligence + Career Funnel Affiliate

```
Уникальность паттерна:
  • QUAD-SOURCE FUSION: 4 government/open data APIs, $0 upstream
  • 100% MARGIN on intelligence tools (all data = public domain/open)
  • CAREER SERVICES FUNNEL: salary gap → job search → resume → courses
  • MULTI-STAGE AFFILIATE: CPC (job clicks) + course commissions + resume services
  • B2B PREMIUM: compensation benchmarking for salary transparency compliance
  • ~95% DAY-1 CACHE: bulk download all 3 databases → serve from cache immediately
  • SALARY TRANSPARENCY TAILWIND: 12+ US states + EU mandating disclosure by 2027

Отличия от существующих паттернов:
  vs P1 (Builder Key Proxy):
    P1: 1 source, simple proxy, $0 upstream
    P15: 4 sources FUSED, $0 upstream, intelligence + career funnel

  vs P11 (Gov Data Fusion):
    P11: government data → health commerce affiliate (supplements)
    P15: government data → career services funnel (resume, courses, jobs)
    P11: recurring affiliate (supplements = monthly purchase)
    P15: high-value one-time + career lifecycle

  vs P14 (Sports Intelligence):
    P14: odds arbitrage → betting CPA ($50-700)
    P15: salary intelligence → career services funnel ($25-67/career changer)
    P14: ongoing RevShare (betting)
    P15: one-time + lifecycle (relocation triggers UC-012/013)

  vs P13 (Lifecycle Affiliate):
    P13: property → mortgage → insurance → moving (real estate lifecycle)
    P15: salary gap → job search → resume → courses → relocation (career lifecycle)
    P13: highest one-time CPA ($85-500/lead)
    P15: highest volume (everyone has a career)
    BOTH have lifecycle chains but different verticals
```

### Revenue Streams

| Stream | Source | Monthly Revenue |
|--------|--------|-----------------|
| x402 intelligence tools | 50K-300K queries × $0.025 avg | $1,250–7,500 |
| x402 compensation benchmark | 5K-30K B2B queries × $0.10 | $500–3,000 |
| CareerJet CPC | 5K-30K apply clicks × $0.20 avg | $1,000–6,000 |
| Course affiliate | 100-500 purchases × $15 avg | $1,500–7,500 |
| Resume service affiliate | 50-200 purchases × $25 avg | $1,250–5,000 |
| Career coaching referral | 10-50 referrals × $30 avg | $300–1,500 |
| **TOTAL** | | **$5,800–30,500** |

### Unit Economics

```
Per salary-lookup query:
  Revenue:       $0.02
  Upstream cost: $0.00 (BLS public domain, served from cache)
  Margin:        100%

Per job-search query:
  Revenue:       $0.03
  Upstream cost: ~$0.00 (CareerJet free)
  Margin:        100%
  + 10% of users click Apply = +$0.02 CPC avg
  Effective revenue per job-search: $0.05
  Effective margin: 100%

Per career-path query:
  Revenue:       $0.05
  Upstream cost: $0.00 (all cached)
  Margin:        100%
  + 5% of users purchase course = +$0.75 affiliate avg
  + 2% of users upgrade resume = +$0.50 affiliate avg
  Effective revenue: $1.30
  Effective margin: 100%

Per compensation-benchmark query (B2B):
  Revenue:       $0.10
  Upstream cost: $0.00
  Margin:        100%

Upstream cost total: ~$50-150/мес (hosting/cache infrastructure only)
Break-even: ~2,000 queries at $0.025 avg = $50 = DAY 1

This is the LOWEST break-even of any UC:
  UC-015: ~2,000 req (hosting only)
  UC-011 Health: 0 req ($0 upstream)
  UC-010 TMDB: 0 req ($0 upstream)
  UC-014 Sports: 1 conversion ($88 upstream)
```

---

## 9. Lessons Learned

### Lesson 1: Jobs = Most API-Hostile Category After Real Estate

```
Открытие:
  15 из 30 кандидатов DISQUALIFIED — рекорд среди всех UC.
  (UC-013 Real Estate: 11 из 18 = 61%. UC-015 Jobs: 15 из 30 = 50%.)

  Причины:
  1. API DEPRECATION wave (Indeed, Monster — deprecated)
  2. PARTNER-ONLY access (LinkedIn, Glassdoor — closed)
  3. ANTI-AI clauses (Levels.fyi — explicit ban)
  4. ANTI-RESALE universal (Apollo, Muse, Reed, USAJobs, Himalayas...)

  Тренд: major job platforms ЗАКРЫВАЮТ API access:
  Indeed deprecated 2024, LinkedIn stopped new partners 2025,
  Glassdoor partner-only, Monster deprecated.

  Причина: job data = core revenue asset.
  Indeed зарабатывает на job postings — redistribution = lost revenue.
  LinkedIn зарабатывает на Recruiter subscriptions — API undercuts.

  Contrast с BLS: government data = free forever, no business model to protect.
```

### Lesson 2: Government Data = The Ultimate ToS Escape Hatch (Confirmed x3)

```
Открытие:
  UC-015 = ТРЕТИЙ UC с government data as primary source:

  UC-011 (Health):    USDA + OpenFDA ($0, CC0/public domain)
  UC-013 (Real Estate): US Census ACS ($0, government)
  UC-015 (Jobs):      BLS + O*NET ($0, public domain)

  Pattern: when commercial APIs lock down (Indeed, LinkedIn, Glassdoor),
  government APIs provide FREE, PERMANENT, AUTHORITATIVE alternatives.

  BLS salary data > any commercial salary API:
  • More authoritative (official government data)
  • More detailed (percentiles, metro-level)
  • More permissive (public domain)
  • More cacheable (annual updates only)
  • $0 vs Levels.fyi/PayScale ($enterprise)

  Правило: ALWAYS check government data sources first.
```

### Lesson 3: Salary Transparency Laws = Emerging Revenue Driver

```
Открытие:
  12+ US states (NYC, CA, CO, WA, CT, MD, NV, RI, HI, IL, MN, VT)
  + EU Pay Transparency Directive (2026-2027)
  ТРЕБУЮТ disclosure of salary ranges in job postings.

  Это создаёт НОВЫЙ рынок: salary benchmarking for compliance.
  Каждый работодатель в regulated state НУЖДАЕТСЯ в market data
  для установки compliant pay ranges.

  BLS percentile data = ИДЕАЛЬНЫЙ benchmark source:
  "P25-P75 for Product Manager in NYC: $125K-$190K"
  = compliant salary range for job posting.

  B2B opportunity: compensation-benchmark tool at $0.10/query
  (5-10x premium over consumer tools) = highest per-query revenue.
```

### Lesson 4: Career Funnel = Multi-Stage Affiliate Chain

```
Открытие:
  Career lifecycle = PREDICTABLE sequence of purchases:

  1. Salary lookup → "I'm underpaid" → motivation
  2. Skills analysis → "I need X skill" → course purchase [affiliate]
  3. Career path → "Here's my plan" → certification [affiliate]
  4. Job search → "Apply here" → CPC clicks [affiliate]
  5. Resume update → "Upgrade resume" → resume service [affiliate]
  6. Interview prep → "Practice here" → prep service [affiliate]
  7. New job → relocation → UC-012 Maps + UC-013 Real Estate

  Аналогия с UC-013 Real Estate lifecycle:
  UC-013: property → mortgage → insurance → moving ($185 chain)
  UC-015: salary gap → skills → resume → job → relocation ($25-67+ chain)

  UC-015 lower per-chain value BUT MUCH higher volume:
  Everyone has a career (vs only property buyers).
  Career decisions happen 3-5x in a lifetime (vs 1-2 property purchases).
```

### Lesson 5: Highest Day-1 Cache of Any UC

```
Открытие:
  BLS + O*NET + ESCO = все три предоставляют BULK DOWNLOADS:
  • BLS OEWS: полная база зарплат (CSV)
  • O*NET: полная база профессий (XML/CSV)
  • ESCO: полная таксономия (RDF/CSV)

  Day 1: download all three → populate cache → ~95% hit rate immediately
  Only CareerJet job listings require live upstream calls.

  Comparison:
  UC-010 TMDB: ~30% day 1 → grows to 95% over months (cold start)
  UC-011 Health: ~90% day 1 (USDA 3.1 GB bulk download)
  UC-015 Jobs: ~95% day 1 (3 bulk downloads) ← RECORD

  Intelligence tools (salary, skills, career, trends, benchmark)
  serve 100% from cache. Zero upstream calls needed.
```

### Competitive Landscape Note

```
Career Intelligence + AI (март 2026):
  • LinkedIn: internal AI (LinkedIn AI Career Coach), closed API
  • Indeed: deprecated API, internal AI job matching
  • Glassdoor: salary data partner-only
  • Levels.fyi: explicit anti-AI clause in ToS
  • PayScale: enterprise-only, no public API
  • ZipRecruiter: publisher affiliate possible but restricted

  AI-native career tools emerging:
  • JobSpy MCP server (multi-source scraper — legal gray area)
  • Adzuna MCP server (folathecoder — community, ToS uncertain)
  • Himalayas MCP (official — but ToS prohibits redistribution)
  • Various salary calculator bots (basic, no government data)

  НИКТО не объединяет:
  BLS official salary percentiles + O*NET skill taxonomy +
  ESCO EU multilingual skills + monetized job search
  в один AI-consumable MCP interface.

  APIbase UC-015 = first AI-native career intelligence API
  backed by authoritative government data.

  Unique moat: government data = FREE + AUTHORITATIVE + PERMANENT.
  No competitor can undercut on price ($0) or authority (BLS official).
```
