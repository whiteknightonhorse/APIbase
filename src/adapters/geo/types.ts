/**
 * Geoapify adapter response types (UC-012).
 *
 * Single upstream provider: Geoapify (OSM-based geolocation platform).
 * All responses use GeoJSON FeatureCollection format.
 */

// ---------------------------------------------------------------------------
// Common GeoJSON types
// ---------------------------------------------------------------------------

export interface GeoapifyProperties {
  datasource?: {
    sourcename: string;
    attribution: string;
    license: string;
    url: string;
  };
  name?: string;
  country?: string;
  country_code?: string;
  state?: string;
  city?: string;
  postcode?: string;
  street?: string;
  housenumber?: string;
  lat: number;
  lon: number;
  formatted?: string;
  address_line1?: string;
  address_line2?: string;
  result_type?: string;
  rank?: {
    importance: number;
    popularity: number;
    confidence: number;
    confidence_city_level: number;
    match_type: string;
  };
  place_id?: string;
  [key: string]: unknown;
}

export interface GeoapifyFeature {
  type: 'Feature';
  properties: GeoapifyProperties;
  geometry: {
    type: string;
    coordinates: number[];
  };
  bbox?: number[];
}

/** Standard Geoapify geocoding response (GeoJSON FeatureCollection) */
export interface GeoapifyGeocodeResponse {
  type: 'FeatureCollection';
  features: GeoapifyFeature[];
  query?: {
    text: string;
    parsed: Record<string, string>;
  };
}

// ---------------------------------------------------------------------------
// Places API v2
// ---------------------------------------------------------------------------

export interface GeoapifyPlaceProperties {
  name?: string;
  categories: string[];
  datasource: {
    sourcename: string;
    attribution: string;
    license: string;
  };
  lat: number;
  lon: number;
  formatted?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  country?: string;
  country_code?: string;
  distance?: number;
  place_id?: string;
  [key: string]: unknown;
}

export interface GeoapifyPlaceFeature {
  type: 'Feature';
  properties: GeoapifyPlaceProperties;
  geometry: {
    type: string;
    coordinates: number[];
  };
}

export interface GeoapifyPlacesResponse {
  type: 'FeatureCollection';
  features: GeoapifyPlaceFeature[];
}

// ---------------------------------------------------------------------------
// Routing API
// ---------------------------------------------------------------------------

export interface GeoapifyRoutingLeg {
  distance: number;
  time: number;
  steps: {
    distance: number;
    time: number;
    instruction?: {
      text: string;
    };
    from_index: number;
    to_index: number;
  }[];
}

export interface GeoapifyRoutingResult {
  mode: string;
  waypoints: { lat: number; lon: number }[];
  distance: number;
  time: number;
  legs: GeoapifyRoutingLeg[];
  geometry: unknown[];
}

export interface GeoapifyRoutingResponse {
  type: 'FeatureCollection';
  properties: {
    mode: string;
    waypoints: { lat: number; lon: number }[];
  };
  features: {
    type: 'Feature';
    properties: GeoapifyRoutingResult;
    geometry: {
      type: string;
      coordinates: number[][];
    };
  }[];
}

// ---------------------------------------------------------------------------
// Isoline (Isochrone) API
// ---------------------------------------------------------------------------

export interface GeoapifyIsolineResponse {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    properties: {
      mode: string;
      type: string;
      range: number;
    };
    geometry: {
      type: string;
      coordinates: number[][][];
    };
  }[];
}

// ---------------------------------------------------------------------------
// IP Geolocation API
// ---------------------------------------------------------------------------

export interface GeoapifyIpInfoResponse {
  ip: string;
  country: {
    name: string;
    iso_code: string;
    name_native?: string;
    phone_code?: string;
    capital?: string;
    currency?: string;
    flag?: string;
    languages?: { iso_code: string; name: string }[];
  };
  state?: {
    name: string;
  };
  city?: {
    name: string;
  };
  postcode?: string;
  location: {
    latitude: number;
    longitude: number;
  };
  continent?: {
    code: string;
    name: string;
  };
}
