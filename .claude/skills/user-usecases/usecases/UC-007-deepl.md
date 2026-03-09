# UC-007: DeepL

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-007 |
| **Provider** | DeepL (deepl.com) |
| **Category** | Translation / Content Transformation |
| **Date Added** | 2026-03-07 |
| **Status** | Reference |
| **Client** | APIbase (platform-level integration) |

---

## 1. Client Input Data

Интеграция на уровне платформы — APIbase подключает DeepL как upstream-провайдер:

```
Тип данных:          Значение:
──────────────────────────────────────────────────────────
DeepL API Pro Key    Pro plan ($5.49/мес + $25/M chars)
DeepL Free Key       500K chars/month (development only — запрещён в production)
```

### Sufficiency Assessment

| Data provided | What it enables | Sufficient? |
|---------------|----------------|-------------|
| Free API Key | 500K chars/month, 2 ключа, data retained by DeepL. Development only — запрещён для commercial use. | **No** — нельзя использовать в production |
| Pro API Key ($5.49/mo + usage) | Unlimited chars, $25/M chars, priority queue, immediate text deletion, custom glossaries. | **Yes** — полноценный production доступ |

**Verdict:** DeepL Free plan **явно запрещает** commercial use и пересылку данных third parties. Для APIbase необходим **Pro plan** ($5.49/мес + $25/M символов). Это первый UC с **per-character upstream billing** — совершенно новая модель.

---

## 2. Provider API Analysis

### API Architecture

DeepL — #1 по качеству машинного перевода: BLEU 64.5 (EN→DE) vs Google 48.3. 82% переводческих компаний используют DeepL.

| Service | Base URL | Auth | Description |
|---------|----------|------|-------------|
| **Translate** | `https://api.deepl.com/v2/translate` | API Key | Перевод текста (основной endpoint) |
| **Document** | `https://api.deepl.com/v2/document` | API Key | Перевод документов (DOCX, PPTX, PDF, HTML) |
| **Write** | `https://api.deepl.com/v2/write/rephrase` | API Key | Улучшение/перефразирование текста |
| **Glossary** | `https://api.deepl.com/v3/glossaries` | API Key | Пользовательские глоссарии терминологии |
| **Utility** | `https://api.deepl.com/v2/usage` | API Key | Использование квоты, список языков |

### Key Endpoints

#### Text Translation (Primary)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v2/translate` | POST | Перевод текста. До 128 KiB на запрос. |

**Ключевые параметры:**
```
text[]            — массив текстов для перевода (до 50 элементов)
target_lang       — целевой язык (EN-US, DE, FR, RU, ZH-HANS, JA, ...)
source_lang       — исходный язык (auto-detect если не указан)
formality         — more / less / default / prefer_more / prefer_less
split_sentences   — 0 / 1 / nonewlines
preserve_formatting — true / false
tag_handling      — xml / html (сохранение тегов)
glossary_id       — ID пользовательского глоссария
context           — дополнительный контекст для улучшения перевода
```

#### Document Translation

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v2/document` | POST | Загрузка документа для перевода |
| `/v2/document/{id}` | GET | Проверка статуса перевода |
| `/v2/document/{id}/result` | GET | Скачивание переведённого документа |

**Поддерживаемые форматы:** DOCX, PPTX, PDF, HTML, TXT, XLIFF, SRT, FB2

#### Write / Rephrase (Уникальный!)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v2/write/rephrase` | POST | Улучшение текста: грамматика, стиль, формальность |

**Параметры:**
```
text[]            — текст для улучшения
target_lang       — язык текста (EN, DE, FR, ES, PT, IT, NL, JA)
writing_style     — academic / business / casual / creative / simple
tone              — confident / friendly / diplomatic / enthusiastic
```

**Поддерживаемые языки Write API:** 8 (EN, DE, FR, ES, PT, IT, NL, JA)

