// Types for Norwegian Meteorological Institute (MET Norway) API responses

export interface MetGeometry {
  type: string;
  coordinates: number[];
}

export interface MetForecastInstant {
  air_pressure_at_sea_level?: number;
  air_temperature?: number;
  cloud_area_fraction?: number;
  cloud_area_fraction_high?: number;
  cloud_area_fraction_low?: number;
  cloud_area_fraction_medium?: number;
  dew_point_temperature?: number;
  fog_area_fraction?: number;
  relative_humidity?: number;
  ultraviolet_index_clear_sky?: number;
  wind_from_direction?: number;
  wind_speed?: number;
  wind_speed_of_gust?: number;
}

export interface MetForecastSummary {
  symbol_code: string;
}

export interface MetForecastPeriod {
  summary?: MetForecastSummary;
  details?: {
    air_temperature_max?: number;
    air_temperature_min?: number;
    precipitation_amount?: number;
    precipitation_amount_max?: number;
    precipitation_amount_min?: number;
    probability_of_precipitation?: number;
    probability_of_thunder?: number;
  };
}

export interface MetForecastEntry {
  time: string;
  data: {
    instant: { details: MetForecastInstant };
    next_1_hours?: MetForecastPeriod;
    next_6_hours?: MetForecastPeriod;
    next_12_hours?: MetForecastPeriod;
  };
}

export interface MetForecastResponse {
  type: string;
  geometry: MetGeometry;
  properties: {
    meta: {
      updated_at: string;
      units: Record<string, string>;
    };
    timeseries: MetForecastEntry[];
  };
}

export interface MetNowcastInstant {
  air_temperature?: number;
  precipitation_rate?: number;
  relative_humidity?: number;
  ultraviolet_index_clear_sky?: number;
  wind_from_direction?: number;
  wind_speed?: number;
  wind_speed_of_gust?: number;
}

export interface MetNowcastEntry {
  time: string;
  data: {
    instant: { details: MetNowcastInstant };
    next_1_hours?: MetForecastPeriod;
  };
}

export interface MetNowcastResponse {
  type: string;
  geometry: MetGeometry;
  properties: {
    meta: {
      updated_at: string;
      radar_coverage: string;
      units: Record<string, string>;
    };
    timeseries: MetNowcastEntry[];
  };
}

export interface MetAlertProperties {
  event?: string;
  eventAwarenessName?: string;
  awareness_level?: string;
  awareness_type?: string;
  awarenessSeriousness?: string;
  awarenessResponse?: string;
  certainty?: string;
  description?: string;
  consequences?: string;
  instruction?: string;
  area?: string;
  county?: string[];
  geographicDomain?: string;
  severity?: string;
  contact?: string;
}

export interface MetAlertFeature {
  type: string;
  geometry: Record<string, unknown> | null;
  properties: MetAlertProperties;
  when?: {
    interval?: string[];
  };
}

export interface MetAlertsResponse {
  type: string;
  features: MetAlertFeature[];
  lang: string;
  lastChange: string;
}

export interface MetSunriseProps {
  body: string;
  sunrise?: { time: string; azimuth?: number };
  sunset?: { time: string; azimuth?: number };
  solarnoon?: { time: string; disc_centre_elevation?: number; visible?: boolean };
  solarmidnight?: { time: string; disc_centre_elevation?: number; visible?: boolean };
  moonrise?: { time: string; azimuth?: number };
  moonset?: { time: string; azimuth?: number };
  high_moon?: { time: string; disc_centre_elevation?: number; visible?: boolean };
  low_moon?: { time: string; disc_centre_elevation?: number; visible?: boolean };
  moonphase?: number;
}

export interface MetSunriseResponse {
  type: string;
  geometry: MetGeometry;
  when: { interval: string[] };
  properties: MetSunriseProps;
}
