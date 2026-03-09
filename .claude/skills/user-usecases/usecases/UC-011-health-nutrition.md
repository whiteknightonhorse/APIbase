# UC-011: Government Health Data Fusion (USDA + OpenFDA)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-011 |
| **Provider** | USDA FoodData Central + OpenFDA + NIH DSLD + free-exercise-db |
| **Category** | Health & Nutrition / Fitness |
| **Date Added** | 2026-03-07 |
| **Status** | Reference |
| **Client** | APIbase (platform-level integration) |

---

## 1. Client Input Data

Интеграция на уровне платформы — APIbase объединяет несколько government data sources:

```
Тип данных:          Значение:
──────────────────────────────────────────────────────────
USDA API Key         Free key от api.data.gov (мгновенный)
OpenFDA API Key      Free key от open.fda.gov (мгновенный)
NIH DSLD             Публичный API, ключ не требуется
free-exercise-db     GitHub repo, MIT/Unlicense
```

### Sufficiency Assessment

| Data provided | What it enables | Sufficient? |
|---------------|----------------|-------------|
| USDA FDC API Key (free) | 350K+ branded foods, 8,800 generic foods, до 150 nutrients per food. Rate: 1,000 req/hr (can request increase). Bulk download: 3.1 GB CSV/JSON. | **Yes** — полноценный production доступ |
| OpenFDA API Key (free) | Drug adverse events (FAERS), food recalls, supplement safety, drug labeling. Rate: 240 req/min, 120K req/day. | **Yes** — полноценный production доступ |
| NIH DSLD (free) | Dietary Supplement Label Database — 200K+ supplement labels с ingredient data. | **Yes** — дополнительный data source |
| free-exercise-db (free) | 800+ exercises с muscle targeting, equipment, difficulty. Public domain. | **Yes** — дополнительный data source |

**Verdict:** Все четыре data source полностью бесплатны и **CC0 / public domain** — нет ограничений на commercial use, proxy, resale. Это первый UC с **multi-source government data fusion** — ценность APIbase в объединении, cross-referencing и AI-интерпретации данных из разных ведомств. Rate limits умеренные (USDA: 1,000/hr, FDA: 240/min), но bulk download + permanent cache снимают ограничения.

### Стратегический контекст: почему Government Data, а не Nutritionix/Edamam

```
Ситуация в Health/Nutrition API (март 2026):
──────────────────────────────────────────────────────────────

DISQUALIFIED по ToS:
  × Edamam:         "Shall not sell or resell" + "prohibits automated
                     programmatic requests"
  × Spoonacular:    "May not resell any data" + cache limit 1 hour
  × API Ninjas:     "May not redistribute or resell the underlying
                     raw Output" + anti-competition clause
  × Fitbit:         "Cannot resell... distribute, sell, lease, rent,
                     lend, transfer, or sublicense"
  × Withings:       Запрещает ВСЕ формы redistribution

СЛИШКОМ ДОРОГИЕ:
  × Nutritionix:    $299/мес Starter, $1,850/мес Enterprise
  × FatSecret:      Custom enterprise pricing, sublicensing prohibited

СТРАТЕГИЯ APIbase:
  ✓ USDA FoodData Central = gold standard nutrition data (CC0)
  ✓ OpenFDA = drug/food safety, recalls, adverse events (CC0)
  ✓ NIH DSLD = supplement label data (public)
  ✓ free-exercise-db = exercise database (public domain)
  ✓ ВСЕ бесплатно, ВСЕ public domain
  ✓ 5+ active MCP серверов для USDA (доказанный спрос)
  ✓ 3+ MCP серверов для OpenFDA
  ✓ BigTech gap: ни Apple HealthKit, ни Google Health Connect
    НЕ предоставляют cloud API для nutrition data
  ✓ Unique value = FUSION + AI interpretation, не raw data
```

---

## 2. Provider API Analysis

### API Architecture

**USDA FoodData Central** — крупнейшая government nutrition database США. 5 типов данных: Foundation Foods (аналитические), SR Legacy (8,800 generic), FNDDS (survey), Experimental, Branded Foods (350K+, обновляется ежемесячно через GDSN). До **150 nutrients per food item**.

**OpenFDA** — публичный API FDA с данными о безопасности лекарств, пищевых продуктов и БАДов. Включает FAERS (adverse events), drug labeling, food/drug recalls.

| Service | Base URL | Auth | Description |
|---------|----------|------|-------------|
| **USDA Food Search** | `https://api.nal.usda.gov/fdc/v1/foods/search` | API Key (query) | Поиск продуктов по названию, бренду, UPC |
| **USDA Food Details** | `https://api.nal.usda.gov/fdc/v1/food/{fdcId}` | API Key (query) | Детальные nutrients per food item |
| **USDA Foods List** | `https://api.nal.usda.gov/fdc/v1/foods/list` | API Key (query) | Batch query по FDC ID |
| **OpenFDA Drug Events** | `https://api.fda.gov/drug/event.json` | API Key (query) | Adverse event reports (FAERS) |
| **OpenFDA Food Recalls** | `https://api.fda.gov/food/enforcement.json` | API Key (query) | Food recall enforcement reports |
| **OpenFDA Drug Labels** | `https://api.fda.gov/drug/label.json` | API Key (query) | Drug labeling + interactions |
| **NIH DSLD** | `https://dsld.od.nih.gov/api/` | None | Supplement label database |

### Key Endpoints

