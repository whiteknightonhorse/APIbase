// BLS Public Data API v2 — raw response types (UC-509)

export interface BLSDataPoint {
  year: string;
  period: string;
  periodName: string;
  value: string;
  footnotes: Array<{ code?: string; text?: string }>;
}

export interface BLSSeries {
  seriesID: string;
  data: BLSDataPoint[];
}

export interface BLSRawResponse {
  status: string;
  responseTime: number;
  message: string[];
  Results: {
    series: BLSSeries[];
  };
}

// Normalized output types

export interface BLSDataRecord {
  year: number;
  period: string;
  period_name: string;
  value: number;
}

export interface BLSSeriesOutput {
  series_id: string;
  latest_value: number;
  latest_period: string;
  unit?: string;
  records: BLSDataRecord[];
}

export interface BLSMultiSeriesOutput {
  series: BLSSeriesOutput[];
  start_year: number;
  end_year: number;
  source: string;
}

export interface BLSCpiOutput {
  item: string;
  series_id: string;
  latest_value: number;
  latest_period: string;
  year_over_year_pct: number | null;
  records: BLSDataRecord[];
  source: string;
}

export interface BLSUnemploymentOutput {
  measure: string;
  series_id: string;
  latest_value: number;
  latest_period: string;
  records: BLSDataRecord[];
  source: string;
}

export interface BLSPayrollsOutput {
  industry: string;
  series_id: string;
  latest_value_thousands: number;
  latest_period: string;
  records: BLSDataRecord[];
  source: string;
}
