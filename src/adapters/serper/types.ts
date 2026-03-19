/**
 * Serper.dev Google Search API response types (UC-067).
 *
 * API host: google.serper.dev
 * Auth: X-API-KEY header
 *
 * Endpoints:
 *   POST /search   — Google web search
 *   POST /news     — Google News
 *   POST /images   — Google Images
 *   POST /shopping — Google Shopping
 */

export interface SerperOrganicResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
  date?: string;
  sitelinks?: Array<{ title: string; link: string }>;
}

export interface SerperKnowledgeGraph {
  title?: string;
  type?: string;
  description?: string;
  descriptionSource?: string;
  website?: string;
  imageUrl?: string;
  attributes?: Record<string, string>;
}

export interface SerperSearchResponse {
  searchParameters: Record<string, unknown>;
  organic: SerperOrganicResult[];
  knowledgeGraph?: SerperKnowledgeGraph;
  answerBox?: { answer?: string; snippet?: string; title?: string };
  peopleAlsoAsk?: Array<{ question: string; snippet: string; link: string }>;
  relatedSearches?: Array<{ query: string }>;
}

export interface SerperNewsResult {
  title: string;
  link: string;
  snippet: string;
  date: string;
  source: string;
  imageUrl?: string;
}

export interface SerperNewsResponse {
  searchParameters: Record<string, unknown>;
  news: SerperNewsResult[];
}

export interface SerperImageResult {
  title: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  thumbnailUrl: string;
  source: string;
  domain: string;
  link: string;
}

export interface SerperImagesResponse {
  searchParameters: Record<string, unknown>;
  images: SerperImageResult[];
}

export interface SerperShoppingResult {
  title: string;
  source: string;
  link: string;
  price: string;
  imageUrl?: string;
  rating?: number;
  ratingCount?: number;
  delivery?: string;
}

export interface SerperShoppingResponse {
  searchParameters: Record<string, unknown>;
  shopping: SerperShoppingResult[];
}
