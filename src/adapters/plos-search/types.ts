// Raw response types for the PLOS Search API (Solr-backed).
// Only fields actually consumed by the adapter are declared — the upstream
// document carries many more (counter/altmetric fields, full body text
// fields when explicitly requested, etc.) which are intentionally not
// requested/parsed here.

export interface PlosDoc {
  id: string;
  title?: string;
  journal?: string;
  article_type?: string;
  publication_date?: string;
  author?: string[];
  abstract?: string[];
  subject?: string[];
}

export interface PlosSearchResponse {
  response?: {
    numFound: number;
    start: number;
    docs: PlosDoc[];
  };
}
