export interface SunriseSunsetDayResult {
  date: string;
  sunrise: string | number;
  sunset: string | number;
  first_light: string | number | null;
  last_light: string | number | null;
  dawn: string | number;
  dusk: string | number;
  solar_noon: string | number;
  golden_hour: string | number;
  day_length: string;
  nautical_twilight_begin: string | number;
  nautical_twilight_end: string | number;
  timezone: string;
  utc_offset: number;
  sun_altitude: number;
  sun_azimuth: number;
  sunrise_azimuth: number;
  sunset_azimuth: number;
  moonrise: string | number | null;
  moonset: string | number | null;
  moon_illumination: number;
  moon_phase: string;
  moon_phase_value: number;
  moon_always_up: boolean;
  moon_always_down: boolean;
  elevation: number;
}

export interface SunriseSunsetApiResponse {
  results: SunriseSunsetDayResult | SunriseSunsetDayResult[];
  status: string;
  error?: string;
  tzid?: string;
}
