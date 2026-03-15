/**
 * Zinc API response types (UC-025).
 *
 * API host: api.zinc.io
 * Auth: Basic Auth (API key as username, no password)
 * Upstream cost: $0.01/call
 */

// ---------------------------------------------------------------------------
// Product Search
// ---------------------------------------------------------------------------

export interface ZincSearchProduct {
  product_id: string;
  title: string;
  image?: string;
  price?: number;
  rating?: number;
  num_reviews?: number;
  asin?: string;
  link?: string;
}

export interface ZincSearchResponse {
  status: string;
  results: ZincSearchProduct[];
}

// ---------------------------------------------------------------------------
// Product Details
// ---------------------------------------------------------------------------

export interface ZincProductDetailsResponse {
  status: string;
  product_id: string;
  title?: string;
  product_description?: string;
  brand?: string;
  main_image?: string;
  images?: string[];
  price?: number;
  original_price?: number;
  rating?: number;
  review_count?: number;
  feature_bullets?: string[];
  variant_specifics?: Record<string, unknown>[];
  categories?: string[];
  asin?: string;
  retailer?: string;
}

// ---------------------------------------------------------------------------
// Product Offers
// ---------------------------------------------------------------------------

export interface ZincOffer {
  seller_name?: string;
  seller_id?: string;
  price?: number;
  shipping_price?: number;
  condition?: string;
  prime?: boolean;
  availability?: string;
  offer_id?: string;
}

export interface ZincOffersResponse {
  status: string;
  product_id: string;
  offers: ZincOffer[];
}

// ---------------------------------------------------------------------------
// Product Reviews
// ---------------------------------------------------------------------------

export interface ZincReview {
  author?: string;
  rating?: number;
  title?: string;
  body?: string;
  date?: string;
  verified_purchase?: boolean;
}

export interface ZincReviewsResponse {
  status: string;
  product_id: string;
  reviews: ZincReview[];
  average_rating?: number;
  total_reviews?: number;
}
