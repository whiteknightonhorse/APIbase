// Bright Sky DWD API — raw response types (UC-570)

export interface BrightSkySource {
  id: number;
  dwd_station_id: string;
  observation_type: string;
  lat: number;
  lon: number;
  height: number;
  station_name: string;
  wmo_station_id: string;
  first_record: string;
  last_record: string;
  distance?: number;
}

export interface BrightSkyCurrentWeather {
  source_id: number;
  timestamp: string;
  cloud_cover: number | null;
  condition: string | null;
  dew_point: number | null;
  solar_10: number | null;
  solar_30: number | null;
  solar_60: number | null;
  precipitation_10: number | null;
  precipitation_30: number | null;
  precipitation_60: number | null;
  pressure_msl: number | null;
  relative_humidity: number | null;
  visibility: number | null;
  wind_direction_10: number | null;
  wind_direction_30: number | null;
  wind_direction_60: number | null;
  wind_speed_10: number | null;
  wind_speed_30: number | null;
  wind_speed_60: number | null;
  wind_gust_direction_10: number | null;
  wind_gust_direction_30: number | null;
  wind_gust_direction_60: number | null;
  wind_gust_speed_10: number | null;
  wind_gust_speed_30: number | null;
  wind_gust_speed_60: number | null;
  sunshine_30: number | null;
  sunshine_60: number | null;
  temperature: number | null;
  fallback_source_ids: Record<string, number>;
  icon: string | null;
}

export interface BrightSkyCurrentWeatherResponse {
  weather: BrightSkyCurrentWeather;
  sources: BrightSkySource[];
}

export interface BrightSkyWeatherHour {
  timestamp: string;
  source_id: number;
  precipitation: number | null;
  pressure_msl: number | null;
  sunshine: number | null;
  temperature: number | null;
  wind_direction: number | null;
  wind_speed: number | null;
  cloud_cover: number | null;
  dew_point: number | null;
  relative_humidity: number | null;
  visibility: number | null;
  wind_gust_direction: number | null;
  wind_gust_speed: number | null;
  condition: string | null;
  precipitation_probability: number | null;
  precipitation_probability_6h: number | null;
  solar: number | null;
  fallback_source_ids: Record<string, number>;
  icon: string | null;
}

export interface BrightSkyWeatherResponse {
  weather: BrightSkyWeatherHour[];
  sources: BrightSkySource[];
}

export interface BrightSkyAlert {
  id: number;
  alert_id: string;
  status: string;
  effective: string;
  onset: string;
  expires: string;
  category: string;
  response_type: string;
  urgency: string;
  severity: string;
  certainty: string;
  event_code: number;
  event_en: string;
  event_de: string;
  headline_en: string;
  headline_de: string;
  description_en: string;
  description_de: string;
  instruction_en: string;
  instruction_de: string;
}

export interface BrightSkyAlertLocation {
  warn_cell_id: number;
  name: string;
  name_short: string;
  district: string;
  state: string;
  state_short: string;
}

export interface BrightSkyAlertsResponse {
  alerts: BrightSkyAlert[];
  location: BrightSkyAlertLocation;
}

export interface BrightSkySourcesResponse {
  sources: BrightSkySource[];
}
