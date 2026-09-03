// ---------------------------------------------------------------------------
// Raw SEPA Scotland Rainfall API response shapes (www2.sepa.org.uk/rainfall/api)
// All numeric fields are returned as strings by the upstream API.
// ---------------------------------------------------------------------------

export interface SepaStationRaw {
  station_name: string;
  station_latitude: string;
  station_longitude: string;
  /** Public gauge number — the identifier used in every other endpoint's URL path. */
  station_no: string;
  station_id: string;
  /** Timestamp of the latest reading, e.g. "2026-09-03 09:00:00". */
  itemDate: string;
  /** Latest reading value in mm. */
  itemValue: string;
  itemValue2: string;
  /** Accumulation window in minutes for itemValue. */
  accumRange: string;
  ts_id: string;
  oldtime: string;
  id: string;
}

/** GET /api/Stations returns an array; GET /api/Stations/{id} returns one object or null. */
export type SepaStationsListResponse = SepaStationRaw[];
export type SepaStationDetailResponse = SepaStationRaw | null;

/** One point in a GET /api/{Hourly|Daily|Month}/{id}?all=true time series. */
export interface SepaTimeseriesPointRaw {
  /** e.g. "27/08/2026 00:00:00" (Hourly/Daily) or "Oct 2016" (Month). */
  Timestamp: string;
  /** Rainfall total in mm for this point, as a string. */
  Value: string;
}

export type SepaTimeseriesResponse = SepaTimeseriesPointRaw[];

// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface SepaStationSummary {
  station_no: string;
  name: string;
  latitude: number;
  longitude: number;
  latest_reading_mm: number | null;
  latest_reading_at: string | null;
}

export interface SepaStationsSearchOutput {
  total: number;
  results: SepaStationSummary[];
}

export interface SepaStationCurrentOutput {
  station_no: string;
  name: string;
  latitude: number;
  longitude: number;
  latest_reading_mm: number;
  latest_reading_at: string;
  accumulation_period_minutes: number;
}

export type SepaHistoryPeriod = 'hourly' | 'daily' | 'monthly';

export interface SepaHistoryReading {
  timestamp: string;
  value_mm: number;
}

export interface SepaRainfallHistoryOutput {
  station_no: string;
  period: SepaHistoryPeriod;
  count: number;
  readings: SepaHistoryReading[];
}