#### USDA Food Search

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /fdc/v1/foods/search` | POST | Поиск по query string, brand, UPC |

**Параметры:**
```
query              — поисковый запрос ("chicken breast", "coca cola")
dataType           — Foundation, SR Legacy, Branded, FNDDS, Experimental
brandOwner         — фильтр по бренду ("Coca-Cola", "Nestlé")
pageSize           — до 200 результатов за запрос
sortBy             — dataType.keyword, lowercaseDescription, fdcId, publishedDate
nutrients           — фильтр по конкретным nutrients (nutrientNumber)
```

**Возвращает:**
```
fdcId              — уникальный ID продукта
description        — название ("Chicken breast, raw")
brandOwner         — бренд (для branded foods)
ingredients        — состав
servingSize        — размер порции
servingSizeUnit    — единица ("g", "ml")
foodNutrients[]    — массив nutrients:
  nutrientId       — ID нутриента
  nutrientName     — "Protein", "Total lipid (fat)", "Vitamin D"
  value            — значение
  unitName         — "g", "mg", "µg", "kcal"
  percentDailyValue — % от дневной нормы
```

#### USDA Food Details

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /fdc/v1/food/{fdcId}` | GET | Полные данные по FDC ID |

**Возвращает (до 150 nutrients):**
```
Macronutrients:
  Energy (kcal), Protein (g), Total fat (g), Carbohydrates (g),
  Fiber (g), Sugars (g), Added sugars (g)

Vitamins:
  A (µg RAE), B1-B12, C (mg), D (µg), E (mg), K (µg),
  Folate (µg DFE), Niacin (mg), Riboflavin (mg)

Minerals:
  Calcium (mg), Iron (mg), Magnesium (mg), Phosphorus (mg),
  Potassium (mg), Sodium (mg), Zinc (mg), Selenium (µg)

Lipids:
  Saturated FA (g), Monounsaturated FA (g), Polyunsaturated FA (g),
  Trans FA (g), Cholesterol (mg), Omega-3 (g), Omega-6 (g)

Other:
  Water (g), Caffeine (mg), Alcohol (g), Choline (mg)
```

#### OpenFDA Drug Adverse Events

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /drug/event.json` | GET | Adverse event reports (FAERS) |

**Параметры:**
```
search             — query (e.g., "patient.drug.openfda.brand_name:ibuprofen")
count              — aggregate by field
limit              — results per page (до 1000)
```

**Возвращает:**
```
safetyreportid     — ID отчёта
receivedate        — дата получения
serious            — серьёзность (1=serious, 2=not)
patient.reaction[] — реакции пациента
patient.drug[]     — препараты (name, dose, indication)
```

#### OpenFDA Food Recalls

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /food/enforcement.json` | GET | Food recall enforcement reports |

**Возвращает:**
```
recall_number      — номер отзыва
reason_for_recall  — причина
classification     — Class I (serious), II, III
product_description — описание продукта
distribution_pattern — география распространения
status             — Ongoing, Completed, Terminated
```

### Rate Limits & Pricing

| Source | Rate Limit | Daily Limit | Monthly Cost | Bulk Download |
|--------|-----------|-------------|-------------|---------------|
| **USDA FDC** | 1,000 req/hr | Нет | **$0** | 3.1 GB CSV/JSON |
| **OpenFDA** | 240 req/min | 120,000/day | **$0** | JSON downloads |
| **NIH DSLD** | Not specified | Not specified | **$0** | Full dataset |
| **free-exercise-db** | N/A (static) | N/A | **$0** | GitHub JSON |

### Licensing

| Source | License | Commercial | Resale | AI Use | Attribution |
|--------|---------|-----------|--------|--------|-------------|
| **USDA FDC** | CC0 1.0 | ✅ Yes | ✅ Yes | ✅ Yes | Requested (not required) |
| **OpenFDA** | CC0 1.0 | ✅ Yes | ✅ Yes | ✅ Yes | Requested (not required) |
| **NIH DSLD** | US Gov Public | ✅ Yes | ✅ Yes | ✅ Yes | Requested |
| **free-exercise-db** | Unlicense | ✅ Yes | ✅ Yes | ✅ Yes | Not required |

**Все четыре источника — CC0 / public domain.** Нет юридических ограничений на commercial use, proxy, resale. APIbase может кэшировать, обогащать, перепродавать без ограничений.

---

## 3. APIbase Wrapper Design

### Architecture: Government Data Fusion

