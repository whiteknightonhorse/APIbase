/**
 * WeatherAPI.com types (UC-243).
 * Global weather — 100K+ stations, 10M calls/month.
 */

export interface WALocation {
  name: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
  tz_id: string;
  localtime: string;
}

export interface WACondition {
  text: string;
  icon: string;
  code: number;
}

export interface WACurrent {
  temp_c: number;
  temp_f: number;
  is_day: number;
  condition: WACondition;
  wind_mph: number;
  wind_kph: number;
  wind_dir: string;
  pressure_mb: number;
  humidity: number;
  cloud: number;
  feelslike_c: number;
  feelslike_f: number;
  vis_km: number;
  uv: number;
  gust_kph: number;
}

export interface WAForecastDay {
  date: string;
  day: {
    maxtemp_c: number;
    mintemp_c: number;
    avgtemp_c: number;
    maxwind_kph: number;
    totalprecip_mm: number;
    avghumidity: number;
    daily_chance_of_rain: number;
    daily_chance_of_snow: number;
    condition: WACondition;
    uv: number;
  };
}

export interface WAAstro {
  sunrise: string;
  sunset: string;
  moonrise: string;
  moonset: string;
  moon_phase: string;
  moon_illumination: number;
}

// Normalized outputs

export interface CurrentOutput {
  location: string;
  country: string;
  region: string;
  lat: number;
  lon: number;
  timezone: string;
  local_time: string;
  temp_c: number;
  temp_f: number;
  condition: string;
  wind_kph: number;
  wind_dir: string;
  humidity: number;
  pressure_mb: number;
  feelslike_c: number;
  visibility_km: number;
  uv_index: number;
  cloud_pct: number;
}

export interface ForecastOutput {
  location: string;
  country: string;
  days: Array<{
    date: string;
    min_c: number;
    max_c: number;
    avg_c: number;
    condition: string;
    max_wind_kph: number;
    precip_mm: number;
    humidity: number;
    rain_chance: number;
    snow_chance: number;
    uv: number;
  }>;
}

export interface AstronomyOutput {
  location: string;
  date: string;
  sunrise: string;
  sunset: string;
  moonrise: string;
  moonset: string;
  moon_phase: string;
  moon_illumination: number;
}

export interface SearchOutput {
  results: Array<{
    name: string;
    region: string;
    country: string;
    lat: number;
    lon: number;
  }>;
  count: number;
}
