// ---------------------------------------------------------------------------
// Normalized output types for DOAJ adapter (UC-551)
// ---------------------------------------------------------------------------

export interface DoajJournalResult {
  id: string;
  title: string;
  pissn: string;
  eissn: string;
  publisher: string;
  country: string;
  language: string[];
  subjects: string[];
  license: string[];
  oa_start: number | null;
  apc: boolean;
  apc_max_eur: number | null;
  preservation: string[];
  url: string;
  created_date: string;
  last_updated: string;
}

export interface DoajJournalSearchOutput {
  total: number;
  page: number;
  pageSize: number;
  results: DoajJournalResult[];
}

export interface DoajJournalDetailOutput extends DoajJournalResult {
  aims_scope_url: string;
  author_instructions_url: string;
  review_process: string[];
  boai: boolean;
}

export interface DoajArticleResult {
  id: string;
  title: string;
  authors: string[];
  journal_title: string;
  journal_issn: string;
  year: number | null;
  month: number | null;
  subjects: string[];
  keywords: string[];
  abstract: string;
  doi: string;
  fulltext_url: string;
  created_date: string;
}

export interface DoajArticleSearchOutput {
  total: number;
  page: number;
  pageSize: number;
  results: DoajArticleResult[];
}
