/**
 * USDA Livestock Mandatory Price Reporting (LMPR) Datamart — type definitions.
 * API: https://mpr.datamart.ams.usda.gov/services/v1.1/reports/{id}
 */

export interface LmprReportSection {
  reportSection: string;
  reportSections: string[];
  stats: {
    'totalRows:': number;
    'returnedRows:': number;
    'userAllowedRows:': number;
  };
  results: LmprRecord[];
}

export interface LmprRecord {
  report_date?: string;
  for_date_begin?: string;
  week_ending_date?: string;
  is_correction?: boolean | null;
  narrative?: string | null;
  report_title?: string;
  slug_name?: string;
  slug_id?: string;
  office_name?: string;
  market_location_name?: string;
  market_location_state?: string;
  market_type?: string;
  published_date?: string;
  // cattle fields
  previous_day_head_count?: string;
  same_day_prev_week_head_count?: string;
  same_day_prev_year_head_count?: string;
  current_week_head_count?: string;
  previous_week_head_count?: string;
  previous_year_head_count?: string;
  class_description?: string;
  selling_basis_description?: string;
  grade_description?: string;
  head_count?: string | null;
  weight_range_low?: string | null;
  weight_range_high?: string | null;
  weight_range_avg?: string | null;
  price_range_low?: string | null;
  price_range_high?: string | null;
  weighted_avg_price?: string | null;
  // hog fields
  barrows_head_count?: string;
  sows_head_count?: string | null;
  boars_head_count?: string | null;
  purchase_type?: string;
  avg_net_price?: string | null;
  avg_live_price?: string | null;
  avg_carcass_price?: string | null;
  // boxed beef fields
  primal_desc?: string;
  choice_600_900?: string | null;
  select_600_900?: string | null;
  // dairy fields
  created_date?: string;
  // lamb fields
  [key: string]: unknown;
}
