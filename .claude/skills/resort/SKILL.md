---
name: resort
description: "Полная методология поиска, оценки и отбора API для интеграции в APIbase. Содержит: процесс исследования кандидатов, матрицу оценки по 12 параметрам, библиотеку монетизационных паттернов, стратегию покрытия категорий, и пошаговый workflow создания UC-файла. Используй этот скилл при добавлении нового юзкейса или оценке нового API-провайдера."
user-invocable: true
argument-hint: "[topic: 'process' | 'matrix' | 'patterns' | 'categories' | 'checklist' | 'all']"
allowed-tools: Read, Grep, Glob
---

# APIbase Resort — API Research & Selection Methodology

Систематизированная методология поиска и отбора API-провайдеров для платформы APIbase.
Создана на основе опыта 8 реальных интеграций (UC-001..UC-008).

## Содержание

| # | Раздел | Описание | Файл |
|---|--------|----------|------|
| 1 | Research Process | Пошаговый процесс исследования от категории до финального UC | `docs/01-research-process.md` |
| 2 | Evaluation Matrix | 12 параметров оценки API-кандидатов с весами и scoring | `docs/02-evaluation-matrix.md` |
| 3 | Monetization Patterns | Библиотека всех монетизационных паттернов (8 из UC-001..008) | `docs/03-monetization-patterns.md` |
| 4 | Category Strategy | Стратегия покрытия категорий, приоритеты, "holy trinity" | `docs/04-category-strategy.md` |
| 5 | UC Creation Checklist | Checklist создания UC-файла: 9 секций, что где проверять | `docs/05-uc-creation-checklist.md` |

## Quick Start

- `/resort process` — как начать исследование нового API
- `/resort matrix` — по каким параметрам оцениваю кандидатов
- `/resort patterns` — библиотека монетизационных паттернов
- `/resort categories` — стратегия покрытия категорий
- `/resort checklist` — checklist создания UC-файла
- `/resort all` — всё вместе

## Принципы отбора (Top-3 правила)

1. **Каждый новый UC должен вводить НОВЫЙ монетизационный паттерн** — повторение паттерна снижает ценность портфолио
2. **Контраст с существующими UC** — новый UC должен отличаться по типу данных, billing модели, caching стратегии
3. **Agent utility > API quality** — лучше средний API с высоким спросом у агентов, чем идеальный API который никто не спросит

---

Read the docs files from the `docs/` directory relative to this skill for detailed information.
If $ARGUMENTS is empty, show this index.
If $ARGUMENTS matches a topic, read and present the corresponding doc file.
If $ARGUMENTS is "all", present all doc files sequentially.