#### Glossaries

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /v3/glossaries` | POST | Создать глоссарий |
| `GET /v3/glossaries` | GET | Список глоссариев |
| `GET /v3/glossaries/{id}` | GET | Детали глоссария |
| `PATCH /v3/glossaries/{id}` | PATCH | Редактировать глоссарий |
| `DELETE /v3/glossaries/{id}` | DELETE | Удалить глоссарий |
| `GET /v3/glossaries/{id}/entries` | GET | Записи глоссария |
| `GET /v2/glossary-language-pairs` | GET | Поддерживаемые языковые пары |

#### Utility

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /v2/usage` | GET | Текущее использование и оставшаяся квота |
| `GET /v2/languages` | GET | Список поддерживаемых языков |

### Authentication Model

```
Простая модель:
  Header: Authorization: DeepL-Auth-Key YOUR_API_KEY
  Method: POST (GET deprecated с марта 2025)

Два типа ключей:
  Free: api-free.deepl.com (500K chars/month, non-commercial only)
  Pro:  api.deepl.com ($5.49/mo + $25/M chars, commercial OK)
```

### Rate Limits

| Plan | Characters/month | Request size | Glossaries | Cost |
|------|-----------------|-------------|------------|------|
| Free | 500,000 | 128 KiB | 1 | $0 |
| Pro | Unlimited | 128 KiB | Unlimited | $5.49/mo + $25/M chars |

Нет rate limit по запросам/минуту — лимит только по символам.

### Supported Languages

**117 языков** с региональными вариантами:
- EN-US, EN-GB (English)
- PT-BR, PT-PT (Portuguese)
- ZH-HANS, ZH-HANT (Chinese)
- ES, ES-419 (Spanish)
- Все основные европейские, азиатские, арабский, иврит
- Глоссарии: 25 языков
- Write API: 8 языков (EN, DE, FR, ES, PT, IT, NL, JA)

### Quality Benchmarks

| Language Pair | DeepL | Google | ChatGPT | Разница DeepL vs Google |
|--------------|-------|--------|---------|------------------------|
| EN → DE | **64.5** | 48.3 | 62.1 | +34% |
| EN → FR | **63.1** | 51.7 | 60.8 | +22% |
| EN → ES | **62.8** | 54.2 | 61.4 | +16% |
| Adoption (LSPs) | **82%** | 46% | N/A | 1.8x |
| Human edits needed | **1x** | 2-3x | 1.5x | 2-3x меньше |

### Official MCP Server

DeepL уже выпустил **официальный MCP сервер**: `github.com/DeepLcom/deepl-mcp-server` (npm: `deepl-mcp-server`). Это подтверждает спрос на MCP-интеграцию. APIbase wrapper добавляет: x402 оплату, load balancing, multi-key rotation, usage tracking.

---

## 3. APIbase Wrapper Design

### Level 1: Protocol Adapter

```
What the adapter does:
──────────────────────────────────────────────────────────────
• Wraps 5 DeepL сервисов → unified translation interface
  apibase.pro/api/v1/translate/...

• Request routing:
  /translate/text        → deepl.com /v2/translate
  /translate/document    → deepl.com /v2/document
  /translate/improve     → deepl.com /v2/write/rephrase
  /translate/detect      → deepl.com /v2/translate (auto-detect)
  /translate/glossary    → deepl.com /v3/glossaries

• Auto-language detection:
  - Агент отправляет текст без указания source_lang
  - DeepL API автоматически определяет язык
  - APIbase кэширует detection result для повторных запросов

• Character counting & billing:
  - Upstream: DeepL считает символы (включая пробелы)
  - Downstream: APIbase считает символы и биллит через x402
  - Pre-validation: отклонять запросы > 128 KiB до отправки в DeepL
  - Usage tracking: real-time dashboard per agent

• NO caching possible:
  - В отличие от UC-004/005/006, перевод НЕ кэшируется
  - Каждый текст уникален → каждый запрос = upstream call
  - Исключение: language detection кэшируется 24h
  - Исключение: languages list кэшируется 24h

• Multi-key load balancing:
  - APIbase может держать несколько Pro ключей
  - Round-robin распределение нагрузки
  - Failover при ошибке одного ключа
  - Per-key usage tracking для биллинга

• Error normalization:
  DeepL errors → APIbase standard format
  {"error": "translation_quota_exceeded", "message": "..."}
  {"error": "translation_language_unsupported", "message": "..."}
  {"error": "translation_text_too_long", "chars": 150000, "max": 131072}
```