```
┌─────────────────────────────────────────────────────────────┐
│                     APIbase Health Layer                      │
│                                                               │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────┐  ┌────────┐│
│  │ USDA FDC    │  │ OpenFDA     │  │ NIH DSLD │  │Exercise││
│  │ Nutrition   │  │ Safety      │  │ Suppl.   │  │Database││
│  └──────┬──────┘  └──────┬──────┘  └────┬─────┘  └───┬────┘│
│         │                │              │             │      │
│         └────────┬───────┴──────┬───────┘             │      │
│                  │              │                      │      │
│         ┌────────▼──────────────▼──────────────────────▼────┐│
│         │           FUSION ENGINE                           ││
│         │                                                   ││
│         │  • Cross-reference nutrients × safety data        ││
│         │  • Compute DRI percentages per food/meal          ││
│         │  • Identify nutritional gaps                      ││
│         │  • Generate supplement recommendations            ││
│         │  • Link exercises to calorie/muscle goals         ││
│         │  • Food recall alert enrichment                   ││
│         └────────────────────┬──────────────────────────────┘│
│                              │                               │
│         ┌────────────────────▼──────────────────────────────┐│
│         │           AFFILIATE COMMERCE LAYER                ││
│         │                                                   ││
│         │  • iHerb affiliate (5-10% supplements)            ││
│         │  • Amazon Associates (4-8% supplements)           ││
│         │  • Fitness equipment affiliate (3-10%)            ││
│         │  • UC-003 cross-sell (meal delivery)              ││
│         └───────────────────────────────────────────────────┘│
│                                                               │
│         ┌───────────────────────────────────────────────────┐│
│         │           PERMANENT CACHE + BULK SYNC             ││
│         │                                                   ││
│         │  • USDA bulk download (3.1 GB) → local DB         ││
│         │  • OpenFDA bulk download → local index            ││
│         │  • Exercise DB → full local copy (static)         ││
│         │  • Monthly refresh: Branded Foods via GDSN        ││
│         │  • Foundation/SR: rarely changes (annual)         ││
│         └───────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Wrapper Layers

#### Layer 1: Protocol Adapter

```
Upstream APIs (4 sources):
  USDA:     REST + API key (query param) + JSON
  OpenFDA:  REST + API key (query param) + JSON
  NIH DSLD: REST + no auth + JSON
  Exercise: Static JSON files (GitHub)

APIbase unified:
  REST + x402 Bearer Token + normalized JSON
```

**Адаптация:**
- USDA nutrient arrays → structured objects with DRI percentages
- OpenFDA search syntax (field:value) → natural language queries
- NIH DSLD supplement data → cross-referenced with FDA safety
- Exercise static data → searchable with filters

#### Layer 2: Semantic Normalizer

```
USDA response (raw):
{
  "fdcId": 746768,
  "description": "Chicken, breast, rotisserie, skin not eaten",
  "foodNutrients": [
    {"nutrientId": 1008, "nutrientName": "Energy", "value": 122, "unitName": "KCAL"},
    {"nutrientId": 1003, "nutrientName": "Protein", "value": 24.1, "unitName": "G"},
    {"nutrientId": 1004, "nutrientName": "Total lipid (fat)", "value": 2.57, "unitName": "G"},
    ...47 more nutrients
  ]
}

APIbase response (normalized):
{
  "food": {
    "name": "Chicken Breast (rotisserie, without skin)",
    "brand": null,
    "source": "USDA Foundation Foods",
    "serving": {"size": 100, "unit": "g"}
  },
  "calories": 122,
  "macros": {
    "protein": {"value": 24.1, "unit": "g", "dri_pct": 48, "rating": "high"},
    "fat": {"value": 2.57, "unit": "g", "dri_pct": 3, "rating": "low"},
    "carbs": {"value": 0, "unit": "g", "dri_pct": 0, "rating": "none"},
    "fiber": {"value": 0, "unit": "g", "dri_pct": 0}
  },
  "vitamins": {
    "B3_niacin": {"value": 10.2, "unit": "mg", "dri_pct": 64, "status": "good"},
    "B6": {"value": 0.54, "unit": "mg", "dri_pct": 42, "status": "moderate"},
    "B12": {"value": 0.31, "unit": "µg", "dri_pct": 13, "status": "low"},
    ...
  },
  "minerals": {
    "phosphorus": {"value": 216, "unit": "mg", "dri_pct": 31, "status": "moderate"},
    "selenium": {"value": 27.1, "unit": "µg", "dri_pct": 49, "status": "good"},
    ...
  },
  "health_flags": ["high_protein", "low_fat", "low_carb", "keto_friendly"],
  "safety": {
    "recalls": [],
    "allergens": [],
    "fda_alerts": null
  }
}
```

#### Layer 3: Value-Add (Fusion + Intelligence)

```
APIbase unique value — data fusion across government sources:

1. NUTRITION + SAFETY CROSS-REFERENCE
   "Vitamin D supplement" →
     USDA: nutrient profile per brand
     FDA: 4,231 adverse event reports for Vitamin D
     NIH DSLD: 12,000+ supplement labels with Vitamin D
     APIbase: "Safe at ≤4000 IU/day. 127 serious events reported at >10,000 IU/day"

2. MEAL ANALYSIS + GAP DETECTION
   Input: "2 eggs, 1 toast, 1 banana, black coffee"
   USDA: per-food nutrition → total meal nutrition
   DRI: compare vs daily recommended intake
   APIbase: "This meal covers 35% protein, 12% fiber, 2% Vitamin D.
             Daily gaps likely: Vitamin D, Calcium, Omega-3"

3. EXERCISE + CALORIE LINKING
   Exercise DB: "Bench press burns ~220 kcal/30min"
   USDA: "That's equivalent to 1.8 chicken breasts"
   APIbase: "Post-workout: need 30g protein → recommend chicken breast + banana"

4. SUPPLEMENT RECOMMENDATION + SAFETY
   Gap detected: Vitamin D deficiency
   NIH DSLD: top Vitamin D supplements by IU/serving
   FDA: safety check (adverse events, recalls)
   Affiliate: iHerb link with 5-10% commission
   APIbase: "Recommended: Nature's Bounty D3 2000 IU — 0 FDA recalls,
             safe dosage. [Buy on iHerb — $8.99]"
