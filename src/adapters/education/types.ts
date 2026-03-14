/**
 * Education / Academic Research API response types (UC-017).
 *
 * Five upstream providers:
 *   OpenAlex        — openalex.org/works (CC0, mailto polite pool)
 *   College Scorecard — api.data.gov/ed/collegescorecard (Gov Open Data)
 *   PubMed/NCBI     — eutils.ncbi.nlm.nih.gov (Gov Public Domain)
 *   arXiv           — export.arxiv.org/api (CC0 metadata)
 *   CrossRef        — api.crossref.org/works (CC0 facts)
 */

// ---------------------------------------------------------------------------
// OpenAlex — Works
// ---------------------------------------------------------------------------

export interface OpenAlexAuthor {
  id: string;
  display_name: string;
  orcid?: string | null;
}

export interface OpenAlexAuthorship {
  author_position: string;
  author: OpenAlexAuthor;
  institutions: Array<{ id: string; display_name: string; ror?: string; country_code?: string | null }>;
  is_corresponding?: boolean;
}

export interface OpenAlexConcept {
  id: string;
  wikidata?: string;
  display_name: string;
  level: number;
  score: number;
}

export interface OpenAlexWork {
  id: string;
  doi?: string | null;
  title: string;
  display_name: string;
  publication_year: number | null;
  publication_date?: string | null;
  type: string;
  cited_by_count: number;
  is_oa: boolean;
  open_access?: {
    is_oa: boolean;
    oa_status?: string;
    oa_url?: string | null;
  };
  authorships: OpenAlexAuthorship[];
  concepts: OpenAlexConcept[];
  biblio?: {
    volume?: string | null;
    issue?: string | null;
    first_page?: string | null;
    last_page?: string | null;
  };
  primary_location?: {
    source?: { id: string; display_name: string; issn_l?: string | null; type?: string } | null;
    landing_page_url?: string | null;
    pdf_url?: string | null;
  } | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  referenced_works?: string[];
  related_works?: string[];
  counts_by_year?: Array<{ year: number; cited_by_count: number }>;
}

export interface OpenAlexWorksResponse {
  meta: {
    count: number;
    db_response_time_ms: number;
    page: number;
    per_page: number;
  };
  results: OpenAlexWork[];
}

// ---------------------------------------------------------------------------
// College Scorecard (US DOE)
// ---------------------------------------------------------------------------

export interface ScorecardSchool {
  id: number;
  'school.name': string;
  'school.city'?: string;
  'school.state'?: string;
  'school.zip'?: string;
  'school.school_url'?: string;
  'school.degrees_awarded.predominant'?: number;
  'school.ownership'?: number;
  'school.institutional_characteristics.level'?: number;
  'latest.admissions.admission_rate.overall'?: number | null;
  'latest.cost.tuition.in_state'?: number | null;
  'latest.cost.tuition.out_of_state'?: number | null;
  'latest.student.size'?: number | null;
  'latest.student.enrollment.undergrad_12_month'?: number | null;
  'latest.earnings.10_yrs_after_entry.median'?: number | null;
  'latest.completion.rate_suppressed.overall'?: number | null;
  [key: string]: unknown;
}

export interface ScorecardResponse {
  metadata: {
    total: number;
    page: number;
    per_page: number;
  };
  results: ScorecardSchool[];
}

// ---------------------------------------------------------------------------
// PubMed / NCBI E-utilities
// ---------------------------------------------------------------------------

export interface PubMedSearchResponse {
  esearchresult: {
    count: string;
    retmax: string;
    retstart: string;
    idlist: string[];
    querytranslation?: string;
  };
}

export interface PubMedArticle {
  uid: string;
  pubdate?: string;
  epubdate?: string;
  source?: string;
  authors?: Array<{ name: string; authtype?: string }>;
  lastauthor?: string;
  title?: string;
  sorttitle?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  lang?: string[];
  issn?: string;
  essn?: string;
  pubtype?: string[];
  articleids?: Array<{ idtype: string; value: string }>;
  fulljournalname?: string;
  sortfirstauthor?: string;
  elocationid?: string;
}

export interface PubMedSummaryResponse {
  result: {
    uids: string[];
    [pmid: string]: PubMedArticle | string[];
  };
}

// ---------------------------------------------------------------------------
// arXiv API (Atom XML, parsed to structured data)
// ---------------------------------------------------------------------------

export interface ArxivEntry {
  id: string;
  title: string;
  summary: string;
  authors: string[];
  published: string;
  updated: string;
  categories: string[];
  doi?: string | null;
  comment?: string | null;
  journal_ref?: string | null;
  pdf_url?: string | null;
}

export interface ArxivResponse {
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  entries: ArxivEntry[];
}

// ---------------------------------------------------------------------------
// CrossRef — Works
// ---------------------------------------------------------------------------

export interface CrossRefAuthor {
  given?: string;
  family?: string;
  name?: string;
  ORCID?: string;
  affiliation?: Array<{ name: string }>;
}

export interface CrossRefWork {
  DOI: string;
  type: string;
  title?: string[];
  'container-title'?: string[];
  author?: CrossRefAuthor[];
  published?: { 'date-parts': number[][] };
  'published-print'?: { 'date-parts': number[][] };
  'published-online'?: { 'date-parts': number[][] };
  abstract?: string;
  subject?: string[];
  'is-referenced-by-count'?: number;
  'references-count'?: number;
  volume?: string;
  issue?: string;
  page?: string;
  publisher?: string;
  ISSN?: string[];
  ISBN?: string[];
  URL?: string;
  license?: Array<{ URL: string; 'content-version': string }>;
  funder?: Array<{ name: string; DOI?: string; award?: string[] }>;
}

export interface CrossRefWorkResponse {
  status: string;
  'message-type': string;
  message: CrossRefWork;
}
