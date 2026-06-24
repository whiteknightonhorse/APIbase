/**
 * Open-Meteo Marine API raw response types (UC-506).
 * https://marine-api.open-meteo.com/v1/marine
 *
 * License: CC BY 4.0 — free for commercial use with attribution.
 * Auth: None.
 */

export interface MarineHourlyUnits {
  time: string;
  wave_height?: string;
  wave_direction?: string;
  wave_period?: string;
  swell_wave_height?: string;
  swell_wave_direction?: string;
  swell_wave_period?: string;
  sea_surface_temperature?: string;
}

export interface MarineHourlyData {
  time: string[];
  wave_height?: (number | null)[];
  wave_direction?: (number | null)[];
  wave_period?: (number | null)[];
  swell_wave_height?: (number | null)[];
  swell_wave_direction?: (number | null)[];
  swell_wave_period?: (number | null)[];
  sea_surface_temperature?: (number | null)[];
}

export interface MarineApiResponse {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation: number;
  hourly_units: MarineHourlyUnits;
  hourly: MarineHourlyData;
}

export interface MarineHourlyPoint {
  time: string;
  wave_height_m?: number | null;
  wave_direction_deg?: number | null;
  wave_period_s?: number | null;
  swell_wave_height_m?: number | null;
  swell_wave_direction_deg?: number | null;
  swell_wave_period_s?: number | null;
  sea_surface_temperature_c?: number | null;
}
