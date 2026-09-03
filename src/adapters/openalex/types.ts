// ---------------------------------------------------------------------------
// Raw OpenAlex REST API response shapes (api.openalex.org)
// ---------------------------------------------------------------------------

export interface OpenAlexOpenAccess {
  is_oa?: boolean;
  oa_status?: string;
  oa_url?: string | null;
}

export interface OpenAlexSource {
  id?: string;
  display_name?: string;
  issn_l?: string | null;
  host_organization_name?: string | null;
  type?: string;
}

export interface OpenAlexLocation {
  is_oa?: boolean;
  landing_page_url?: string | null;
  pdf_url?: string | null;
  source?: OpenAlexSource | null;
}

export interface OpenAlexAuthorRef {
  id?: string;
  display_name?: string;
  orcid?: string | null;
}

export interface OpenAlexAuthorship {
  author_position?: string;
  author?: OpenAlexAuthorRef;
  institutions?: { display_name?: string; country_code?: string | null }[];
}

export interface OpenAlexTopic {
  id?: string;
  display_name?: string;
  score?: number;
}

export interface OpenAlexWork {
  id: string;
  doi?: string | null;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  publication_date?: string | null;
  type?: string;
  cited_by_count?: number;
  open_access?: OpenAlexOpenAccess;
  primary_location?: OpenAlexLocation | null;
  authorships?: OpenAlexAuthorship[];
  primary_topic?: OpenAlexTopic | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  referenced_works_count?: number;
}

export interface OpenAlexWorksResponse {
  meta: { count: number; page?: number; per_page?: number };
  results: OpenAlexWork[];
}

export interface OpenAlexInstitutionRef {
  id?: string;
  display_name?: string;
  country_code?: string | null;
  type?: string;
}

export interface OpenAlexSummaryStats {
  h_index?: number;
  i10_index?: number;
  '2yr_mean_citedness'?: number;
}

export interface OpenAlexAuthor {
  id: string;
  orcid?: string | null;
  display_name?: string;
  works_count?: number;
  cited_by_count?: number;
  last_known_institutions?: OpenAlexInstitutionRef[];
  summary_stats?: OpenAlexSummaryStats;
}

export interface OpenAlexAuthorsResponse {
  meta: { count: number; page?: number; per_page?: number };
  results: OpenAlexAuthor[];
}

// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface OpenAlexWorkSummary {
  id: string;
  doi: string | null;
  title: string;
  publication_year: number | null;
  authors: string[];
  is_oa: boolean;
  oa_status: string | null;
  cited_by_count: number;
  primary_topic: string | null;
}

export interface OpenAlexWorksSearchOutput {
  total: number;
  results: OpenAlexWorkSummary[];
}

export interface OpenAlexAuthorSummary {
  id: string;
  orcid: string | null;
  display_name: string;
  works_count: number;
  cited_by_count: number;
  h_index: number | null;
  last_known_institution: string | null;
  country_code: string | null;
}

export interface OpenAlexAuthorsSearchOutput {
  total: number;
  results: OpenAlexAuthorSummary[];
}

export interface OpenAlexWorkDetailOutput {
  id: string;
  doi: string | null;
  title: string;
  publication_year: number | null;
  publication_date: string | null;
  type: string | null;
  authors: { name: string; orcid: string | null; institutions: string[] }[];
  is_oa: boolean;
  oa_status: string | null;
  oa_url: string | null;
  landing_page_url: string | null;
  pdf_url: string | null;
  cited_by_count: number;
  referenced_works_count: number;
  primary_topic: string | null;
  abstract: string | null;
}
