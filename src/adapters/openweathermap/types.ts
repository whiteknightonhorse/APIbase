/**
 * Raw OpenWeatherMap API response types (UC-005).
 *
 * Free tier endpoints:
 *   /data/2.5/weather   — current weather (accepts q or lat/lon)
 *   /data/2.5/forecast  — 5-day/3-hour forecast (accepts q or lat/lon)
 *   /geo/1.0/direct     — forward geocoding
 *   /geo/1.0/reverse    — reverse geocoding
 */

// ---------------------------------------------------------------------------
// /data/2.5/weather
// ---------------------------------------------------------------------------

export interface OwmWeatherCondition {
  id: number;
  main: string;
  description: string;
  icon: string;
}

export interface OwmCurrentResponse {
  coord: { lon: number; lat: number };
  weather: OwmWeatherCondition[];
  base: string;
  main: {
    temp: number;
    feels_like: number;
    temp_min: number;
    temp_max: number;
    pressure: number;
    humidity: number;
    sea_level?: number;
    grnd_level?: number;
  };
  visibility: number;
  wind: { speed: number; deg: number; gust?: number };
  clouds: { all: number };
  rain?: { '1h'?: number; '3h'?: number };
  snow?: { '1h'?: number; '3h'?: number };
  dt: number;
  sys: {
    type?: number;
    id?: number;
    country: string;
    sunrise: number;
    sunset: number;
  };
  timezone: number;
  id: number;
  name: string;
  cod: number;
}

// ---------------------------------------------------------------------------
// /data/2.5/forecast
// ---------------------------------------------------------------------------

export interface OwmForecastEntry {
  dt: number;
  main: {
    temp: number;
    feels_like: number;
    temp_min: number;
    temp_max: number;
    pressure: number;
    humidity: number;
    sea_level?: number;
    grnd_level?: number;
  };
  weather: OwmWeatherCondition[];
  clouds: { all: number };
  wind: { speed: number; deg: number; gust?: number };
  visibility: number;
  pop: number;
  rain?: { '3h'?: number };
  snow?: { '3h'?: number };
  sys: { pod: string };
  dt_txt: string;
}

export interface OwmForecastResponse {
  cod: string;
  message: number;
  cnt: number;
  list: OwmForecastEntry[];
  city: {
    id: number;
    name: string;
    coord: { lat: number; lon: number };
    country: string;
    population?: number;
    timezone: number;
    sunrise: number;
    sunset: number;
  };
}

// ---------------------------------------------------------------------------
// /geo/1.0/direct
// ---------------------------------------------------------------------------

export interface OwmGeocodingEntry {
  name: string;
  local_names?: Record<string, string>;
  lat: number;
  lon: number;
  country: string;
  state?: string;
}

export type OwmGeocodingResponse = OwmGeocodingEntry[];

// ---------------------------------------------------------------------------
// Location parsing
// ---------------------------------------------------------------------------

export interface ParsedLocationCoords {
  type: 'coords';
  lat: number;
  lon: number;
}

export interface ParsedLocationCity {
  type: 'city';
  query: string;
}

export interface ParsedLocationZip {
  type: 'zip';
  zip: string;
  country: string;
}

export type ParsedLocation = ParsedLocationCoords | ParsedLocationCity | ParsedLocationZip;
