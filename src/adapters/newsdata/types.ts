/**
 * NewsData.io API response types (UC-070).
 *
 * API host: newsdata.io/api/1
 * Auth: apikey query parameter
 */

export interface NewsDataArticle {
  article_id: string;
  title: string;
  link: string;
  description: string | null;
  content: string | null;
  pubDate: string;
  pubDateTZ: string;
  source_id: string;
  source_name: string;
  source_url: string;
  source_icon: string | null;
  language: string;
  country: string[];
  category: string[];
  image_url: string | null;
  creator: string[] | null;
  keywords: string[] | null;
  sentiment: string | null;
  sentiment_stats: Record<string, number> | null;
  ai_tag: string[] | null;
  ai_region: string | null;
  ai_org: string | null;
}

export interface NewsDataResponse {
  status: string;
  totalResults: number;
  results: NewsDataArticle[];
  nextPage?: string;
}

export interface NewsDataSource {
  id: string;
  name: string;
  url: string;
  icon: string | null;
  priority: number;
  description: string | null;
  category: string[];
  language: string[];
  country: string[];
}

export interface NewsDataSourcesResponse {
  status: string;
  results: NewsDataSource[];
}
