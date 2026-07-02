/**
 * JMA Bosai (Japan Meteorological Agency Disaster Prevention) API response types (UC-593).
 *
 * API host: www.jma.go.jp/bosai
 * Auth: None (Japanese Government open data, no registration required)
 *
 * Endpoints:
 *   GET /bosai/forecast/data/forecast/{area_code}.json   — 3-day weather forecast
 *   GET /bosai/forecast/data/overview_forecast/{area}.json — Textual weather overview
 *   GET /bosai/warning/data/warning/{area_code}.json     — Active warnings/advisories
 *   GET /bosai/quake/data/list.json                      — Recent earthquake list
 *   GET /bosai/common/const/area.json                    — JMA area/office reference
 */

// ---------------------------------------------------------------------------
// Area reference
// ---------------------------------------------------------------------------

export interface JmaOffice {
  name: string;
  enName: string;
  officeName: string;
  parent: string;
  children: string[];
}

export interface JmaAreaConst {
  centers: Record<string, { name: string; enName: string; officeName: string; children: string[] }>;
  offices: Record<string, JmaOffice>;
  class10s: Record<string, { name: string; enName: string; parent: string; children: string[] }>;
  class15s: Record<string, { name: string; enName: string; parent: string; children: string[] }>;
  class20s: Record<string, { name: string; enName: string; parent: string; isLeaf: boolean }>;
}

// ---------------------------------------------------------------------------
// Forecast
// ---------------------------------------------------------------------------

export interface JmaForecastArea {
  area: { name: string; code: string };
  weatherCodes?: string[];
  weathers?: string[];
  winds?: string[];
  waves?: string[];
  pops?: string[]; // Precipitation probability (%)
  temps?: string[]; // Temperature (°C)
  tempsMax?: string[];
  tempsMin?: string[];
}

export interface JmaForecastTimeSeries {
  timeDefines: string[];
  areas: JmaForecastArea[];
}

export interface JmaForecastEntry {
  publishingOffice: string;
  reportDatetime: string;
  timeSeries: JmaForecastTimeSeries[];
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export interface JmaOverview {
  publishingOffice: string;
  reportDatetime: string;
  targetArea: string;
  headlineText: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Warnings
// ---------------------------------------------------------------------------

export interface JmaWarningItem {
  code?: string;
  status: string;
  levels?: { announce: string; last: string }[];
}

export interface JmaWarningAreaEntry {
  code: string;
  warnings: JmaWarningItem[];
}

export interface JmaWarningAreaType {
  areas: JmaWarningAreaEntry[];
}

export interface JmaWarningTimeSeries {
  timeDefines: string[];
  areaTypes: JmaWarningAreaType[];
}

export interface JmaWarningResponse {
  reportDatetime: string;
  publishingOffice: string;
  headlineText: string;
  areaTypes: JmaWarningAreaType[];
  timeSeries: JmaWarningTimeSeries[];
}

// ---------------------------------------------------------------------------
// Earthquakes
// ---------------------------------------------------------------------------

export interface JmaQuakeIntensityPoint {
  code: string;
  maxi: string;
  city?: { code: string; maxi: string }[];
}

export interface JmaQuakeListEntry {
  ctt: string;
  eid: string;
  rdt: string; // Report datetime ISO 8601
  ttl: string; // Title (Japanese)
  ift: string; // Information type
  ser: string; // Serial number
  at: string; // Earthquake occurrence time ISO 8601
  anm: string; // Area name (Japanese)
  acd: string; // Area code
  cod: string; // Coordinate string "+lat+lon-depthm/"
  mag: string; // Magnitude
  maxi: string; // Maximum JMA intensity (shindo)
  int?: JmaQuakeIntensityPoint[]; // Prefecture intensity list
  json: string; // Detailed JSON filename
  en_ttl: string; // Title (English)
  en_anm: string; // Area name (English)
}