```

### Caching Strategy: Bulk Sync + Permanent Cache

```
Data Source          Cache Strategy           TTL
──────────────────────────────────────────────────────
USDA Foundation      Bulk download + cache    Permanent (annual update)
USDA SR Legacy       Bulk download + cache    Permanent (final release)
USDA Branded Foods   Bulk download + cache    30 days (monthly GDSN update)
OpenFDA Events       API query + cache        24 hours (new reports daily)
OpenFDA Recalls      API query + cache        6 hours (time-sensitive)
NIH DSLD             Bulk download + cache    90 days (quarterly updates)
Exercise DB          Full local copy          Permanent (static dataset)

Cache growth model:
  Month 1:  Seed with USDA bulk (350K+ foods) + exercise DB (800+)
  Month 3:  Add popular meal combinations + computed DRI analyses
  Month 6:  80%+ queries served from cache
  Month 12: 95%+ queries served from cache

  Key insight: USDA Foundation + SR Legacy = PERMANENT data
  "Chicken breast raw" nutrition doesn't change.
  Unlike weather (2 min TTL) or crypto (30s TTL) — food = permanent.
```

### Error Handling

```
Upstream errors:
  USDA 429 (rate limit) → serve from cache or queue
  USDA 503 (service down) → serve from bulk download cache
  OpenFDA timeout → serve cached safety data with "last_updated" timestamp

Graceful degradation:
  If USDA down → serve from local bulk database (3.1 GB)
  If OpenFDA down → skip safety data, return nutrition only
  If NIH DSLD down → skip supplement labels

  APIbase NEVER fully fails — local cache = complete backup