### Level 2: Semantic Normalizer

**Domain model: `translation`**

```json
// === DeepL original ===
{
  "translations": [
    {
      "detected_source_language": "EN",
      "text": "Привет, мир! Как дела?"
    }
  ]
}

// === APIbase normalized (translation schema) ===
{
  "provider": "deepl",
  "translation_id": "apibase_tr_abc123",
  "source": {
    "text": "Hello, world! How are you?",
    "language": "EN",
    "language_detected": true,
    "char_count": 27
  },
  "target": {
    "text": "Привет, мир! Как дела?",
    "language": "RU",
    "char_count": 22
  },
  "quality": {
    "engine": "deepl",
    "model": "next-gen-2026",
    "formality": "default"
  },
  "billing": {
    "chars_billed": 27,
    "cost_x402": 0.00108
  },
  "timestamp": "2026-03-07T14:30:00Z"
}
```

**Domain model: `text-improvement` (Write API)**

```json
// === APIbase normalized (text-improvement schema) ===
{
  "provider": "deepl",
  "source": {
    "text": "I thinks this is good idea for the project.",
    "language": "EN",
    "char_count": 44
  },
  "improved": {
    "text": "I think this is a good idea for the project.",
    "language": "EN",
    "char_count": 45,
    "changes": [
      {"type": "grammar", "original": "thinks", "corrected": "think"},
      {"type": "grammar", "original": "good idea", "corrected": "a good idea"}
    ]
  },
  "style": "default",
  "tone": "default"
}
```

### Level 3: Quality Assurance & Value-Add

```
APIbase добавляет ценность поверх прямого DeepL API:
──────────────────────────────────────────────────────────────

1. Formality auto-detect:
   - Агент не указывает formality level
   - APIbase определяет по контексту: business email → "more",
     chat message → "less", legal document → "more"

2. Glossary management:
   - APIbase предоставляет pre-built глоссарии по категориям:
     Crypto: "blockchain" = "блокчейн", "smart contract" = "смарт-контракт"
     Travel: "round trip" = "туда и обратно", "layover" = "пересадка"
     Food: "delivery fee" = "стоимость доставки"
   - Cross-UC glossaries: термины из UC-001..006

3. Translation memory:
   - Частые фразы кэшируются (интерфейсные строки, стандартные ответы)
   - Снижает upstream costs для повторяющихся текстов
   - "Welcome to APIbase" → перевод на 10 языков = 1 раз upstream

4. Quality routing:
   - DeepL Pro для основных европейских/азиатских языков (где DeepL сильнее)
   - Потенциально: Google Cloud для редких языков (189 vs DeepL's 117)
   - Агент не знает об upstream routing — получает лучшее качество
```

---

## 4. MCP Tool Definitions

### Tool: translate-text

```json
{
  "name": "translate-text",
  "description": "Translate text between 117 languages using DeepL — the world's most accurate machine translation engine (BLEU 64.5 EN→DE, 34% better than Google). Supports formality control, context hints, and glossaries. Returns natural-sounding translations requiring minimal human editing.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "text": {
        "type": "string",
        "description": "Text to translate (max ~130,000 characters)"
      },
      "target_language": {
        "type": "string",
        "description": "Target language code: EN-US, EN-GB, DE, FR, ES, RU, ZH-HANS, ZH-HANT, JA, KO, PT-BR, AR, etc."
      },
      "source_language": {
        "type": "string",
        "description": "Source language (auto-detected if omitted)"
      },
      "formality": {
        "type": "string",
        "enum": ["default", "more", "less", "prefer_more", "prefer_less"],
        "default": "default",
        "description": "Formality level: 'more' for business/official, 'less' for casual"
      },
      "context": {
        "type": "string",
        "description": "Additional context to improve translation quality (not translated itself)"
      }
    },
    "required": ["text", "target_language"]
  }
}
```

### Tool: translate-batch

```json
{
  "name": "translate-batch",
  "description": "Translate multiple texts at once (up to 50 items). More efficient than individual calls for multi-item translations like menus, product listings, or UI strings.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "texts": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Array of texts to translate",
        "maxItems": 50
      },
      "target_language": {
        "type": "string",
        "description": "Target language code"
      },
      "source_language": {
        "type": "string",
        "description": "Source language (auto-detected if omitted)"
      },
      "formality": {
        "type": "string",
        "enum": ["default", "more", "less"],
        "default": "default"
      }
    },
    "required": ["texts", "target_language"]
  }
}
```

