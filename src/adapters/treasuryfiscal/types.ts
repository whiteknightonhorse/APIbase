/** US Treasury Fiscal Data API response types (UC-527) */

export interface TreasuryFiscalMeta {
  count: number;
  labels: Record<string, string>;
  dataTypes?: Record<string, string>;
  dataFormats?: Record<string, string>;
  'total-count'?: number;
  'total-pages'?: number;
}

export interface TreasuryFiscalResponse<T> {
  data: T[];
  meta: TreasuryFiscalMeta;
}

export interface DebtRecord {
  record_date: string;
  debt_held_public_amt: string;
  intragov_hold_amt: string;
  tot_pub_debt_out_amt: string;
  record_fiscal_year: string;
  record_calendar_year: string;
  record_calendar_month: string;
  record_calendar_day: string;
}

export interface InterestRateRecord {
  record_date: string;
  security_type_desc: string;
  security_desc: string;
  avg_interest_rate_amt: string;
}

export interface QuarterlyYieldRecord {
  record_date: string;
  quarter_desc: string;
  yield_pct: string;
}

export interface DebtExpenseRecord {
  record_date: string;
  expense_catg_desc: string;
  expense_group_desc: string;
  expense_type_desc: string;
  month_expense_amt: string;
  fytd_expense_amt: string;
}