```

---

## 4. MCP Tool Definitions

### Tool 1: `nutrition-lookup`

```json
{
  "name": "nutrition-lookup",
  "description": "Поиск nutrition данных для любого продукта по названию, бренду или штрих-коду. Возвращает калории, макронутриенты (белки/жиры/углеводы), до 150 микронутриентов, % дневной нормы (DRI), и health flags. Powered by USDA FoodData Central — крупнейшая government nutrition database (350K+ products).",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Поисковый запрос: название продукта ('chicken breast', 'coca cola'), бренд ('Danone yogurt'), UPC/barcode ('049000042566')"
      },
      "data_type": {
        "type": "string",
        "enum": ["all", "foundation", "branded", "sr_legacy"],
        "description": "Тип данных: 'foundation' (аналитические, самые точные), 'branded' (магазинные продукты), 'sr_legacy' (generic foods), 'all' (все). Default: 'all'"
      },
      "nutrients_detail": {
        "type": "string",
        "enum": ["basic", "full"],
        "description": "'basic' — калории + макро + ключевые витамины/минералы (20 nutrients). 'full' — все доступные nutrients (до 150). Default: 'basic'"
      },
      "limit": {
        "type": "integer",
        "description": "Количество результатов (1-10). Default: 3"
      }
    },
    "required": ["query"]
  }
}
```

**Pricing:** $0.002/request (x402)

**Upstream calls:** 1 USDA search + 1 USDA details per result = 2-4 calls (cached)

### Tool 2: `meal-analyzer`

```json
{
  "name": "meal-analyzer",
  "description": "Анализ полного приёма пищи по текстовому описанию. Принимает natural language ('2 eggs, toast with butter, coffee with milk'), разбивает на компоненты, находит каждый продукт в USDA, суммирует nutrients и рассчитывает % от дневной нормы. Показывает что хорошо и чего не хватает.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "meal_description": {
        "type": "string",
        "description": "Описание приёма пищи на естественном языке. Примеры: '2 варёных яйца, тост с маслом, банан и чёрный кофе', 'chicken salad with tomatoes and olive oil dressing', 'Big Mac with medium fries and Coke'"
      },
      "meal_type": {
        "type": "string",
        "enum": ["breakfast", "lunch", "dinner", "snack", "any"],
        "description": "Тип приёма пищи (для контекста DRI). Default: 'any'"
      },
      "dietary_goals": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["weight_loss", "muscle_gain", "keto", "vegan", "low_sodium", "diabetic", "heart_health", "general"]
        },
        "description": "Диетические цели для персонализированных рекомендаций. Default: ['general']"
      }
    },
    "required": ["meal_description"]
  }
}
```

**Pricing:** $0.005/request (x402)

**Upstream calls:** 3-8 USDA search/details (per food item in meal, heavily cached)

### Tool 3: `nutrient-gap-finder`

```json
{
  "name": "nutrient-gap-finder",
  "description": "Анализ дневного рациона: находит nutritional gaps и дефициты. Принимает список приёмов пищи за день, рассчитывает суммарное потребление nutrients vs USDA Dietary Reference Intakes (DRI), выявляет дефициты витаминов и минералов, предлагает продукты и добавки для восполнения.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "meals": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "meal_type": {"type": "string", "enum": ["breakfast", "lunch", "dinner", "snack"]},
            "description": {"type": "string"}
          },
          "required": ["description"]
        },
        "description": "Список приёмов пищи за день"
      },
      "profile": {
        "type": "object",
        "properties": {
          "age": {"type": "integer"},
          "sex": {"type": "string", "enum": ["male", "female"]},
          "weight_kg": {"type": "number"},
          "activity_level": {"type": "string", "enum": ["sedentary", "light", "moderate", "active", "very_active"]}
        },
        "description": "Профиль пользователя для расчёта индивидуальных DRI"
      }
    },
    "required": ["meals"]
  }
}
```

**Pricing:** $0.010/request (x402)

**Upstream calls:** 5-15 USDA calls (per food × meals, heavily cached) + DRI computation

### Tool 4: `supplement-safety-check`

```json
{
  "name": "supplement-safety-check",
  "description": "Проверка безопасности БАДа или лекарственного препарата через данные FDA. Возвращает количество adverse event reports (FAERS), recalls, drug-food interactions, и рекомендации по безопасной дозировке. Cross-reference: NIH DSLD (supplement labels) + OpenFDA (adverse events + recalls).",
  "inputSchema": {
    "type": "object",
    "properties": {
      "product_name": {
        "type": "string",
        "description": "Название БАДа или препарата: 'Vitamin D 5000 IU', 'Ashwagandha', 'Ibuprofen', 'Melatonin 10mg'"
      },
      "check_interactions": {
        "type": "boolean",
        "description": "Проверить drug-food и drug-drug interactions. Default: true"
      },
      "current_medications": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Текущие препараты для проверки interactions: ['aspirin', 'metformin']"
      }
    },
    "required": ["product_name"]
  }
}
```

**Pricing:** $0.005/request (x402)

**Upstream calls:** 1-3 OpenFDA queries + 1 NIH DSLD lookup

### Tool 5: `food-safety-alerts`

```json
{
  "name": "food-safety-alerts",
  "description": "Активные food recalls и safety alerts от FDA. Фильтрация по типу продукта, дате, серьёзности. Возвращает детали отзыва, affected products, география распространения. Критично для food safety awareness.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "food_type": {
        "type": "string",
        "description": "Тип продукта: 'dairy', 'meat', 'vegetables', 'supplements', 'all'. Default: 'all'"
      },
      "severity": {
        "type": "string",
        "enum": ["all", "class_I", "class_II", "class_III"],
        "description": "Серьёзность: 'class_I' (опасно для здоровья/жизни), 'class_II' (потенциальный вред), 'class_III' (маловероятный вред). Default: 'all'"
      },
      "days_back": {
        "type": "integer",
        "description": "За сколько дней показать alerts (1-365). Default: 30"
      },
      "state": {
        "type": "string",
        "description": "US state для фильтрации по распространению (e.g., 'CA', 'NY')"
      }
    }
  }
}
```

**Pricing:** $0.002/request (x402)

**Upstream calls:** 1 OpenFDA query (cached 6 hours)

### Tool 6: `exercise-finder`

```json
{
  "name": "exercise-finder",
  "description": "Поиск упражнений по целевой мышечной группе, оборудованию, сложности или типу движения. Возвращает название, инструкцию, primary/secondary мышцы, difficulty, estimated calorie burn. Integrates with nutrition data для post-workout рекомендаций.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "target_muscle": {
        "type": "string",
        "enum": ["chest", "back", "shoulders", "biceps", "triceps", "forearms", "abs", "quadriceps", "hamstrings", "glutes", "calves", "full_body"],
        "description": "Целевая мышечная группа"
      },
      "equipment": {
        "type": "string",
        "enum": ["none", "barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell", "resistance_band", "any"],
        "description": "Доступное оборудование. Default: 'any'"
      },
      "difficulty": {
        "type": "string",
        "enum": ["beginner", "intermediate", "advanced", "any"],
        "description": "Уровень сложности. Default: 'any'"
      },
      "goal": {
        "type": "string",
        "enum": ["strength", "hypertrophy", "endurance", "flexibility", "weight_loss"],
        "description": "Тренировочная цель"
      },
      "limit": {
        "type": "integer",
        "description": "Количество упражнений (1-20). Default: 5"
      }
    }
  }
}
```

**Pricing:** $0.002/request (x402)

**Upstream calls:** 0 (fully served from local exercise database cache)

### Tool 7: `health-product-recommend`

```json
{
  "name": "health-product-recommend",
  "description": "Рекомендация health products (БАДы, суперфуды, фитнес-оборудование) на основе выявленных nutritional gaps или fitness целей. Включает FDA safety check, price comparison, и affiliate purchase links. Recommendations data-driven, основаны на USDA DRI gaps.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "recommendation_type": {
        "type": "string",
        "enum": ["supplement", "superfood", "fitness_equipment", "meal_plan"],
        "description": "Тип рекомендации"
      },
      "based_on": {
        "type": "string",
        "description": "Контекст: 'vitamin_d_deficiency', 'low_protein', 'weight_loss_goal', 'muscle_gain', или free text"
      },
      "budget": {
        "type": "string",
        "enum": ["budget", "mid_range", "premium", "any"],
        "description": "Бюджет. Default: 'any'"
      },
      "preferences": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["vegan", "organic", "non_gmo", "gluten_free", "sugar_free", "no_artificial"]
        },
        "description": "Предпочтения/ограничения"
      }
    },
    "required": ["recommendation_type", "based_on"]
  }
}
```

**Pricing:** $0.005/request (x402)

**Upstream calls:** 1-2 (FDA safety check per product, cached)

---

## 5. AI Instructions for Agents

### System Prompt Addition

```
You have access to APIbase Health & Nutrition tools powered by USDA FoodData Central,
OpenFDA, and NIH supplement data — government gold-standard sources.

TOOLS AVAILABLE:
• nutrition-lookup: nutrition data for any food (350K+ products, 150 nutrients)
• meal-analyzer: analyze a full meal from natural language description
• nutrient-gap-finder: find vitamin/mineral deficiencies in a day's diet
• supplement-safety-check: FDA adverse events + recall status for supplements
• food-safety-alerts: active FDA food recalls and safety warnings
• exercise-finder: exercises by muscle group, equipment, difficulty
• health-product-recommend: data-driven supplement/product recommendations

