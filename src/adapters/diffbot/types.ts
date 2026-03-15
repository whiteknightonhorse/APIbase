/**
 * Diffbot API response types (UC-026).
 *
 * API host: api.diffbot.com
 * Auth: query param token=API_KEY
 * Free tier: 10,000 credits/month
 */

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

export interface DiffbotImage {
  url: string;
  title?: string;
  width?: number;
  height?: number;
}

// ---------------------------------------------------------------------------
// Product Extract
// ---------------------------------------------------------------------------

export interface DiffbotProduct {
  type: string;
  title?: string;
  text?: string;
  brand?: string;
  offerPrice?: string;
  regularPrice?: string;
  offerPriceDetails?: { amount?: number; currency?: string; text?: string };
  regularPriceDetails?: { amount?: number; currency?: string; text?: string };
  availability?: boolean;
  sku?: string;
  upc?: string;
  mpn?: string;
  isbn?: string;
  specs?: Record<string, string>;
  images?: DiffbotImage[];
  discussion?: { numPosts?: number; posts?: DiffbotReview[] };
  categories?: { name: string; id?: string }[];
  pageUrl?: string;
  diffbotUri?: string;
}

export interface DiffbotReview {
  title?: string;
  text?: string;
  author?: string;
  date?: string;
  rating?: number;
}

export interface DiffbotProductResponse {
  request: { pageUrl: string; api: string };
  objects: DiffbotProduct[];
}

// ---------------------------------------------------------------------------
// Article Extract
// ---------------------------------------------------------------------------

export interface DiffbotArticle {
  type: string;
  title?: string;
  text?: string;
  html?: string;
  author?: string;
  authorUrl?: string;
  date?: string;
  siteName?: string;
  publisherRegion?: string;
  publisherCountry?: string;
  estimatedDate?: string;
  language?: string;
  sentiment?: number;
  tags?: { label: string; uri?: string; score?: number }[];
  images?: DiffbotImage[];
  categories?: { name: string; id?: string; score?: number }[];
  pageUrl?: string;
  diffbotUri?: string;
  numPages?: number;
}

export interface DiffbotArticleResponse {
  request: { pageUrl: string; api: string };
  objects: DiffbotArticle[];
}

// ---------------------------------------------------------------------------
// Analyze (auto-detect)
// ---------------------------------------------------------------------------

export interface DiffbotAnalyzeResponse {
  request: { pageUrl: string; api: string };
  type?: string;
  title?: string;
  objects?: (DiffbotProduct | DiffbotArticle)[];
}

// ---------------------------------------------------------------------------
// Knowledge Graph Search
// ---------------------------------------------------------------------------

export interface DiffbotKGEntity {
  name?: string;
  type?: string;
  summary?: string;
  description?: string;
  image?: string;
  types?: string[];
  nbIncomingEdges?: number;
  nbOutgoingEdges?: number;
  diffbotUri?: string;
  [key: string]: unknown;
}

export interface DiffbotSearchResponse {
  data: DiffbotKGEntity[];
  hits?: number;
  kgversion?: string;
}
