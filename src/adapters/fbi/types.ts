// ---------------------------------------------------------------------------
// FBI Crime Data Explorer (UCR) API — raw response types
// https://api.usa.gov/crime/fbi/cde
// ---------------------------------------------------------------------------

/** Raw monthly data map returned by the CDE summarized endpoint. Key = "MM-YYYY" */
export type MonthlyMap = Record<string, number>;

/** Inner structure of the summarized offense endpoint */
export interface FbiOffenseRates {
  rates: Record<string, MonthlyMap>;
  actuals: Record<string, MonthlyMap>;
}

export interface FbiPopulationData {
  population: Record<string, MonthlyMap>;
  participated_population: Record<string, MonthlyMap>;
}

export interface FbiCdeProperties {
  max_data_date: { UCR: string };
  last_refresh_date: { UCR: string };
}

/** Full raw response from /summarized/national/{offense} */
export interface FbiSummarizedRaw {
  offenses: FbiOffenseRates;
  tooltips?: unknown;
  populations: FbiPopulationData;
  cde_properties: FbiCdeProperties;
}

// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface FbiMonthlyDataPoint {
  month: string;
  offenses: number;
  rate_per_100k: number;
  clearances: number;
  clearance_rate_pct: number | null;
}

export interface FbiNationalOffensesOutput {
  offense_type: string;
  from: string;
  to: string;
  monthly_data: FbiMonthlyDataPoint[];
  total_offenses: number;
  total_clearances: number;
  avg_rate_per_100k: number;
  max_data_date: string;
  last_refresh: string;
}

export interface FbiStateMonthlyDataPoint extends FbiMonthlyDataPoint {
  state_name: string;
}

export interface FbiStateOffensesOutput {
  state: string;
  offense_type: string;
  from: string;
  to: string;
  state_data: FbiStateMonthlyDataPoint[];
  national_data: FbiMonthlyDataPoint[];
  max_data_date: string;
  last_refresh: string;
}

export interface FbiAnnualDataPoint {
  year: number;
  total_offenses: number;
  avg_rate_per_100k: number;
  total_clearances: number;
  clearance_rate_pct: number | null;
}

export interface FbiNationalAnnualOutput {
  offense_type: string;
  from_year: number;
  to_year: number;
  annual_data: FbiAnnualDataPoint[];
  overall_total_offenses: number;
  overall_clearance_rate_pct: number | null;
}

export interface FbiStateAnnualOutput {
  state: string;
  offense_type: string;
  from_year: number;
  to_year: number;
  state_annual_data: FbiAnnualDataPoint[];
  national_annual_data: FbiAnnualDataPoint[];
}
