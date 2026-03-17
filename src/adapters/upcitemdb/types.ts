/**
 * UPCitemdb API response types (UC-041).
 *
 * API host: api.upcitemdb.com
 * Auth: None (free trial tier, no API key)
 *
 * Endpoints:
 *   /prod/trial/lookup — product lookup by UPC/EAN/GTIN/ISBN
 *   /prod/trial/search — full-text product search
 */

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface UpcOffer {
  merchant: string;
  domain: string;
  title: string;
  currency: string;
  list_price: number | string;
  price: number;
  shipping: string;
  condition: string;
  availability: string;
  link: string;
  updated_t: number;
}

export interface UpcItem {
  ean: string;
  title: string;
  description: string;
  upc: string;
  brand: string;
  model: string;
  color: string;
  size: string;
  dimension: string;
  weight: string;
  category: string;
  currency: string;
  lowest_recorded_price: number;
  highest_recorded_price: number;
  images: string[];
  offers: UpcOffer[];
  asin: string;
  elid: string;
}

// ---------------------------------------------------------------------------
// Lookup response (/prod/trial/lookup)
// ---------------------------------------------------------------------------

export interface UpcLookupResponse {
  code: string;
  total: number;
  offset: number;
  items: UpcItem[];
}

// ---------------------------------------------------------------------------
// Search response (/prod/trial/search)
// ---------------------------------------------------------------------------

export interface UpcSearchResponse {
  code: string;
  total: number;
  offset: number;
  items: UpcItem[];
}
