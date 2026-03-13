/**
 * Foursquare Places API response types (UC-003).
 *
 * API host: places-api.foursquare.com
 * Auth: Bearer token (Service API Key)
 * Versioning: X-Places-Api-Version header
 */

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

export interface FsqCategory {
  id: number;
  name: string;
  short_name: string;
  plural_name: string;
  icon: { prefix: string; suffix: string };
}

export interface FsqGeocode {
  latitude: number;
  longitude: number;
}

export interface FsqLocation {
  address?: string;
  address_extended?: string;
  census_block?: string;
  country: string;
  cross_street?: string;
  dma?: string;
  formatted_address?: string;
  locality?: string;
  neighborhood?: string[];
  po_box?: string;
  post_town?: string;
  postcode?: string;
  region?: string;
}

// ---------------------------------------------------------------------------
// Place Search / Details
// ---------------------------------------------------------------------------

export interface FsqPlace {
  fsq_id: string;
  name: string;
  categories: FsqCategory[];
  chains?: { id: string; name: string }[];
  closed_bucket?: string;
  distance?: number;
  geocodes: {
    main: FsqGeocode;
    roof?: FsqGeocode;
    drop_off?: FsqGeocode;
  };
  link?: string;
  location: FsqLocation;
  timezone?: string;
  rating?: number;
  popularity?: number;
  price?: number;
  hours?: {
    display?: string;
    is_local_holiday?: boolean;
    open_now?: boolean;
    regular?: { close: string; day: number; open: string }[];
  };
  tel?: string;
  website?: string;
  social_media?: Record<string, string>;
  verified?: boolean;
  stats?: {
    total_photos?: number;
    total_ratings?: number;
    total_tips?: number;
  };
  tastes?: string[];
  features?: Record<string, unknown>;
  store_id?: string;
}

export interface FsqSearchResponse {
  results: FsqPlace[];
  context?: {
    geo_bounds?: {
      circle?: { center: FsqGeocode; radius: number };
    };
  };
}

// ---------------------------------------------------------------------------
// Tips
// ---------------------------------------------------------------------------

export interface FsqTip {
  id: string;
  created_at: string;
  text: string;
  lang?: string;
  agree_count?: number;
  disagree_count?: number;
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

export interface FsqPhoto {
  id: string;
  created_at: string;
  prefix: string;
  suffix: string;
  width: number;
  height: number;
  classifications?: string[];
}

// ---------------------------------------------------------------------------
// Autocomplete
// ---------------------------------------------------------------------------

export interface FsqAutocompleteResult {
  type: string;
  text: {
    primary: string;
    secondary?: string;
    highlight?: { start: number; length: number }[];
  };
  link?: string;
  place?: FsqPlace;
}

export interface FsqAutocompleteResponse {
  results: FsqAutocompleteResult[];
}
