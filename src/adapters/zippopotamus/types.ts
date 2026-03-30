/**
 * Zippopotam.us types (UC-250).
 * Global postal code lookup — 60+ countries.
 */

export interface ZipPlace {
  'place name': string;
  longitude: string;
  latitude: string;
  state: string;
  'state abbreviation': string;
}

export interface ZipResponse {
  country: string;
  'country abbreviation': string;
  'post code': string;
  places: ZipPlace[];
}

export interface PostalLookupOutput {
  country: string;
  country_code: string;
  postal_code: string;
  places: Array<{
    name: string;
    state: string;
    state_code: string;
    lat: number;
    lon: number;
  }>;
  total: number;
}
