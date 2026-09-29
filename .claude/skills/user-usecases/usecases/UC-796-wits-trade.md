# UC-796 — World Bank WITS Trade & Tariffs (wits-trade)

## Meta

| Field | Value |
|-------|-------|
| ID | UC-796 |
| Provider | World Bank WITS — World Integrated Trade Solution (wits.worldbank.org/API/V1) |
| Category | finance |
| Date | 2026-09-29 |
| Status | LIVE (local build/deploy only — not yet pushed to production or Smithery) |
| Tools | 2 |
| Auth | None (public SDMX-JSON API) |
| License | World Bank open data terms (CC BY 4.0 attribution); trade data from UN Comtrade, tariffs from UNCTAD TRAINS |

## Overview

WITS is the World Bank's trade-statistics portal. Its SDMX-JSON API returns annual trade flows
(export/import value, partner and product shares, concentration indices) and tariff statistics
(MFN and applied simple/weighted averages, max rates, duty-free shares) for any reporter country,
partner (or World), product/sector and year(s). No key, no documented rate limit. The list
endpoints (countries, products, indicators) only return XML, so they are not wrapped; valid
indicator codes are documented in the tool schemas instead.

Note: UC number chosen as highest existing + 1 (796) because the resort registry's
`next_uc_number` (776/777) collided with existing UC files.

## API Endpoints Verified

| Endpoint | Description |
|----------|-------------|
| `/API/V1/SDMX/V21/datasource/tradestats-trade/reporter/{r}/year/{y}/partner/{p}/product/{c}/indicator/{i}?format=JSON` | Trade flow indicators |
| `/API/V1/SDMX/V21/datasource/tradestats-tariff/reporter/{r}/year/{y}/partner/{p}/product/{c}/indicator/{i}?format=JSON` | Tariff indicators |

Multiple years are `;`-separated (adapter accepts comma-separated, max 10). Unknown reporter → HTTP 404
NoRecordsFound (mapped to 422).

## Tool Mapping

| Tool ID | MCP Name | Price | TTL | Description |
|---------|----------|-------|-----|-------------|
| `wits-trade.trade_stats` | `wits-trade.trade.get_stats` | $0.002 | 86400s | Trade flow indicators (default XPRT-TRD-VL export value) |
| `wits-trade.tariff_stats` | `wits-trade.tariff.get_stats` | $0.002 | 86400s | Tariff indicators (default MFN-WGHTD-AVRG) |

Both tools: category `finance`, annotations `READ_ONLY`.

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin | Cache TTL |
|------|--------------|-----------|--------|-----------|
| wits-trade.trade_stats | $0 (open API) | $0.002 | ~100% | 86400s — annual data |
| wits-trade.tariff_stats | $0 (open API) | $0.002 | ~100% | 86400s — annual data |

## Input Schemas

Both tools: `reporter` (ISO3, required), `year` (e.g. "2020" or "2018,2019", required), `partner`
(default "wld"), `product` (default "Total"; sector codes or HS codes), `indicator` (tool-specific default).

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/wits-trade/index.ts` | `WitsTradeAdapter` — builds SDMX path, flattens SDMX-JSON into `{reporter, partner, product, indicator, observations[{year,value}]}` |
| `src/adapters/wits-trade/types.ts` | SDMX-JSON response types |
| `src/schemas/wits-trade.schema.ts` | Zod schemas |
| `scripts/test-wits-trade.sh` | Smoke test |