### Tool: improve-text

```json
{
  "name": "improve-text",
  "description": "Improve, rephrase, and polish existing text using DeepL Write. Fixes grammar, improves flow, adjusts formality and tone. Works on text already in the target language (no translation — pure improvement). Supports: EN, DE, FR, ES, PT, IT, NL, JA.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "text": {
        "type": "string",
        "description": "Text to improve"
      },
      "language": {
        "type": "string",
        "enum": ["EN", "DE", "FR", "ES", "PT", "IT", "NL", "JA"],
        "description": "Language of the text"
      },
      "writing_style": {
        "type": "string",
        "enum": ["academic", "business", "casual", "creative", "simple"],
        "description": "Target writing style"
      },
      "tone": {
        "type": "string",
        "enum": ["confident", "friendly", "diplomatic", "enthusiastic"],
        "description": "Target tone of voice"
      }
    },
    "required": ["text", "language"]
  }
}
```

### Tool: detect-language

```json
{
  "name": "detect-language",
  "description": "Detect the language of a text. Returns language code and confidence level. Supports all 117 DeepL languages. Useful before deciding whether translation is needed.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "text": {
        "type": "string",
        "description": "Text to identify language of"
      }
    },
    "required": ["text"]
  }
}
```

### Tool: translate-document

```json
{
  "name": "translate-document",
  "description": "Translate entire documents while preserving formatting. Supports DOCX, PPTX, PDF, HTML, TXT, XLIFF, SRT, FB2. Upload document, receive translated version with original layout preserved.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "document_url": {
        "type": "string",
        "description": "URL of document to translate (must be publicly accessible)"
      },
      "target_language": {
        "type": "string",
        "description": "Target language code"
      },
      "source_language": {
        "type": "string",
        "description": "Source language (auto-detected if omitted)"
      },
      "formality": {
        "type": "string",
        "enum": ["default", "more", "less"],
        "default": "default"
      }
    },
    "required": ["document_url", "target_language"]
  }
}
```

### Tool: list-languages

```json
{
  "name": "list-languages",
  "description": "List all 117 supported languages with their codes, names, and whether they support formality control. Useful for discovering available language pairs.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "type": {
        "type": "string",
        "enum": ["source", "target"],
        "default": "target",
        "description": "List source or target languages"
      }
    },
    "required": []
  }
}
```

---

## 5. AI Instructions

