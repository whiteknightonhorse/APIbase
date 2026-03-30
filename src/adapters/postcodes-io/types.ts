/**
 * Postcodes.io types (UC-249).
 * UK postcode lookup — backed by ONS/Ordnance Survey.
 */

export interface PostcodeResult {
  postcode: string;
  quality: number;
  eastings: number;
  northings: number;
  country: string;
  nhs_ha: string;
  longitude: number;
  latitude: number;
  european_electoral_region: string;
  primary_care_trust: string;
  region: string;
  parish: string;
  parliamentary_constituency: string;
  admin_district: string;
  admin_county: string;
  admin_ward: string;
  ced: string;
  outcode: string;
  incode: string;
}

export interface NearestResult {
  postcode: string;
  admin_district: string;
  distance: number;
  latitude: number;
  longitude: number;
}

// Normalized outputs

export interface LookupOutput {
  postcode: string;
  district: string;
  county: string;
  region: string;
  country: string;
  ward: string;
  parish: string;
  parliamentary_constituency: string;
  lat: number;
  lon: number;
  outcode: string;
}

export interface NearestOutput {
  results: Array<{
    postcode: string;
    district: string;
    distance_m: number;
    lat: number;
    lon: number;
  }>;
  total: number;
}

export interface ValidateOutput {
  postcode: string;
  valid: boolean;
}
