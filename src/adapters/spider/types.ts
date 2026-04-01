/** Spider.cloud API raw response types (UC-274). */

export interface SpiderScrapeResult {
  content: string;
  costs: {
    total_cost: number;
    total_cost_formatted: string;
  };
  duration_elasped_ms: number;
  error: string | null;
  status: number;
  url: string;
}

export interface SpiderSearchItem {
  title: string;
  description: string;
  url: string;
}

export interface SpiderSearchResponse {
  content: SpiderSearchItem[];
  costs: {
    total_cost: number;
    total_cost_formatted: string;
  };
}

export interface SpiderScrapeOutput {
  url: string;
  content: string;
  status: number;
  duration_ms: number;
}

export interface SpiderSearchOutput {
  results: {
    title: string;
    description: string;
    url: string;
  }[];
  count: number;
}