```markdown
# DeepL Translation via APIbase — AI Agent Instructions

## When to Use
- User needs text translated to/from any language
- User sends message in non-English language (auto-detect + translate)
- User wants to improve/polish written text (grammar, style, tone)
- User needs document translated (DOCX, PDF, PPTX)
- User asks "How do you say X in [language]?"
- User needs batch translation (menus, UI strings, product descriptions)
- Cross-UC: translate output from other tools (news articles, crypto descriptions)

## Key Concepts
- DeepL = #1 quality machine translation (34% better than Google on EN→DE)
- 117 languages supported (regional variants: EN-US/EN-GB, PT-BR/PT-PT, ZH-HANS/ZH-HANT)
- Formality: "more" (formal/business) vs "less" (casual/friendly)
- Write API: improve text WITHOUT translating — grammar, style, tone
- Billed per character (not per request) — longer texts cost more

## Recommended Call Chains

### "Translate X to [language]"
1. `translate-text` (text="X", target_language="DE")
2. Return translation with language info

### "What language is this?"
1. `detect-language` (text="...") → language code + confidence
2. If translation needed: `translate-text`

### "Improve my email"
1. `improve-text` (text="...", language="EN", writing_style="business", tone="diplomatic")
2. Return improved version with highlighted changes

### "Translate this news article" (Cross-UC with UC-006)
1. Receive article from `news-search` (UC-006) in foreign language
2. `translate-text` (text=article_text, target_language="EN")
3. Return translated article with source attribution

### "Menu in English" (Cross-UC with UC-003)
1. Receive menu items in local language (from food delivery)
2. `translate-batch` (texts=[items], target_language="EN")
3. Return translated menu

### "Weather forecast in Russian" (Cross-UC with UC-005)
1. Get forecast from `weather-forecast` (UC-005)
2. `translate-text` (text=forecast_text, target_language="RU")
3. Present in Russian

## Response Formatting
- Show both original and translation when relevant
- Indicate language pair: "EN → DE" or "English → German"
- For formality choices: "Formal version: ..." / "Casual version: ..."
- For Write API: show diff or highlight changes
- For batch: show numbered list of translations
- Always note: "Translated by DeepL (world's most accurate MT engine)"

## Cross-UC Integration
Translation is a UNIVERSAL utility — it enhances every other UC:

| UC | How Translation Helps |
|----|-----------------------|
| UC-001 Polymarket | Translate market descriptions from any language |
| UC-002 Aviasales | Translate booking details, airport info |
| UC-003 Food Delivery | Translate menus, restaurant descriptions |
| UC-004 CoinGecko | Translate crypto project whitepapers |
| UC-005 Weather | Present forecasts in user's native language |
| UC-006 NewsAPI | Translate international news articles |

## Limitations
- 128 KiB max per request (~130,000 characters)
- Write API limited to 8 languages (EN, DE, FR, ES, PT, IT, NL, JA)
- Formality control not available for all language pairs
- Document translation is async (takes seconds to minutes)
- No caching — each translation is a unique upstream call
- Per-character billing means long texts are more expensive

## Pricing via APIbase
- Text translation: $0.04 per 1,000 characters via x402
- Text improvement (Write): $0.03 per 1,000 characters via x402
- Document translation: $0.05 per 1,000 characters via x402
- Batch translation: $0.035 per 1,000 characters via x402
- Language detection: $0.001 per request via x402
- Language list: $0.001 per request via x402
- Free tier: 10,000 characters/month (text translation only)
```

---

## 6. Publication

### APIbase.pro Catalog Entry

```
URL: apibase.pro/catalog/translation/deepl/
──────────────────────────────────────────────────────────────
Provider:       DeepL
Website:        deepl.com
Category:       Translation / Content Transformation
Subcategories:  Machine Translation, Text Improvement, Documents

Status:         Active ✅
MCP Tools:      6 tools (translate-text, translate-batch, improve-text,
                detect-language, translate-document, list-languages)
Formats:        MCP Tool Definition, OpenAPI 3.1, A2A Agent Card

Pricing:
  Translation:       $0.04 per 1,000 chars via x402
  Text improvement:  $0.03 per 1,000 chars via x402
  Documents:         $0.05 per 1,000 chars via x402

Authentication:  OAuth 2.1 via APIbase (agent registration required)
Quality:         #1 BLEU score (64.5 EN→DE), 82% industry adoption
Languages:       117 (source) / 117 (target)
Write API:       8 languages (EN, DE, FR, ES, PT, IT, NL, JA)
```

### GitHub Public Entry

```
github.com/apibase-pro/apibase/apis/translation/deepl/
│
├── README.md
│   # DeepL — Premium Machine Translation API
│   DeepL is the world's most accurate machine translation engine,
│   with 34% better quality than Google Translate (BLEU 64.5 vs 48.3).
│   Through APIbase, AI agents can translate text, improve writing,
│   and translate documents across 117 languages.
│
│   ## Available Tools
│   - translate-text: Translate text between 117 languages
│   - translate-batch: Translate up to 50 texts at once
│   - improve-text: Improve grammar, style, tone (Write API)
│   - detect-language: Identify text language
│   - translate-document: Translate DOCX/PDF/PPTX with formatting
│   - list-languages: Available language pairs
│
│   ## Quality
│   BLEU EN→DE: DeepL 64.5 vs Google 48.3 vs ChatGPT 62.1
│   82% of translation companies use DeepL (2024 ALC Survey)
│
│   ## Quick Start
│   POST apibase.pro/api/v1/discover {"query": "translation"}
│
├── capabilities.json
│   {
│     "provider": "deepl",
│     "category": "translation",
│     "tools_count": 6,
│     "read_auth_required": false,
│     "trade_auth_required": false,
│     "x402_enabled": true,
│     "x402_upstream": false,
│     "languages": 117,
│     "quality_bleu_en_de": 64.5,
│     "write_api": true,
│     "document_translation": true
│   }
│
└── examples.md
    # Examples
    ## Translate text
    POST /api/v1/translate/text {"text": "Hello world", "target_language": "DE"}

    ## Improve text
    POST /api/v1/translate/improve {"text": "I thinks this good.", "language": "EN", "writing_style": "business"}

    ## Batch translate
    POST /api/v1/translate/batch {"texts": ["Hello", "Goodbye"], "target_language": "RU"}

    ## Detect language
    POST /api/v1/translate/detect {"text": "Bonjour le monde"}
```

