/**
 * US Nuclear Regulatory Commission (NRC) Power Reactor Status adapter types (UC-563).
 *
 * Data source: https://www.nrc.gov/reading-rm/doc-collections/event-status/reactor-status/
 * Auth: None (US Government open data, public domain — 10 CFR / Atomic Energy Act).
 *
 * Format: pipe-delimited text  ReportDt|Unit|Power
 *   ReportDt  — date string  "M/D/YYYY 12:00:00 AM"
 *   Unit      — reactor name string  "Arkansas Nuclear 1"
 *   Power     — integer 0-100  (percent of licensed thermal power)
 */

export interface NrcRawRow {
  date: string;
  unit: string;
  power: number;
}

export interface NrcReactorSnapshot {
  unit: string;
  power_pct: number;
  status: 'full_power' | 'reduced_power' | 'shutdown';
  date: string;
}

export interface NrcCurrentStatusOutput {
  report_date: string;
  total_reactors: number;
  at_full_power: number;
  reduced_power: number;
  shutdown: number;
  reactors: NrcReactorSnapshot[];
}

export interface NrcHistoryEntry {
  date: string;
  power_pct: number;
  status: 'full_power' | 'reduced_power' | 'shutdown';
}

export interface NrcReactorHistoryOutput {
  unit: string;
  days_requested: number;
  days_returned: number;
  from_date: string;
  to_date: string;
  history: NrcHistoryEntry[];
}

export interface NrcOutagesOutput {
  report_date: string;
  threshold_pct: number;
  total_below_threshold: number;
  reactors: NrcReactorSnapshot[];
}

export interface NrcAnnualDataOutput {
  year: number;
  unit_filter?: string;
  total_records: number;
  reactors_covered: number;
  dates_covered: number;
  records: NrcRawRow[];
}
