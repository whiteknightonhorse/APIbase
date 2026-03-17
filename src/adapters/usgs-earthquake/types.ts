/**
 * USGS Earthquake Hazards Program API response types (UC-048).
 *
 * API host: earthquake.usgs.gov
 * Auth: None (US Government open data, public domain)
 *
 * Endpoints:
 *   /fdsnws/event/1/query?format=geojson  — parametric search
 *   /earthquakes/feed/v1.0/summary/...    — real-time feeds
 *   /fdsnws/event/1/count                 — event count
 */

// ---------------------------------------------------------------------------
// GeoJSON Feature (single earthquake event)
// ---------------------------------------------------------------------------

export interface EarthquakeProperties {
  mag: number | null;
  place: string | null;
  time: number;
  updated: number;
  tz: number | null;
  url: string;
  detail: string;
  felt: number | null;
  cdi: number | null;
  mmi: number | null;
  alert: string | null;
  status: string;
  tsunami: number;
  sig: number;
  net: string;
  code: string;
  ids: string;
  sources: string;
  types: string;
  nst: number | null;
  dmin: number | null;
  rms: number | null;
  gap: number | null;
  magType: string | null;
  type: string;
  title: string;
}

export interface EarthquakeFeature {
  type: 'Feature';
  properties: EarthquakeProperties;
  geometry: {
    type: 'Point';
    coordinates: [number, number, number]; // [lon, lat, depth_km]
  };
  id: string;
}

// ---------------------------------------------------------------------------
// GeoJSON FeatureCollection (search/feed response)
// ---------------------------------------------------------------------------

export interface EarthquakeResponse {
  type: 'FeatureCollection';
  metadata: {
    generated: number;
    url: string;
    title: string;
    status: number;
    api: string;
    limit: number;
    offset: number;
    count?: number;
  };
  features: EarthquakeFeature[];
  bbox?: number[];
}

// ---------------------------------------------------------------------------
// Count response
// ---------------------------------------------------------------------------

export interface EarthquakeCountResponse {
  count: number;
  maxAllowed: number;
}