**Not published on GitHub:** API keys, pricing strategy, multi-key rotation logic, glossary databases, quality routing rules.

---

## 7. Traffic Flow Diagram

### Text Translation (no caching — every call is upstream)

```
AI Agent                    APIbase.pro                     DeepL
    │                           │                               │
    │── translate-text ────────→│                               │
    │   text="Hello, how are   │                               │
    │   you doing today?"       │                               │
    │   target_language="RU"    │                               │
    │   Authorization: Bearer...│                               │
    │                           │── Verify agent (OAuth 2.1) ──→│ (internal)
    │                           │── Count characters: 31 ──────→│ (internal)
    │                           │── Check agent x402 balance ──→│ (internal)
    │                           │                               │
    │                           │── POST /v2/translate ────────→│
    │                           │   text[]="Hello, how are..."  │ api.deepl.com
    │                           │   target_lang=RU               │
    │                           │   Auth: DeepL-Auth-Key PRO_KEY │
    │                           │←── 200 OK ───────────────────│
    │                           │   {"translations": [{          │
    │                           │     "detected_source_language": │
    │                           │     "EN",                      │
    │                           │     "text": "Привет, как..."  │
    │                           │   }]}                          │
    │                           │                               │
    │                           │   [normalize → translation    │
    │                           │    schema]                    │
    │                           │   [charge x402:               │
    │                           │    31 chars × $0.04/1K        │
    │                           │    = $0.00124]                │
    │                           │   [upstream cost:             │
    │                           │    31 chars × $0.025/1K       │
    │                           │    = $0.000775]               │
    │                           │   [margin: $0.000465 = 37.5%] │
    │                           │                               │
    │←── 200 OK ────────────────│                               │
    │   {                       │                               │
    │     source: {text: "Hello,│                               │
    │       ...", language: "EN"}│                              │
    │     target: {text: "Привет│                               │
    │       ...", language: "RU"}│                              │
    │     billing: {chars: 31,  │                               │
    │       cost: 0.00124}      │                               │
    │   }                       │                               │
```

### Write/Improve (unique DeepL feature)

```
AI Agent                    APIbase.pro                     DeepL
    │                           │                               │
    │── improve-text ──────────→│                               │
    │   text="I thinks this    │                               │
    │   is good idea for the   │                               │
    │   project."               │                               │
    │   language="EN"           │                               │
    │   writing_style="business"│                               │
    │                           │── POST /v2/write/rephrase ──→│
    │                           │   text[]="I thinks..."        │ api.deepl.com
    │                           │   target_lang=EN               │
    │                           │←── 200 OK ───────────────────│
    │                           │   {"improvements": [{         │
    │                           │     "text": "I think this is  │
    │                           │     a good idea for the       │
    │                           │     project."                 │
    │                           │   }]}                         │
    │                           │                               │
    │                           │   [normalize + diff analysis] │
    │                           │   [charge x402: $0.03/1K]     │
    │                           │                               │
    │←── 200 OK ────────────────│                               │
    │   {                       │                               │
    │     source: "I thinks..." │                               │
    │     improved: "I think..."│                               │
    │     changes: [            │                               │
    │       {type: "grammar",   │                               │
    │        "thinks" → "think"}│                               │
    │     ]                     │                               │
    │   }                       │                               │
```

### Cross-UC: Translate News Article (UC-006 → UC-007)

