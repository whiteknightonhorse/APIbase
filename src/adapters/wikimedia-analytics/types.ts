export interface WikimediaPageviewsAggregateItem {
  project: string;
  access: string;
  agent: string;
  granularity: string;
  timestamp: string;
  views: number;
}

export interface WikimediaPageviewsAggregateResponse {
  items?: WikimediaPageviewsAggregateItem[];
}

export interface WikimediaPageviewsAggregateOutput {
  project: string;
  access: string;
  agent: string;
  granularity: string;
  data_points: Array<{ timestamp: string; views: number }>;
}

export interface WikimediaTopArticleItem {
  article: string;
  views: number;
  rank: number;
}

export interface WikimediaPageviewsTopEntry {
  project: string;
  access: string;
  year: string;
  month: string;
  day: string;
  articles?: WikimediaTopArticleItem[];
}

export interface WikimediaPageviewsTopResponse {
  items?: WikimediaPageviewsTopEntry[];
}

export interface WikimediaPageviewsTopOutput {
  project: string;
  access: string;
  date: string;
  articles: Array<{ article: string; views: number; rank: number }>;
}

export interface WikimediaPerArticleItem {
  project: string;
  article: string;
  granularity: string;
  timestamp: string;
  access: string;
  agent: string;
  views: number;
}

export interface WikimediaPerArticleResponse {
  items?: WikimediaPerArticleItem[];
}

export interface WikimediaPerArticleOutput {
  project: string;
  article: string;
  access: string;
  agent: string;
  granularity: string;
  data_points: Array<{ timestamp: string; views: number }>;
}

export interface WikimediaEditsAggregateResult {
  timestamp: string;
  edits: number;
}

export interface WikimediaEditsAggregateItem {
  project: string;
  'editor-type': string;
  'page-type': string;
  granularity: string;
  results?: WikimediaEditsAggregateResult[];
}

export interface WikimediaEditsAggregateResponse {
  items?: WikimediaEditsAggregateItem[];
}

export interface WikimediaEditsAggregateOutput {
  project: string;
  editor_type: string;
  page_type: string;
  granularity: string;
  data_points: Array<{ timestamp: string; edits: number }>;
}
