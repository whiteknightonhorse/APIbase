/**
 * Bureau of Transportation Statistics (BTS) Socrata API response types (UC-564).
 *
 * Base URL: https://data.bts.gov/resource/{dataset_id}.json
 * Auth: None (US Government open data, Socrata SoQL API)
 *
 * Datasets:
 *   keg4-3bc2 — Border Crossing Entry Data
 *   bw6n-ddqk — Transportation Services Index
 *   y5ut-ibwt — Supply Chain and Freight Indicators
 *   r495-tyji — T100 Segment Summary By Origin Airport
 */

// ---------------------------------------------------------------------------
// Border Crossing Entry Data (keg4-3bc2)
// ---------------------------------------------------------------------------

export interface BorderCrossingRecord {
  port_name: string;
  state: string;
  port_code: string;
  border: string;
  date: string;
  measure: string;
  value: string;
  latitude: string;
  longitude: string;
}

// ---------------------------------------------------------------------------
// Transportation Services Index (bw6n-ddqk)
// ---------------------------------------------------------------------------

export interface TsiRecord {
  id: string;
  obs_date: string;
  tsi_total: string;
  tsi_freight: string;
  tsi_passenger: string;
  vmt?: string;
  rail_frt_carloads?: string;
  transit?: string;
  petroleum?: string;
  natural_gas?: string;
}

// ---------------------------------------------------------------------------
// Supply Chain and Freight Indicators (y5ut-ibwt)
// ---------------------------------------------------------------------------

export interface FreightIndicatorRecord {
  id: string;
  date: string;
  year: string;
  indicator: string;
  value1: string;
  units: string;
  note?: string;
  source?: string;
}

// ---------------------------------------------------------------------------
// T100 Segment Summary By Origin Airport (r495-tyji)
// ---------------------------------------------------------------------------

export interface AviationTrafficRecord {
  year: string;
  origin_airport_code?: string;
  origin_airport_id?: string;
  total_departures?: string;
  total_passengers?: string;
  total_seats?: string;
  total_load_factor?: string;
  total_distance_flight_sm?: string;
  total_payload_lbs?: string;
}