USAGE GUIDELINES:

1. NUTRITION QUERIES
   "How many calories in a banana?" → nutrition-lookup(query="banana")
   "Nutritional value of Coca-Cola" → nutrition-lookup(query="coca cola", data_type="branded")
   "What nutrients are in quinoa?" → nutrition-lookup(query="quinoa", nutrients_detail="full")

2. MEAL ANALYSIS
   "I had eggs and toast for breakfast" → meal-analyzer(meal_description="2 eggs, 1 toast")
   "Is my lunch healthy?" → meal-analyzer + commentary on DRI percentages
   "Keto check my dinner" → meal-analyzer(dietary_goals=["keto"])

3. DAILY DIET ANALYSIS
   When user describes full day of eating → nutrient-gap-finder with all meals
   Focus on: what's missing, not just what's present
   Recommend specific foods to fill gaps before suggesting supplements

4. SUPPLEMENT SAFETY
   Before recommending ANY supplement → supplement-safety-check
   Always mention FDA adverse event count and recall status
   Check interactions with user's medications if known
   NEVER recommend dosages above USDA Upper Intake Level (UL)

5. FOOD SAFETY
   Proactively mention relevant recalls when user mentions affected food categories
   Class I recalls = immediate danger — always flag prominently

6. EXERCISE
   Match exercises to available equipment and fitness level
   Link to nutrition: post-workout protein needs, calorie burn context

7. PRODUCT RECOMMENDATIONS
   Only recommend after identifying specific need (gap, goal)
   Always include FDA safety data
   Present affiliate links naturally as "available here" — not hard sell
   Disclose: "This recommendation includes affiliate links"

IMPORTANT:
• All nutrition data is from USDA FoodData Central (US government standard)
• Safety data is from FDA official databases
• Data is evidence-based, not opinions
• For medical advice → always recommend consulting a healthcare professional
• Never diagnose conditions — identify nutritional patterns and suggest consulting doctor
```

### Query Pattern Examples

```
User: "Сколько калорий в куриной грудке?"
Agent: nutrition-lookup(query="chicken breast")
Response: Structured nutrition data with DRI percentages

User: "Проанализируй мой обед: паста карбонара с салатом"
Agent: meal-analyzer(meal_description="pasta carbonara, green salad", meal_type="lunch")
Response: Total calories, macros, vitamins, gaps, suggestions

User: "Что мне не хватает в рационе?" (after providing daily meals)
Agent: nutrient-gap-finder(meals=[...])
Response: Gap analysis → recommend foods first → supplements if needed

User: "Безопасен ли мелатонин 10мг?"
Agent: supplement-safety-check(product_name="melatonin 10mg")
Response: FDA adverse events, safe dosage range, interaction warnings

User: "Какие упражнения на грудь с гантелями?"
Agent: exercise-finder(target_muscle="chest", equipment="dumbbell")
Response: 5 exercises with instructions, difficulty, muscles worked

User: "Есть ли отзывы продуктов с сальмонеллой?"
Agent: food-safety-alerts(days_back=30, severity="class_I")
Response: Active Class I recalls with affected products and regions
```

---

## 6. Publication Strategy

### MCP Server Configuration

```json
{
  "name": "apibase-health",
  "version": "1.0.0",
  "description": "Health & Nutrition intelligence: nutrition lookup, meal analysis, nutrient gaps, supplement safety, exercise database. Powered by USDA FoodData Central + OpenFDA.",
  "tools": [
    "nutrition-lookup",
    "meal-analyzer",
    "nutrient-gap-finder",
    "supplement-safety-check",
    "food-safety-alerts",
    "exercise-finder",
    "health-product-recommend"
  ],
  "auth": {
    "type": "x402",
    "network": "base",
    "currency": "USDC"
  },
  "pricing": {
    "nutrition-lookup": "$0.002",
    "meal-analyzer": "$0.005",
    "nutrient-gap-finder": "$0.010",
    "supplement-safety-check": "$0.005",
    "food-safety-alerts": "$0.002",
    "exercise-finder": "$0.002",
    "health-product-recommend": "$0.005"
  }
}
```

### Discovery Tags

```
Categories: health, nutrition, fitness, food-safety, supplements, exercise
Keywords: calories, nutrients, vitamins, minerals, protein, diet, meal-analysis,
          food-recall, FDA, USDA, supplement-safety, exercise-database,
          macro-tracking, DRI, dietary-reference-intake, nutrition-facts
```

### GitHub Presence

```
Repository structure:
  apibase-health/
  ├── README.md          — overview, quick start, pricing
  ├── tools/
  │   ├── nutrition-lookup.md
  │   ├── meal-analyzer.md
  │   ├── nutrient-gap-finder.md
  │   ├── supplement-safety-check.md
  │   ├── food-safety-alerts.md
  │   ├── exercise-finder.md
  │   └── health-product-recommend.md
  ├── examples/
  │   ├── calorie-counting.md
  │   ├── meal-planning.md
  │   ├── supplement-safety.md
  │   └── workout-nutrition.md
  └── data-sources.md    — USDA, OpenFDA, NIH DSLD, exercise DB
```

---

## 7. Traffic Flow Diagram

```
Agent request flow (example: meal-analyzer):

