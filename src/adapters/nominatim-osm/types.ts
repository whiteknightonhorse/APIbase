/** Raw response shapes from the Nominatim (OpenStreetMap) API — jsonv2 format. */

export interface NominatimAddress {
  house_number?: string;
  road?: string;
  neighbourhood?: string;
  quarter?: string;
  suburb?: string;
  city_district?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state_district?: string;
  state?: string;
  postcode?: string;
  country?: string;
  country_code?: string;
  [key: string]: string | undefined;
}

export interface NominatimPlace {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  category?: string;
  type?: string;
  place_rank?: number;
  importance?: number;
  addresstype?: string;
  name?: string;
  display_name: string;
  address?: NominatimAddress;
  boundingbox?: [string, string, string, string];
}

/** GET /search — always an array of matches (possibly empty). */
export type NominatimSearchResponse = NominatimPlace[];

/** GET /reverse — a single place, or an { error } object if nothing resolves at the point. */
export type NominatimReverseResponse = NominatimPlace | { error: string };

/** GET /lookup — array of resolved places, one per valid osm_id (missing ones are omitted). */
export type NominatimLookupResponse = NominatimPlace[];
