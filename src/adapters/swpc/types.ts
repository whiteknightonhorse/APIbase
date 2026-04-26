/**
 * NOAA Space Weather Prediction Center (SWPC) raw response types (UC-396).
 * https://www.swpc.noaa.gov/content/data-access
 *
 * NODD license — US Gov public domain, commercial use OK.
 */

export interface SwpcKindexEntry {
  time_tag: string; // ISO 8601, no timezone (UTC)
  kp_index: number; // integer 0-9
  estimated_kp: number; // float
  kp: string; // e.g. "2M", "5+", "1Z"
}

export interface SwpcAuroraResponse {
  'Observation Time': string;
  'Forecast Time': string;
  'Data Format': string;
  coordinates: Array<[number, number, number]>; // [lon (-180..180 mapped 0..360), lat (-90..90), aurora%]
  type: string;
}

export interface SwpcSolarWindEntry {
  time_tag: string;
  active: boolean;
  source: string; // 'ACE' or 'DSCOVR'
  proton_speed: number | null;
  proton_density: number | null;
  proton_temperature: number | null;
  overall_quality: number;
  // Many other fields exist but are usually null on the public stream
}

export interface SwpcSolarRegion {
  observed_date: string; // YYYY-MM-DD
  region: number; // NOAA AR number
  latitude: number;
  longitude: number;
  location: string; // e.g. "N08W85"
  carrington_longitude: number;
  area: number | null;
  spot_class: string | null;
  extent: number | null;
  number_spots: number | null;
  mag_class: string | null;
  status: string | null;
  c_xray_events: number;
  m_xray_events: number;
  x_xray_events: number;
  proton_events: number | null;
  c_flare_probability: number | null;
  m_flare_probability: number | null;
  x_flare_probability: number | null;
  first_date: string;
}