Agent                APIbase                    USDA FDC         OpenFDA
  │                    │                           │               │
  │ ── x402 $0.005 ──→│                           │               │
  │    meal-analyzer   │                           │               │
  │    "2 eggs, toast, │                           │               │
  │     banana, coffee"│                           │               │
  │                    │                           │               │
  │                    │── NLP parse meal ──→      │               │
  │                    │   → ["egg ×2",            │               │
  │                    │      "toast ×1",          │               │
  │                    │      "banana ×1",         │               │
  │                    │      "coffee black ×1"]   │               │
  │                    │                           │               │
  │                    │── check cache ──→         │               │
  │                    │   egg: ✅ cached           │               │
  │                    │   toast: ✅ cached         │               │
  │                    │   banana: ✅ cached        │               │
  │                    │   coffee: ✅ cached        │               │
  │                    │                           │               │
  │                    │ (if cache miss:)          │               │
  │                    │──── search("egg") ───────→│               │
  │                    │←──── fdcId + nutrients ───│               │
  │                    │                           │               │
  │                    │── compute totals ──→      │               │
  │                    │   total_kcal: 387         │               │
  │                    │   protein: 21.4g (43% DRI)│               │
  │                    │   vitamin_D: 2.1µg (14%)  │               │
  │                    │   calcium: 82mg (6%)      │               │
  │                    │                           │               │
  │                    │── gap analysis ──→        │               │
  │                    │   gaps: [vitamin_D,       │               │
  │                    │          calcium, fiber]  │               │
  │                    │                           │               │
  │                    │── safety cross-check ────────────────────→│
  │                    │   (batch: any recalls     │               │
  │                    │    for eggs/wheat?)        │               │
  │                    │←─────────────────────────────── none ────│
  │                    │                           │               │
  │←── response ───────│                           │               │
  │    {meal_summary,  │                           │               │
  │     per_food,      │                           │               │
  │     total_nutrition,│                          │               │
  │     dri_coverage,  │                           │               │
  │     gaps,          │                           │               │
  │     suggestions}   │                           │               │
  │                    │                           │               │

Revenue flow:
  x402 payment:     $0.005 per meal analysis
  Upstream cost:    $0 (all cached / public domain)
  Margin:           100%

  If gap detected → supplement recommendation → affiliate link:
    Agent shows: "Consider Vitamin D supplement [Buy on iHerb]"
    User clicks → iHerb → purchase → 5-10% commission → APIbase
    Average supplement purchase: $15-25 → commission $1-2.50
```

---

## 8. Monetization Model

### Pattern P11: Government Data Fusion + Health Commerce Oracle

```
Уникальность паттерна:
  • $0 upstream (все источники = government CC0 / public domain)
  • Multi-source fusion (4 API → 1 unified layer)
  • Permanent cache (food nutrition data rarely changes)
  • Computed intelligence (DRI %, gap analysis, recommendations)
  • Affiliate commerce (supplements, fitness — contextual, data-driven)
  • Cross-UC synergy (UC-003 meal delivery, UC-009 price intel)

Отличия от существующих паттернов:
  vs P1 (Builder Key):  P1 = 1 source proxy. P11 = 4+ sources FUSED
  vs P3 (Multi-Provider): P3 = routing to best provider.
                          P11 = MERGING data from all providers
  vs P5 (Cache Multiplier): P5 = cache amplifies same data.
                            P11 = cache + computed intelligence + fusion
  vs P9 (Price Oracle):  P9 = compute from 1 paid source.
                         P11 = compute from 4 FREE sources
  vs P10 (Permanent Cache): P10 = permanent cache single source.
                            P11 = permanent cache multi-source + affiliate
```

### Revenue Streams

| Stream | Price | Expected Volume | Monthly Revenue |
|--------|-------|----------------|-----------------|
| nutrition-lookup | $0.002/req | 50K-500K req | $100–1,000 |
| meal-analyzer | $0.005/req | 20K-200K req | $100–1,000 |
| nutrient-gap-finder | $0.010/req | 10K-100K req | $100–1,000 |
| supplement-safety-check | $0.005/req | 5K-50K req | $25–250 |
| food-safety-alerts | $0.002/req | 3K-30K req | $6–60 |
| exercise-finder | $0.002/req | 10K-100K req | $20–200 |
| health-product-recommend | $0.005/req | 5K-50K req | $25–250 |
| **x402 subtotal** | | | **$376–3,760** |
| Supplement affiliate (iHerb/Amazon) | ~$1.50 avg | 200-2K conv | $300–3,000 |
| UC-003 cross-sell (meal delivery) | ~$3.00 avg | 50-500 conv | $150–1,500 |
| **Affiliate subtotal** | | | **$450–4,500** |
| **TOTAL** | | | **$826–8,260** |

### Unit Economics

```
Per nutrition-lookup query:
  Revenue:       $0.002
  Upstream cost: $0.000 (served from cache, CC0 data)
  Margin:        100%

Per meal-analyzer query:
  Revenue:       $0.005
  Upstream cost: $0.000 (all foods cached from bulk download)
  Margin:        100%

Per nutrient-gap-finder query:
  Revenue:       $0.010
  Upstream cost: $0.000 (USDA data + DRI tables = cached)
  Compute cost:  ~$0.0005 (gap analysis computation)
  Margin:        95%

Per supplement recommendation with affiliate conversion:
  x402 revenue:      $0.005 (API call)
  Affiliate revenue: $1.50 avg (5-10% of ~$20 supplement)
  Total per conv:    $1.505
  Upstream cost:     $0.000
  Margin:            ~100%