```
AI Agent                    APIbase.pro
    │                           │
    │── news-search ───────────→│   (UC-006)
    │   query="Ukraine"         │
    │   language="ru"           │
    │←── [Russian article] ────│
    │                           │
    │── translate-text ────────→│   (UC-007)
    │   text=[Russian article]  │
    │   target_language="EN"    │
    │                           │── POST /v2/translate ────→ DeepL
    │                           │   5,000 chars × $0.04/1K
    │                           │   = $0.20 per article
    │                           │
    │←── [English translation]──│
    │                           │
    │   Agent presents:         │
    │   "Ukrainian news (translated from Russian by DeepL):"
    │   [translated article text]
```

---

## 8. Monetization Model

| Revenue Stream | Mechanism | Expected per Month |
|---------------|-----------|-------------------|
| **Text translation** | $0.04/1K chars via x402. No caching — pure pass-through. | $200–2,000 |
| **Text improvement (Write)** | $0.03/1K chars. Unique feature — no competitor. | $50–500 |
| **Document translation** | $0.05/1K chars. Premium for formatting preservation. | $30–300 |
| **Batch translation** | $0.035/1K chars. Slight discount for bulk. | $50–500 |
| **Detection + utility** | $0.001/req. Low-cost utility calls. | $5–50 |

### Cost Structure

| Cost Item | Monthly | Notes |
|-----------|---------|-------|
| DeepL Pro base fee | $5.49 | Fixed monthly |
| DeepL usage ($25/M chars) | $50–500 | Variable: 2M–20M chars/month |
| **Total upstream cost** | **$55–505** | |
| **Expected revenue** | **$335–3,350** | |
| **Net margin** | **$280–2,845** | **37.5% on chars + 100% on base fee amortized** |

### Per-Character Economics

```
Unit economics (per 1,000 characters):
──────────────────────────────────────────────────────────────

Upstream cost (DeepL):    $0.025 per 1K chars
APIbase price:            $0.040 per 1K chars
Margin per 1K chars:      $0.015 (37.5%)

Real-world examples:
  Tweet (280 chars):         Cost $0.007,   Revenue $0.011,   Margin $0.004
  Email (2,000 chars):       Cost $0.050,   Revenue $0.080,   Margin $0.030
  News article (5,000):      Cost $0.125,   Revenue $0.200,   Margin $0.075
  Legal document (50,000):   Cost $1.250,   Revenue $2.000,   Margin $0.750
  Book chapter (100,000):    Cost $2.500,   Revenue $4.000,   Margin $1.500

Translation is HIGH-VALUE per interaction:
  1 translated article = $0.20 revenue
  1 news search (UC-006) = $0.01 revenue
  → Translation generates 20x more revenue per interaction!
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
| **UC-007** | **DeepL** | **Per-character quality proxy** | **$335–3.35K** | **$55–505** | **37.5%** |

**Key insight:** UC-007 имеет **фиксированную маржу 37.5%** (в отличие от UC-005/006 где маржа растёт с кэшированием). Но translation — **самая высокая цена per interaction** ($0.20 за статью vs $0.01 за news search). Revenue per session, а не per request.

---

## 9. Lessons Learned

### What works well about this integration

1. **First content transformation UC.** Все предыдущие UC-001..006 — data retrieval (получить данные). UC-007 — первый, который **трансформирует контент**. Это фундаментально расширяет возможности APIbase.

2. **Cross-cutting utility.** Перевод усиливает КАЖДЫЙ другой UC. Агент с `translate-text` может работать с новостями на 14 языках (UC-006), переводить описания криптовалют (UC-004), представлять погоду на родном языке (UC-005). Это **мультипликатор ценности всей платформы**.

3. **DeepL Write API = unique differentiator.** Ни Google, ни Microsoft не имеют equivalent. `improve-text` — инструмент без конкурентов, и он работает **без перевода** (улучшает текст на том же языке).

4. **No caching = predictable economics.** В отличие от UC-005/006, здесь нет кэширования. Каждый запрос = upstream call. Маржа фиксирована на 37.5%. Простая, предсказуемая unit economics.

5. **Highest revenue per interaction.** Перевод одной статьи = $0.20. Это в 20 раз больше, чем news search ($0.01). Меньше запросов, но выше ценность каждого.

### Challenges identified

1. **Fixed 37.5% margin.** Невозможно увеличить маржу через кэширование (каждый текст уникален). Единственный путь — объём. Нужно ~8.5M символов/мес для $100 чистой прибыли.

2. **LLM competition.** Claude, GPT-4 и другие LLM умеют переводить. Агент может спросить "переведи это" у самого себя вместо вызова API. Защита: DeepL quality выше (BLEU 64.5 vs GPT 62.1), и для production текстов (юридические, медицинские) качество критично.

3. **Per-character billing complexity.** В отличие от per-request billing (UC-001..006), per-character billing сложнее для агентов. APIbase должен чётко коммуницировать pricing model.

4. **Write API limited to 8 languages.** Улучшение текста доступно только для EN, DE, FR, ES, PT, IT, NL, JA. Для остальных 109 языков — только перевод.

5. **Document translation is async.** Загрузка → ожидание → скачивание. Не instant response. Нужен polling или webhook mechanism.

### Pattern: Premium Quality Proxy

```
Паттерн: Premium Quality Proxy
──────────────────────────────────────────────────────────
Условия применения:
  • Upstream провайдер предлагает ЛУЧШЕЕ качество в категории
  • Качество = основной differentiator (не цена, не coverage)
  • Данные не кэшируемы (каждый запрос уникален)

