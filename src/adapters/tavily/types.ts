/**
 * Tavily AI Search API response types (UC-068).
 *
 * API host: api.tavily.com
 * Auth: api_key in request body
 */

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
  raw_content?: string;
}

export interface TavilySearchResponse {
  query: string;
  answer?: string;
  results: TavilySearchResult[];
  response_time: number;
}

export interface TavilyExtractResult {
  url: string;
  raw_content: string;
  results?: Array<{
    title?: string;
    url: string;
    content: string;
    author?: string;
    published_date?: string;
  }>;
  failed_results?: Array<{ url: string; error: string }>;
}