```

### Comparison with Alternatives

```
What an agent pays elsewhere for the same data:

Nutritionix:
  $299/mo minimum (Starter plan)
  No affiliate integration
  Locked to one data source

Edamam:
  $0 free tier (25 req/day — unusable for production)
  $29/mo recipe search only
  Prohibits automated/AI access

Spoonacular:
  $0 free (150 req/day)
  $29/mo (1,500 req/day)
  Prohibits resale, 1hr cache limit

APIbase Health (UC-011):
  $0 fixed cost
  Pay-per-query via x402 ($0.002-0.010)
  4-source fusion (USDA + FDA + NIH + exercise)
  No rate limits (served from permanent cache)
  Affiliate-integrated recommendations
  AI-native MCP interface
```

---

## 9. Lessons Learned

### Lesson 1: Government APIs = Ultimate ToS Freedom

```
Открытие:
  Все приватные health/nutrition APIs (Edamam, Spoonacular, Nutritionix,
  FatSecret, API Ninjas) ЗАПРЕЩАЮТ resale/proxy/AI automation.

  Government APIs (USDA, FDA, NIH) = CC0 public domain.
  Zero restrictions. Zero cost. Often better data quality.

  Паттерн: когда private APIs закрывают ToS,
  government APIs становятся единственным viable upstream.

Параллели:
  UC-010: TMDB (community-maintained) > OMDb (personal use only)
  UC-011: USDA (CC0 government) > Edamam (anti-resale)

Правило: проверяй government/open data СНАЧАЛА,
         потом private APIs.
```

### Lesson 2: Data Fusion as Competitive Moat

```
Открытие:
  Каждый government API по отдельности — commodity.
  USDA nutrition data — бесплатный, любой может использовать.

  НО: объединение USDA + FDA + NIH + Exercise DB в ОДИН API
  с AI-native interface — это то, чего НЕТ у конкурентов.

  "Is this supplement safe?" требует:
  1. NIH DSLD (что внутри)
  2. FDA FAERS (adverse events)
  3. FDA recalls (отзывы)
  4. USDA DRI (рекомендуемая доза)

  Ни один существующий API не делает этот cross-reference.
  APIbase = fusion layer + AI interpretation.

Паттерн: ценность не в DATA, а в FUSION + INTERPRETATION.
```

### Lesson 3: Health Commerce = Highest LTV Affiliate

```
Открытие:
  Supplements — recurring purchase with high CLV:
  • Средняя покупка: $15-25
  • Повторная покупка: каждые 1-3 месяца
  • Commission: 5-10% (iHerb), 4-8% (Amazon)
  • CLV affiliate: ~$5-15/year per converted user

  В отличие от one-time purchases (events, flights):
  • UC-002 (flights): $1-5 per booking, 2-3x/year
  • UC-008 (tickets): $0.30 per ticket, few times/year
  • UC-011 (supplements): $1-2.50 per order, 4-12x/year

  Health = highest affiliate LTV в портфеле APIbase.
```

### Lesson 4: Permanent Cache + Bulk Download = Resilience

```
Открытие:
  USDA предоставляет bulk download (3.1 GB CSV/JSON).
  Можно загрузить ВСЮ базу локально на старте.

  Результат:
  • APIbase НИКОГДА не падает из-за upstream (данные локальные)
  • Rate limits не проблема (serve from local DB)
  • Latency минимальный (no upstream call needed)
  • Cost: $0 per query (compute only)

  Это СИЛЬНЕЕ чем permanent cache P10 (TMDB):
  P10: cache grows organically as users query
  P11: cache SEEDED on day 1 with full bulk download

  Day 1 cache hit rate: ~90% (bulk download covers most queries)
  vs P10 Day 1: ~70% (cold cache, grows with usage)
```

### Lesson 5: Cross-UC Synergy — Health as Universal Enrichment

```
Открытие:
  Health/Nutrition пересекается с МНОЖЕСТВОМ других UC:

  UC-003 (Food Delivery):
  "Order chicken breast from DoorDash" → enrich with nutrition data
  "This meal has 850 kcal, 42g protein — fits your muscle gain goal"

  UC-005 (Weather):
  "UV index 2 today" → "Consider Vitamin D supplement (low sun exposure)"

  UC-009 (Keepa/E-commerce):
  "Nature's Bounty Vitamin D — lowest price in 3 months on Amazon"
  (price intelligence from UC-009 + health recommendation from UC-011)

  UC-007 (Translation):
  Translate nutrition labels from foreign products

  Health = UNIVERSAL ENRICHMENT layer, подобно Translation (UC-007).
  Любой UC, связанный с food или физическим состоянием,
  может быть обогащён health data.
```

### Competitive Landscape Note

```
BigTech GAP:
  Apple HealthKit → on-device only, no cloud API
  Google Health Connect → Android-only, no cloud API
  Neither provides NUTRITION data API

  APIbase = единственный cloud-native nutrition intelligence API
  для AI-агентов. Ни Apple, ни Google не конкурируют в этом слое.

MCP ecosystem validation:
  USDA FoodData Central: 5+ MCP servers на GitHub
  OpenFDA: 3+ MCP servers на GitHub
  Total: 8+ community MCP servers = сильный demand signal

  Но ни один из этих серверов не делает FUSION:
  • nutrition + safety cross-check
  • meal analysis + gap detection
  • exercise + calorie linking
  • supplement recommendation + FDA safety

  APIbase UC-011 = first fusion health MCP server.
```
