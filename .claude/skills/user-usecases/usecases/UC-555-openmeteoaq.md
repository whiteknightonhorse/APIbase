# UC-555 — Open-Meteo Air Quality

## Meta

| Field | Value |
|-------|-------|
| **UC ID** | UC-555 |
| **Provider** | Open-Meteo Air Quality API |
| **Category** | Weather / Air Quality |
| **Status** | LIVE |
| **Date** | 2026-06-30 |
| **Tools** | 4 |
| **Auth** | None (open access) |
| **Upstream cost** | $0 (free, unlimited) |
| **Adapter** | `src/adapters/openmeteoaq/` |

## Provider Overview

Open-Meteo Air Quality API provides global air quality data powered by the Copernicus Atmosphere
Monitoring Service (CAMS). Data includes PM10, PM2.5, ozone, nitrogen dioxide, sulphur dioxide,
carbon monoxide, dust, aerosol optical depth, UV index, ammonia, European AQI, US AQI, and pollen
concentrations for six allergens. No registration or API key required. CC BY 4.0 license.

- **API base URL:** `https://air-quality-api.open-meteo.com/v1/air-quality`
- **Coverage:** Global
- **Update frequency:** Hourly
- **Historical data:** From 2022-01-01

## Tool Mapping

| Tool ID | MCP Name | Price | Cache TTL | Description |
|---------|----------|-------|-----------|-------------|
| `openmeteoaq.current` | `openmeteoaq.air.current` | $0.001 | 1800s | Current air quality snapshot (PM2.5/PM10, AQI EU+US, 13 variables) |
| `openmeteoaq.forecast` | `openmeteoaq.air.forecast` | $0.002 | 1800s | Hourly pollutant forecast (1–7 days) |
| `openmeteoaq.historical` | `openmeteoaq.air.historical` | $0.002 | 86400s | Historical hourly data by date range (from 2022) |
| `openmeteoaq.pollen` | `openmeteoaq.air.pollen` | $0.001 | 1800s | Pollen forecast (alder, birch, grass, mugwort, olive, ragweed) |

## Input Schemas

### openmeteoaq.current
```json
{
  "latitude": -90..90,
  "longitude": -180..180,
  "timezone": "UTC" (optional, IANA name)
}
```

### openmeteoaq.forecast
```json
{
  "latitude": -90..90,
  "longitude": -180..180,
  "timezone": "UTC" (optional),
  "forecast_days": 1-7 (default 3),
  "pollutants": "pm10,pm2_5,ozone,..." (optional, comma-separated)
}
```

### openmeteoaq.historical
```json
{
  "latitude": -90..90,
  "longitude": -180..180,
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "timezone": "UTC" (optional),
  "pollutants": "pm10,pm2_5,european_aqi,..." (optional)
}
```

### openmeteoaq.pollen
```json
{
  "latitude": -90..90,
  "longitude": -180..180,
  "timezone": "UTC" (optional),
  "forecast_days": 1-7 (default 3)
}
```

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/openmeteoaq/index.ts` | Main adapter (no auth, URL-param routing) |
| `src/adapters/openmeteoaq/types.ts` | TypeScript response + output interfaces |
| `src/schemas/openmeteoaq.schema.ts` | Zod schemas with full `.describe()` |
| `src/adapters/registry.ts` | Case `'openmeteoaq'` registered |
| `src/schemas/index.ts` | Schema import added |
| `src/mcp/tool-definitions.ts` | 4 tool definitions (3-level mcpName) |
| `config/tool_provider_config.yaml` | Pricing + TTL config |
| `src/config/provider-limits.json` | Dashboard entry (unlimited) |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|-------------|-----------|--------|
| `openmeteoaq.current` | $0 | $0.001 | 100% |
| `openmeteoaq.forecast` | $0 | $0.002 | 100% |
| `openmeteoaq.historical` | $0 | $0.002 | 100% |
| `openmeteoaq.pollen` | $0 | $0.001 | 100% |

Forecast and historical carry a slightly higher price ($0.002) because they return up to 168 hourly
records per call (7 days × 24h), significantly more data than a point-in-time current reading.

## ToS / Resale

Open-Meteo is CC BY 4.0. Commercial use and resale is permitted with attribution. No API key
required. The service is free for non-commercial use; commercial users are encouraged to subscribe
but the API itself is publicly accessible. No resale restriction found.
