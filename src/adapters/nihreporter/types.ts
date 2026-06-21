/**
 * NIH Reporter API response types (UC-454).
 *
 * API host: api.reporter.nih.gov/v2
 * Auth: None (US Government open data, public domain, unlimited)
 *
 * Endpoints:
 *   POST /v2/projects/search     — search NIH-funded research projects
 *   POST /v2/publications/search — find publications linked to NIH grants
 */

// ---------------------------------------------------------------------------
// Projects search
// ---------------------------------------------------------------------------

export interface NihOrganization {
  org_name: string | null;
  org_city: string | null;
  org_state: string | null;
  org_country: string | null;
}

export interface NihPrincipalInvestigator {
  profile_id: number | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  is_contact_pi: boolean;
}

export interface NihProjectNumSplit {
  appl_type_code: string | null;
  activity_code: string | null;
  ic_code: string | null;
  serial_num: string | null;
  support_year: string | null;
}

export interface NihProject {
  appl_id: number;
  subproject_id: number | null;
  fiscal_year: number;
  project_num: string | null;
  project_serial_num: string | null;
  core_project_num: string | null;
  organization: NihOrganization | null;
  award_type: string | null;
  activity_code: string | null;
  award_amount: number | null;
  direct_cost_amt: number | null;
  indirect_cost_amt: number | null;
  is_active: boolean;
  principal_investigators: NihPrincipalInvestigator[] | null;
  contact_pi_name: string | null;
  project_start_date: string | null;
  project_end_date: string | null;
  budget_start: string | null;
  budget_end: string | null;
  agency_code: string | null;
  funding_mechanism: string | null;
  abstract_text: string | null;
  project_title: string | null;
  phr_text: string | null;
  project_detail_url: string | null;
  date_added: string | null;
}

export interface NihProjectsResponse {
  meta: {
    search_id: string | null;
    total: number;
    offset: number;
    limit: number;
    sort_field: string | null;
    sort_order: string;
    sorted_by_relevance: boolean;
  };
  results: NihProject[];
}

// ---------------------------------------------------------------------------
// Publications search
// ---------------------------------------------------------------------------

export interface NihPublication {
  coreproject: string | null;
  pmid: number;
  applid: number | null;
}

export interface NihPublicationsResponse {
  meta: {
    search_id: string | null;
    total: number;
    offset: number;
    limit: number;
    sort_field: string | null;
    sort_order: string;
  };
  results: NihPublication[];
}
