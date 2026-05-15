/**
 * NREL AFDC + PVWatts API response types (UC-414).
 *
 * AFDC — Alternative Fuels Station Locator (https://developer.nrel.gov/api/alt-fuel-stations/)
 * PVWatts — Solar PV Production Estimator (https://developer.nrel.gov/api/pvwatts/)
 */

// ---------------------------------------------------------------------------
// AFDC — Station fields shared by nearest + search + detail
// ---------------------------------------------------------------------------

export interface AfdcStation {
  id: number;
  station_name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  status_code: string;
  access_code: string;
  fuel_type_code: string;
  // EV-specific
  ev_level1_evse_num: number | null;
  ev_level2_evse_num: number | null;
  ev_dc_fast_num: number | null;
  ev_connector_types: string[] | null;
  ev_network: string | null;
  ev_network_web: string | null;
  ev_pricing: string | null;
  // Location
  latitude: number;
  longitude: number;
  // Hours
  access_days_time: string | null;
  date_last_confirmed: string | null;
  updated_at: string;
  // Operator
  owner_type_code: string | null;
  phone: string | null;
  station_phone: string | null;
}

// ---------------------------------------------------------------------------
// AFDC Nearest endpoint response
// ---------------------------------------------------------------------------

export interface AfdcNearestResponse {
  station_locator_url: string;
  total_results: number;
  station_counts: {
    total: number;
    fuels: Record<string, { total: number }>;
  };
  latitude: number;
  longitude: number;
  precision: string | null;
  offset: number;
  fuel_stations: AfdcStation[];
}

// ---------------------------------------------------------------------------
// AFDC Search (list) endpoint response
// ---------------------------------------------------------------------------

export interface AfdcSearchResponse {
  station_locator_url: string;
  total_results: number;
  station_counts: {
    total: number;
    fuels: Record<string, { total: number }>;
  };
  offset: number;
  fuel_stations: AfdcStation[];
}

// ---------------------------------------------------------------------------
// AFDC Station Detail endpoint response (single station)
// ---------------------------------------------------------------------------

export interface AfdcDetailResponse {
  alt_fuel_station: AfdcStation & {
    access_detail_code: string | null;
    cards_accepted: string | null;
    ev_workplace_charging: boolean | null;
    facility_type: string | null;
    geocode_status: string | null;
    groups_with_access_code: string | null;
    intersection_directions: string | null;
    plus4: string | null;
    bd_blends: string | null;
    e85_blender_pump: boolean | null;
    ev_level1_evse_num: number | null;
    ev_level2_evse_num: number | null;
    ev_dc_fast_num: number | null;
    ev_other_evse: string | null;
    hy_status_link: string | null;
    lpg_primary: boolean | null;
    ng_fill_type_code: string | null;
    ng_psi: string | null;
    ng_vehicle_class: string | null;
    open_date: string | null;
    owner_type_code: string | null;
    planned_construction: boolean | null;
    station_phone: string | null;
    hy_is_retail: boolean | null;
  };
}

// ---------------------------------------------------------------------------
// PVWatts v8 response
// ---------------------------------------------------------------------------

export interface PVWattsResponse {
  inputs: {
    lat: string;
    lon: string;
    system_capacity: string;
    module_type: string;
    losses: string;
    array_type: string;
    tilt: string;
    azimuth: string;
    timeframe: string;
  };
  errors: string[];
  warnings: string[];
  version: string;
  station_info: {
    lat: number;
    lon: number;
    elev: number;
    tz: number;
    location: string;
    city: string;
    state: string;
    country: string;
    solar_resource_file: string;
    distance: number;
    weather_data_source: string;
  };
  outputs: {
    ac_monthly: number[];
    poa_monthly: number[];
    solrad_monthly: number[];
    dc_monthly: number[];
    ac_annual: number;
    solrad_annual: number;
    capacity_factor: number;
  };
}
