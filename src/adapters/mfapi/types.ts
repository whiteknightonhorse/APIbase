// ---------------------------------------------------------------------------
// Raw API types from api.mfapi.in
// ---------------------------------------------------------------------------

export interface MfapiScheme {
  schemeCode: number;
  schemeName: string;
  isinGrowth: string | null;
  isinDivReinvestment: string | null;
}

export interface MfapiNavRecord {
  date: string;
  nav: string;
}

export interface MfapiMeta {
  fund_house: string;
  scheme_type: string;
  scheme_category: string;
  scheme_code: number;
  scheme_name: string;
  isin_growth: string | null;
  isin_div_reinvestment: string | null;
}

export interface MfapiSchemeResponse {
  meta: MfapiMeta;
  data: MfapiNavRecord[];
  status: string;
}

// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface SchemeInfo {
  scheme_code: number;
  scheme_name: string;
  isin_growth: string | null;
  isin_div_reinvestment: string | null;
}

export interface NavLatestOutput {
  scheme_code: number;
  scheme_name: string;
  fund_house: string;
  scheme_type: string;
  scheme_category: string;
  isin_growth: string | null;
  nav: number;
  nav_date: string;
}

export interface NavHistoryOutput {
  scheme_code: number;
  scheme_name: string;
  fund_house: string;
  scheme_type: string;
  scheme_category: string;
  isin_growth: string | null;
  total_records: number;
  returned_records: number;
  records: { date: string; nav: number }[];
}

export interface SchemeSearchOutput {
  total_matches: number;
  returned: number;
  schemes: SchemeInfo[];
}

export interface SchemeListOutput {
  total: number;
  page: number;
  per_page: number;
  schemes: SchemeInfo[];
}