Стратегия APIbase:
  1. Подключить #1 quality provider (DeepL, не Google)
  2. Markup 37.5-60% на upstream cost
  3. Позиционирование: "best quality, no subscription needed"
  4. Агент платит per-use, не per-month — снижает порог входа
  5. Маржа фиксирована, масштаб = через объём

Применимо к:
  • DeepL (translation quality)
  • Потенциально: premium AI models (GPT-4, Claude) wrapping
  • Потенциально: premium data providers (Bloomberg, Reuters)
  • Любой API где quality > price в принятии решений
```

### Pattern: Cross-UC Utility Layer

```
Паттерн: Universal Utility (Cross-UC Enabler)
──────────────────────────────────────────────────────────
Концепция:
  • Некоторые API не standalone — они УСИЛИВАЮТ другие UC
  • Translation = "мультипликатор" для UC-001..006
  • Агент с translate + news + weather = 10x более capable

Synergy matrix (UC-007 × other UCs):
  × UC-001: Translate prediction market descriptions
  × UC-002: Translate booking confirmations, airport info
  × UC-003: Translate menus, delivery instructions
  × UC-004: Translate crypto whitepapers, project descriptions
  × UC-005: Present weather in user's native language
  × UC-006: Translate international news articles

Revenue multiplier:
  Agent using 1 UC = 1x revenue
  Agent using UC + translate = 1.5-2x revenue per session
  Agent using 3+ UCs + translate = 3-5x revenue per session
```

### Unique aspects of UC-007 vs previous use cases

| Aspect | UC-001 | UC-002 | UC-003 | UC-004 | UC-005 | UC-006 | **UC-007** |
|--------|--------|--------|--------|--------|--------|--------|---------|
| Category | Crypto | Travel | Food | Finance | Weather | News | **Translation** |
| Type | Data retrieval | Data+booking | Data+ordering | Data retrieval | Data retrieval | Data retrieval | **Content transform** |
| Upstream cost | $0 | $0 | ~$200 | $129–329 | $0–190 | $449 | **$55–505** |
| Billing unit | Per request | Per booking | Per action | Per request | Per request | Per request | **Per character** |
| Cacheable | Medium | Low | Low | Medium | Very High | High (prefetch) | **No (each unique)** |
| Margin | ~100% | ~100% | 60–96% | 52–91% | 73–95% | 31–90% | **37.5% fixed** |
| Revenue/interaction | $0.0005 | $4.40 | $50 CPA | $0.002 | $0.002 | $0.01 | **$0.04–0.20** |
| Cross-UC synergy | Low | Medium | Low | Low | High | Very High | **Maximum (all UCs)** |
| MCP tools | 8 | 7 | 6 | 9 | 7 | 5 | **6** |
| Official MCP exists | No | No | No | No | No | No | **Yes (DeepL!)** |
