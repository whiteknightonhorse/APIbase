// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface AwardResult {
  award_id: string;
  recipient: string;
  amount: number;
  agency: string;
  award_type: string;
  start_date: string;
  end_date: string;
  description: string;
}

export interface SpendingAwardsOutput {
  total: number;
  page: number;
  limit: number;
  results: AwardResult[];
}

export interface SpendingAgencyOutput {
  agency_name: string;
  toptier_code: string;
  fiscal_year: number;
  total: number;
  page: number;
  results: AwardResult[];
}

export interface GeoSpendingResult {
  state: string;
  amount: number;
  award_count: number | null;
  population: number | null;
  per_capita: number | null;
}

export interface SpendingGeographyOutput {
  scope: string;
  fiscal_year: string;
  total_states: number;
  results: GeoSpendingResult[];
}
