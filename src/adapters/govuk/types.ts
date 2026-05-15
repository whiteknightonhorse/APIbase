// ---------------------------------------------------------------------------
// GOV.UK Content API — Raw API response shapes (only fields we consume)
// UC-430
// ---------------------------------------------------------------------------

/**
 * A single search result item from GET /api/search.json
 */
export interface GovukSearchResult {
  title: string;
  link: string;
  description?: string | null;
  format?: string | null;
  public_timestamp?: string | null;
  organisations?: GovukOrganisationRef[] | null;
  content_purpose_supergroup?: string | null;
  content_store_document_type?: string | null;
}

export interface GovukOrganisationRef {
  slug?: string | null;
  link?: string | null;
  title?: string | null;
  acronym?: string | null;
  organisation_type?: string | null;
  organisation_state?: string | null;
}

/**
 * Raw response from GET /api/search.json
 */
export interface GovukSearchResponse {
  results: GovukSearchResult[];
  total: number;
  start: number;
  facets?: Record<string, unknown>;
}

/**
 * Raw response from GET /api/content{base_path}
 * Shape varies by content type — we return the raw object unchanged.
 */
export interface GovukContentResponse {
  base_path: string;
  content_id: string;
  title: string;
  description?: string | null;
  document_type: string;
  schema_name: string;
  first_published_at?: string | null;
  public_updated_at?: string | null;
  publishing_app?: string | null;
  rendering_app?: string | null;
  locale?: string | null;
  details?: Record<string, unknown> | null;
  links?: Record<string, unknown> | null;
  organisations?: GovukOrganisationRef[] | null;
  [key: string]: unknown;
}

/**
 * A single organisation from GET /api/organisations
 */
export interface GovukOrganisation {
  id: string;
  title: string;
  format: string;
  updated_at: string;
  web_url: string;
  details?: {
    slug?: string | null;
    abbreviation?: string | null;
    logo?: {
      formatted_title?: string | null;
    } | null;
    organisation_type?: string | null;
    organisation_govuk_status?: {
      status?: string | null;
    } | null;
  } | null;
  parent_organisations?: GovukOrganisationRef[] | null;
  child_organisations?: GovukOrganisationRef[] | null;
  links?: GovukOrganisationLink[];
}

export interface GovukOrganisationLink {
  rel: string;
  href: string;
}

/**
 * Raw response from GET /api/organisations
 */
export interface GovukOrganisationsResponse {
  results: GovukOrganisation[];
  total: number;
  current_page: number;
  pages: number;
  page_size: number;
  _response_info?: {
    status?: string;
    links?: GovukOrganisationLink[];
  };
}
