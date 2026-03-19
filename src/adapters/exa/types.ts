/**
 * Exa semantic search API response types (UC-069).
 *
 * API host: api.exa.ai
 * Auth: x-api-key header
 */

export interface ExaSearchResult {
  id: string;
  url: string;
  title: string;
  score: number;
  publishedDate?: string;
  author?: string;
  text?: string;
  highlights?: string[];
}

export interface ExaSearchResponse {
  requestId: string;
  results: ExaSearchResult[];
}

export interface ExaContentsResult {
  url: string;
  title?: string;
  author?: string;
  publishedDate?: string;
  text?: string;
  highlights?: string[];
}

export interface ExaContentsResponse {
  requestId: string;
  results: ExaContentsResult[];
}
