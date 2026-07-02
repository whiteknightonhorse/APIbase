# UC-593 — JMA Bosai (Japan Meteorological Agency Disaster Prevention)

## Meta

| Field | Value |
|-------|-------|
| ID | UC-593 |
| Provider | JMA Bosai (www.jma.go.jp/bosai) |
| Category | weather (Japan) |
| Date | 2026-07-02 |
| Status | LIVE |
| Tools | 5 |
| Auth | None (Japanese Government open data, e-Gov) |
| License | Japanese Government open data (no explicit OS license; public domain by practice) |

## Overview

Japan Meteorological Agency (気象庁, JMA) is the official national agency responsible for weather forecasting, earthquake monitoring, volcano surveillance, and disaster prevention in Japan. The Bosai (防災, disaster prevention) portal provides structured JSON APIs for weather forecasts, warnings/advisories, and seismic data. All endpoints are open and require no API key or registration.

## API Endpoints Verified

| Endpoint | Method | Description |
|----------|--------|-------------|
| `https://www.jma.go.jp/bosai/forecast/data/forecast/{area_code}.json` | GET | 3-day weather forecast by JMA area code |
| `https://www.jma.go.jp/bosai/forecast/data/overview_forecast/{area_code}.json` | GET | Official weather overview text by area |
| `https://www.jma.go.jp/bosai/warning/data/warning/{area_code}.json` | GET | Active weather warnings/advisories by area |
| `https://www.jma.go.jp/bosai/quake/data/list.json` | GET | Recent earthquake list (all Japan) |
| `https://www.jma.go.jp/bosai/common/const/area.json` | GET | JMA area/office reference (static lookup) |

## Tool Mapping

| Tool ID | MCP Name | Endpoint | Price | TTL | Description |
|---------|----------|----------|-------|-----|-------------|
| `jma-bosai.forecast` | `jma-bosai.weather.forecast` | GET /bosai/forecast/data/forecast/{code}.json | $0.001 | 3600s | Official 3-day weather forecast (codes, descriptions, wind, pop%, temp) |
| `jma-bosai.overview` | `jma-bosai.weather.overview` | GET /bosai/forecast/data/overview_forecast/{code}.json | $0.001 | 3600s | Narrative weather overview text (headline + full summary in Japanese) |
| `jma-bosai.warnings` | `jma-bosai.weather.warnings` | GET /bosai/warning/data/warning/{code}.json | $0.001 | 600s | Active warnings/advisories with codes and statuses |
| `jma-bosai.earthquakes` | `jma-bosai.seismic.recent` | GET /bosai/quake/data/list.json | $0.001 | 60s | Recent JMA earthquakes (magnitude, Shindo intensity, epicenter, coordinates) |
| `jma-bosai.areas` | `jma-bosai.reference.areas` | GET /bosai/common/const/area.json | $0.001 | 86400s | JMA area code reference list (58 offices, EN + JA names) |

## Common Area Codes

| Code | English Name | Notes |
|------|-------------|-------|
| 130000 | Tokyo | 東京地方 |
| 270000 | Osaka | 大阪府 |
| 230000 | Aichi (Nagoya) | 愛知県 |
| 400000 | Fukuoka | 福岡県 |
| 140000 | Kanagawa | 神奈川県 |
| 280000 | Hyogo (Kobe) | 兵庫県 |
| 010100 | Hokkaido Sapporo | 石狩・空知・後志地方 |
| 460100 | Kagoshima | 鹿児島県 |
| 471000 | Okinawa | 沖縄本島地方 |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| jma-bosai.forecast | $0 (open data) | $0.001 | ~100% |
| jma-bosai.overview | $0 (open data) | $0.001 | ~100% |
| jma-bosai.warnings | $0 (open data) | $0.001 | ~100% |
| jma-bosai.earthquakes | $0 (open data) | $0.001 | ~100% |
| jma-bosai.areas | $0 (open data) | $0.001 | ~100% |

All tools are no-auth open data — our price covers infrastructure and pipeline cost.

## Input Schemas

### jma-bosai.forecast
```json
{
  "area_code": "string (6-digit JMA office code, default: '130000' = Tokyo)"
}
```

### jma-bosai.overview
```json
{
  "area_code": "string (6-digit JMA office code, default: '130000' = Tokyo)"
}
```

### jma-bosai.warnings
```json
{
  "area_code": "string (6-digit JMA office code, default: '130000' = Tokyo)"
}
```

### jma-bosai.earthquakes
```json
{
  "limit": "integer (1-100, default 20)",
  "min_magnitude": "number (0.0-9.9, optional filter)"
}
```

### jma-bosai.areas
```json
{
  "name_filter": "string (optional English keyword filter, case-insensitive)"
}
```

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/jma-bosai/index.ts` | Main adapter class |
| `src/adapters/jma-bosai/types.ts` | TypeScript interfaces for API responses |
| `src/schemas/jma-bosai.schema.ts` | Zod input schemas |
| `src/adapters/registry.ts` | Case `'jma-bosai'` → JmaBosaiAdapter |
| `src/schemas/index.ts` | Schema registry import |
| `src/mcp/tool-definitions.ts` | 5 tool definitions |
| `config/tool_provider_config.yaml` | Prices and TTLs |
| `src/config/provider-limits.json` | Dashboard config |
| `scripts/test-jma-bosai.sh` | Smoke test script |

## Notes

- Area overview text (`jma-bosai.overview`) is in Japanese — agents may need translation if serving non-Japanese users.
- JMA earthquake data is the official government feed; for real-time community data with Shindo observation points, use `p2pquake.seismic.recent` (UC-592) which sources from the same JMA data.
- Warning codes: 02=Wind, 03=Wave, 04=Thunderstorm, 05=Heavy Rain, 06=Windstorm, 10=Tsunami, 12=Snow, 14=Avalanche, 15=Flood, 20=High Wave.
- The `areas` endpoint is cached for 24 hours — area codes are very stable.
