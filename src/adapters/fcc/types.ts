/** Raw response from geo.fcc.gov/api/census/block/find */
export interface FccBlockFindRaw {
  Block?: { FIPS: string; bbox?: number[] };
  County?: { FIPS: string; name: string };
  State?: { FIPS: string; code: string; name: string };
  status: string;
  statusCode?: string;
  statusMessage?: string;
  executionTime?: string;
}

/** Raw proceeding object from ECFS */
export interface FccProceedingRaw {
  id_proceeding?: string | number;
  name?: string;
  description?: string;
  description_display?: string;
  flag_rulemaking_or_docket?: string;
  flag_archived?: string;
  flag_open_close?: string | null;
  date_proceeding_created?: string;
  date_closed?: string | null;
  date_nprm?: string | null;
  date_public_notice?: string | null;
  total_filing_count?: number;
  recent_filing_count?: number;
  bureau?: { code?: string; name?: string };
  applicant_name?: string;
  file_number?: string;
  state?: { abbreviation?: string | null };
}

/** Raw filing object from ECFS */
export interface FccFilingRaw {
  id_submission?: string;
  date_received?: string;
  date_disseminated?: string;
  date_last_modified?: string;
  submissiontype?: { description?: string; short?: string; abbreviation?: string };
  filers?: Array<{ name?: string }>;
  lawfirms?: Array<{ name?: string }>;
  bureaus?: Array<{ code?: string; name?: string }>;
  proceedings?: Array<{ name?: string; description?: string; bureau_name?: string }>;
  documents?: Array<{ filename?: string; src?: string; description?: string }>;
  report_number?: string;
  file_number?: string;
  delegated_authority_number?: string;
  express_comment?: number;
}

/** ECFS proceedings list response */
export interface FccProceedingsResponse {
  proceeding?: FccProceedingRaw[];
  aggregations?: unknown;
}

/** ECFS filings list response */
export interface FccFilingsResponse {
  filing?: FccFilingRaw[];
  aggregations?: unknown;
}
