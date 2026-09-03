// ---------------------------------------------------------------------------
// Raw Semantic Scholar Graph API response shapes (api.semanticscholar.org/graph/v1)
// ---------------------------------------------------------------------------

export interface S2ExternalIds {
  DOI?: string | null;
  ArXiv?: string | null;
  PubMed?: string | null;
  CorpusId?: number | null;
}

export interface S2OpenAccessPdf {
  url?: string | null;
  status?: string | null;
}

export interface S2AuthorRef {
  authorId?: string;
  name?: string;
}

export interface S2Tldr {
  model?: string;
  text?: string;
}

export interface S2Paper {
  paperId: string;
  externalIds?: S2ExternalIds;
  title?: string | null;
  abstract?: string | null;
  venue?: string | null;
  year?: number | null;
  referenceCount?: number;
  citationCount?: number;
  openAccessPdf?: S2OpenAccessPdf | null;
  fieldsOfStudy?: string[] | null;
  tldr?: S2Tldr | null;
  authors?: S2AuthorRef[];
}

export interface S2PaperSearchResponse {
  total: number;
  offset?: number;
  next?: number;
  data: S2Paper[];
}

export interface S2Author {
  authorId: string;
  name?: string;
  affiliations?: string[];
  paperCount?: number;
  citationCount?: number;
  hIndex?: number;
}

export interface S2AuthorSearchResponse {
  total: number;
  offset?: number;
  next?: number;
  data: S2Author[];
}

// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface S2PaperSummary {
  paper_id: string;
  doi: string | null;
  title: string;
  year: number | null;
  venue: string | null;
  authors: string[];
  citation_count: number;
  is_open_access: boolean;
  open_access_pdf_url: string | null;
}

export interface S2PapersSearchOutput {
  total: number;
  results: S2PaperSummary[];
}

export interface S2AuthorSummary {
  author_id: string;
  name: string;
  affiliations: string[];
  paper_count: number;
  citation_count: number;
  h_index: number | null;
}

export interface S2AuthorsSearchOutput {
  total: number;
  results: S2AuthorSummary[];
}

export interface S2PaperDetailOutput {
  paper_id: string;
  doi: string | null;
  arxiv_id: string | null;
  pubmed_id: string | null;
  title: string;
  abstract: string | null;
  tldr: string | null;
  year: number | null;
  venue: string | null;
  fields_of_study: string[];
  authors: { author_id: string | null; name: string }[];
  citation_count: number;
  reference_count: number;
  is_open_access: boolean;
  open_access_pdf_url: string | null;
}
