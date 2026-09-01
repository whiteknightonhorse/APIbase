/** Raw response shapes for the UKHSA Data Dashboard public REST API (UC-653). */

/** A single { name, link } entry returned by every browse-level list endpoint. */
export interface UkhsaDashboardBrowseLink {
  name: string;
  link: string;
}

/** One row of a metric's paginated timeseries data. */
export interface UkhsaDashboardMetricDataPoint {
  theme: string;
  sub_theme: string;
  topic: string;
  geography_type: string;
  geography: string;
  geography_code: string;
  metric: string;
  metric_group: string;
  stratum: string;
  sex: string;
  age: string;
  year: number;
  month: number | null;
  epiweek: number | null;
  date: string;
  metric_value: number;
  in_reporting_delay_period: boolean;
}

/** DRF-paginated envelope returned by the leaf metric data endpoint. */
export interface UkhsaDashboardMetricDataResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: UkhsaDashboardMetricDataPoint[];
}

export interface UkhsaDashboardBrowseOutput {
  level: 'themes' | 'sub_themes' | 'topics' | 'geography_types' | 'geographies' | 'metrics';
  total: number;
  items: string[];
}

export interface UkhsaDashboardMetricDataOutput {
  theme: string;
  sub_theme: string;
  topic: string;
  geography_type: string;
  geography: string;
  metric: string;
  total: number;
  page: number;
  has_more: boolean;
  data_points: Array<{
    date: string;
    year: number;
    month: number | null;
    epiweek: number | null;
    metric_value: number;
    sex: string;
    age: string;
    stratum: string;
    in_reporting_delay_period: boolean;
  }>;
}
