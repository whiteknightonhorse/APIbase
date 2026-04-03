// ---------------------------------------------------------------------------
// Raw NWS API shapes (only fields we consume)
// ---------------------------------------------------------------------------

export interface NwsPointsProperties {
  forecast: string;
  forecastHourly: string;
  observationStations: string;
  relativeLocation: {
    properties: { city: string; state: string };
  };
  timeZone: string;
}

export interface NwsForecastPeriod {
  number: number;
  name: string;
  startTime: string;
  endTime: string;
  isDaytime: boolean;
  temperature: number;
  temperatureUnit: string;
  temperatureTrend: string | null;
  probabilityOfPrecipitation: { value: number | null; unitCode: string };
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
  detailedForecast: string;
}

export interface NwsStationFeature {
  properties: { stationIdentifier: string; name: string };
}

export interface NwsObservationProps {
  timestamp: string;
  textDescription: string;
  temperature: { value: number | null; unitCode: string };
  dewpoint: { value: number | null; unitCode: string };
  windDirection: { value: number | null };
  windSpeed: { value: number | null; unitCode: string };
  windGust: { value: number | null; unitCode: string };
  barometricPressure: { value: number | null; unitCode: string };
  seaLevelPressure: { value: number | null; unitCode: string };
  visibility: { value: number | null; unitCode: string };
  relativeHumidity: { value: number | null };
  heatIndex: { value: number | null; unitCode: string };
  windChill: { value: number | null; unitCode: string };
  precipitationLastHour: { value: number | null; unitCode: string };
}

// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface ForecastPeriod {
  period: string;
  start: string;
  is_daytime: boolean;
  temp_f: number;
  temp_trend: string | null;
  precip_chance_pct: number | null;
  wind: string;
  short: string;
  detail: string;
}

export interface NoaaForecastOutput {
  location: string;
  timezone: string;
  generated_at: string;
  periods: ForecastPeriod[];
}

export interface HourlyPeriod {
  start: string;
  temp_f: number;
  precip_chance_pct: number | null;
  wind: string;
  short: string;
}

export interface NoaaHourlyOutput {
  location: string;
  timezone: string;
  periods: HourlyPeriod[];
}

export interface NoaaObservationOutput {
  station_id: string;
  station_name: string;
  observed_at: string;
  description: string;
  temp_c: number | null;
  temp_f: number | null;
  dewpoint_c: number | null;
  humidity_pct: number | null;
  wind_dir_deg: number | null;
  wind_speed_kmh: number | null;
  wind_gust_kmh: number | null;
  pressure_pa: number | null;
  visibility_m: number | null;
  heat_index_c: number | null;
  wind_chill_c: number | null;
  precip_last_hour_mm: number | null;
}
