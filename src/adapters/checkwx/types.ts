/**
 * CheckWX Aviation Weather API response types (UC-423).
 *
 * https://www.checkwxapi.com/documentation
 * FlyteHealth Inc. — pre-decoded JSON METAR/TAF/station data.
 */

/**
 * CheckWX API envelope — all endpoints return {data: [...], results: N}.
 */
export interface CheckWxEnvelope<T> {
  data: T[];
  results: number;
}

/**
 * Decoded METAR wind object.
 */
export interface CheckWxWind {
  degrees: number | null;
  speed_kts: number | null;
  speed_mph: number | null;
  speed_mps: number | null;
  gust_kts?: number | null;
  gust_mph?: number | null;
}

/**
 * Decoded METAR visibility object.
 */
export interface CheckWxVisibility {
  miles: string | null;
  miles_float: number | null;
  meters: string | null;
  meters_float: number | null;
}

/**
 * Sky condition / cloud layer object (METAR & TAF).
 */
export interface CheckWxSkyCondition {
  code: string;
  text: string;
  base_feet_agl: number | null;
  base_meters_agl: number | null;
}

/**
 * Decoded METAR temperature object.
 */
export interface CheckWxTemperature {
  celsius: number | null;
  fahrenheit: number | null;
}

/**
 * Decoded METAR altimeter object.
 */
export interface CheckWxAltimeter {
  inches_hg: number | null;
  hectopascals: number | null;
}

/**
 * Decoded METAR record.
 */
export interface CheckWxMetarDecoded {
  icao: string;
  observed: string;
  raw_text: string;
  station: {
    name: string;
    geometry?: { coordinates: [number, number] };
  };
  flight_category?: string | null;
  conditions?: Array<{ code: string; text: string }> | null;
  wind?: CheckWxWind | null;
  visibility?: CheckWxVisibility | null;
  clouds?: CheckWxSkyCondition[] | null;
  temperature?: CheckWxTemperature | null;
  dewpoint?: CheckWxTemperature | null;
  humidity?: { percent: number | null } | null;
  barometer?: CheckWxAltimeter | null;
  ceiling?: CheckWxSkyCondition | null;
}

/**
 * TAF forecast change period.
 */
export interface CheckWxTafForecast {
  change?: { indicator?: { code: string; text: string } } | null;
  timestamp?: { from: string; to: string } | null;
  wind?: CheckWxWind | null;
  visibility?: CheckWxVisibility | null;
  clouds?: CheckWxSkyCondition[] | null;
  conditions?: Array<{ code: string; text: string }> | null;
}

/**
 * Decoded TAF record.
 */
export interface CheckWxTafDecoded {
  icao: string;
  timestamp?: { issued: string; valid_from: string; valid_to: string } | null;
  raw_text: string;
  station: {
    name: string;
    geometry?: { coordinates: [number, number] };
  };
  forecast?: CheckWxTafForecast[] | null;
}

/**
 * Station information record.
 */
export interface CheckWxStation {
  icao: string;
  iata?: string | null;
  name: string;
  city?: string | null;
  country?: { code: string; name: string } | null;
  timezone?: { tzid: string; gmt: string } | null;
  geometry?: { coordinates: [number, number] } | null;
  elevation?: { feet: number | null; meters: number | null } | null;
  runways?: Array<{
    ident: string;
    length_ft: number | null;
    width_ft: number | null;
    surface?: { code: string; text: string } | null;
  }> | null;
}
