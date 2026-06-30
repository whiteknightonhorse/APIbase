export interface OpenMeteoAqCurrentResponse {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation: number;
  current_units: Record<string, string>;
  current: {
    time: string;
    interval: number;
    pm10?: number;
    pm2_5?: number;
    carbon_monoxide?: number;
    nitrogen_dioxide?: number;
    sulphur_dioxide?: number;
    ozone?: number;
    aerosol_optical_depth?: number;
    dust?: number;
    uv_index?: number;
    uv_index_clear_sky?: number;
    ammonia?: number;
    european_aqi?: number;
    us_aqi?: number;
  };
}

export interface OpenMeteoAqHourlyResponse {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation: number;
  hourly_units: Record<string, string>;
  hourly: Record<string, (number | null)[]>;
}

export interface OpenMeteoAqPollenResponse {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation: number;
  current_units: Record<string, string>;
  current: {
    time: string;
    interval: number;
    alder_pollen?: number;
    birch_pollen?: number;
    grass_pollen?: number;
    mugwort_pollen?: number;
    olive_pollen?: number;
    ragweed_pollen?: number;
  };
  hourly_units?: Record<string, string>;
  hourly?: Record<string, (number | null)[]>;
}

export interface AqCurrentOutput {
  latitude: number;
  longitude: number;
  timezone: string;
  elevation_m: number;
  observed_at: string;
  pm10_ug_m3: number | null;
  pm2_5_ug_m3: number | null;
  carbon_monoxide_ug_m3: number | null;
  nitrogen_dioxide_ug_m3: number | null;
  sulphur_dioxide_ug_m3: number | null;
  ozone_ug_m3: number | null;
  aerosol_optical_depth: number | null;
  dust_ug_m3: number | null;
  uv_index: number | null;
  uv_index_clear_sky: number | null;
  ammonia_ug_m3: number | null;
  european_aqi: number | null;
  us_aqi: number | null;
  units: Record<string, string>;
}

export interface AqHourlyRecord {
  time: string;
  [key: string]: number | null | string;
}

export interface AqForecastOutput {
  latitude: number;
  longitude: number;
  timezone: string;
  elevation_m: number;
  forecast_days: number;
  pollutants: string[];
  units: Record<string, string>;
  records: AqHourlyRecord[];
}

export interface PollenRecord {
  time: string;
  alder_grains_m3: number | null;
  birch_grains_m3: number | null;
  grass_grains_m3: number | null;
  mugwort_grains_m3: number | null;
  olive_grains_m3: number | null;
  ragweed_grains_m3: number | null;
}

export interface AqPollenOutput {
  latitude: number;
  longitude: number;
  timezone: string;
  elevation_m: number;
  current_time: string;
  current: {
    alder_grains_m3: number | null;
    birch_grains_m3: number | null;
    grass_grains_m3: number | null;
    mugwort_grains_m3: number | null;
    olive_grains_m3: number | null;
    ragweed_grains_m3: number | null;
  };
  forecast_hours: number;
  hourly: PollenRecord[];
}
