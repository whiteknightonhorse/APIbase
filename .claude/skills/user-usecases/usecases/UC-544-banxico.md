# UC-544 — Banco de México SIE

## Meta

| Field       | Value                                |
|-------------|--------------------------------------|
| ID          | UC-544                               |
| Provider    | Banco de México (Banxico) SIE        |
| Category    | Finance                              |
| Date        | 2026-06-30                           |
| Status      | LIVE                                 |
| Tools       | 5                                    |
| Auth        | Bmx-Token header (free registration) |
| Upstream    | $0 (official government open data)   |
| Our Price   | $0.001 / call                        |

## Provider Overview

The **Sistema de Información Económica (SIE)** is Banco de México's official time-series database
serving 15,000+ economic and financial series: exchange rates, interest rates, inflation, monetary
aggregates, balance of payments, and more. Data is provided under Mexico's open government data
framework (no resale restrictions). Registration at banxico.org.mx yields a permanent Bmx-Token.

API base: `https://www.banxico.org.mx/SieAPIRest/service/v1/`

### Key Endpoints Used

| Endpoint | Description |
|----------|-------------|
| `GET /series/{id}/datos/oportuno` | Latest observation for one or more series |
| `GET /series/{id}/datos/{start}/{end}` | Historical range (ISO `YYYY-MM-DD` dates) |
| Supports comma-separated series IDs for multi-series in one call | |

### Authentication

Header: `Bmx-Token: <token>`
Stored in `.env` as `PROVIDER_KEY_BANXICO`.

## Tool Mapping

| toolId              | mcpName                   | Series ID | Description                            | Price     | Cache  |
|---------------------|---------------------------|-----------|----------------------------------------|-----------|--------|
| banxico.fix_rate    | banxico.fx.fix_rate       | SF43718   | Official USD/MXN FIX rate              | $0.001    | 300s   |
| banxico.fx_rates    | banxico.fx.rates          | SF43718, SF46410, SF60632, SF60633 | Multi-currency MXN rates (USD/EUR/CAD/GBP) | $0.001 | 300s |
| banxico.target_rate | banxico.rates.target      | SF61745   | Overnight policy target rate           | $0.001    | 3600s  |
| banxico.tiie_rate   | banxico.rates.tiie        | SF43783   | TIIE 28-day interbank rate             | $0.001    | 3600s  |
| banxico.cpi         | banxico.inflation.cpi     | SP1       | INPC consumer price index              | $0.001    | 86400s |

## Input Schemas

### banxico.fix_rate / banxico.target_rate / banxico.tiie_rate / banxico.cpi
```json
{
  "start_date": "string (YYYY-MM-DD, optional) — start of historical range",
  "end_date":   "string (YYYY-MM-DD, optional) — end of historical range"
}
```
Omit both for the latest observation only.

### banxico.fx_rates
```json
{
  "locale": "string (optional, reserved)"
}
```

## Pricing Rationale

| Field              | Value       |
|--------------------|-------------|
| Upstream cost      | $0.00 (government open data, free token) |
| Our price          | $0.001/call |
| Margin             | ~100%       |
| Cache strategy     | FX 300s, rates 3600s, CPI 86400s (monthly) |

Pricing follows the same $0.001 floor used for all no-cost government data providers
(BCB, IBGE, BrasilAPI, OpenFEMA, etc.).

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/banxico/index.ts` | Main adapter (BanxicoAdapter) |
| `src/schemas/banxico.schema.ts` | Zod schemas for all 5 tools |
| `src/adapters/registry.ts` | `case 'banxico'` registration |
| `src/schemas/index.ts` | banxicoSchemas spread |
| `src/mcp/tool-definitions.ts` | 5 tool definitions with 3-level mcpName |
| `config/tool_provider_config.yaml` | Tool pricing and TTLs |
| `src/config/env.ts` | PROVIDER_KEY_BANXICO schema |
| `src/config/provider-limits.json` | Dashboard entry |
| `scripts/test-banxico.sh` | Smoke test script |

## Notes

- Multi-series endpoint supports comma-separated IDs — `banxico.fx_rates` fetches USD/EUR/CAD/GBP in a single HTTP call
- Date range uses ISO `YYYY-MM-DD` format (not DD/MM/YYYY as the UI shows)
- FIX rate is the official Banxico-published spot rate for settling FX obligations in Mexico
- TIIE 28d is the primary benchmark rate for Mexican peso credit products (mortgages, business loans)
