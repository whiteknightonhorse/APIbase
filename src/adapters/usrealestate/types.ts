/**
 * US Real Estate API (RapidAPI) response types (UC-063).
 *
 * API host: us-real-estate.p.rapidapi.com
 * Auth: X-RapidAPI-Key header
 *
 * Endpoints:
 *   GET /v3/for-sale   — search for-sale listings
 *   GET /v3/property-detail — property details by ID
 *   GET /location/suggest — location autocomplete
 */

export interface PropertySearchResult {
  property_id: string;
  permalink: string;
  list_price: number | null;
  status: string;
  description: {
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    lot_sqft: number | null;
    year_built: number | null;
    type: string | null;
  };
  location: {
    address: {
      line: string | null;
      city: string | null;
      state_code: string | null;
      postal_code: string | null;
      county: string | null;
    };
    coordinate?: {
      lat: number | null;
      lon: number | null;
    };
  };
  primary_photo?: {
    href: string | null;
  };
  last_sold_date?: string | null;
  last_sold_price?: number | null;
}

export interface ForSaleResponse {
  status: number;
  data: {
    home_search: {
      total: number;
      results: PropertySearchResult[];
    };
  };
}

export interface PropertyDetailResponse {
  status: number;
  data: {
    home?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

export interface LocationSuggestResponse {
  status: number;
  data: Array<{
    _id: string;
    slug_id: string;
    city?: string;
    state_code?: string;
    postal_code?: string;
    line?: string;
    centroid?: { lat: number; lon: number };
  }>;
}
