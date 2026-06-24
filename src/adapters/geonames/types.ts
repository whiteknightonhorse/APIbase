/**
 * GeoNames geographical database API response types (UC-512).
 *
 * API host: https://secure.geonames.org
 * Auth: username query param (registered free account)
 *
 * Endpoints:
 *   /searchJSON           — full-text place name search
 *   /postalCodeSearchJSON — postal code lookup (100+ countries)
 *   /countryInfoJSON      — country metadata and bounding box
 *   /timezoneJSON         — timezone lookup by lat/lng
 */

// ---------------------------------------------------------------------------
// Place search (searchJSON)
// ---------------------------------------------------------------------------

export interface GeoNamesEntry {
  geonameId: number;
  name: string;
  toponymName: string;
  lat: string;
  lng: string;
  countryCode: string;
  countryName: string;
  fcl: string;
  fclName: string;
  fcode: string;
  fcodeName: string;
  adminCode1?: string;
  adminName1?: string;
  adminCode2?: string;
  adminName2?: string;
  population: number;
  wikipedia?: string;
  bbox?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
}

export interface GeoNamesSearchResponse {
  totalResultsCount: number;
  geonames: GeoNamesEntry[];
}

// ---------------------------------------------------------------------------
// Postal code search (postalCodeSearchJSON)
// ---------------------------------------------------------------------------

export interface PostalCodeEntry {
  postalCode: string;
  placeName: string;
  countryCode: string;
  lat: number;
  lng: number;
  adminCode1?: string;
  adminName1?: string;
  adminCode2?: string;
  adminName2?: string;
  adminCode3?: string;
  adminName3?: string;
  'ISO3166-2'?: string;
}

export interface PostalCodeSearchResponse {
  postalCodes: PostalCodeEntry[];
}

// ---------------------------------------------------------------------------
// Country info (countryInfoJSON)
// ---------------------------------------------------------------------------

export interface CountryInfoEntry {
  countryCode: string;
  countryName: string;
  isoAlpha3: string;
  isoNumeric: string;
  fipsCode: string;
  continent: string;
  continentName: string;
  capital: string;
  languages: string;
  geonameId: number;
  population: string;
  areaInSqKm: string;
  currencyCode?: string;
  postalCodeFormat?: string;
  postalCodeRegex?: string;
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface CountryInfoResponse {
  geonames: CountryInfoEntry[];
}

// ---------------------------------------------------------------------------
// Timezone (timezoneJSON)
// ---------------------------------------------------------------------------

export interface TimezoneResponse {
  lat: number;
  lng: number;
  countryCode: string;
  countryName: string;
  timezoneId: string;
  gmtOffset: number;
  rawOffset: number;
  dstOffset: number;
  time: string;
  sunrise: string;
  sunset: string;
}
