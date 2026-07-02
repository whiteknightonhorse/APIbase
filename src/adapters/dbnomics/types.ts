/** Raw API response types for DBnomics v22 (UC-572). */

export interface DbnomicsProvider {
  code: string;
  name: string;
  region: string;
  slug: string;
  terms_of_use?: string;
  website?: string;
  indexed_at?: string;
}

export interface DbnomicsProvidersResponse {
  _meta: { version: string };
  nb_datasets: number;
  nb_series: number;
  providers: {
    docs: DbnomicsProvider[];
    num_found: number;
    limit: number;
    offset: number;
  };
}

export interface DbnomicsDataset {
  code: string;
  name: string;
  provider_code: string;
  nb_series?: number;
  description?: string;
  indexed_at?: string;
}

export interface DbnomicsDatasetsResponse {
  _meta: { version: string };
  datasets: {
    docs: DbnomicsDataset[];
    num_found: number;
    limit: number;
    offset: number;
  };
}

export interface DbnomicsSeries {
  series_code: string;
  series_name: string;
  dataset_code: string;
  dataset_name: string;
  provider_code: string;
  dimensions: Record<string, string>;
  indexed_at?: string;
  '@frequency'?: string;
  period?: string[];
  value?: (number | null | 'NA')[];
}

export interface DbnomicsSeriesResponse {
  _meta: { version: string; args: Record<string, unknown> };
  series: {
    docs: DbnomicsSeries[];
    num_found: number;
    limit: number;
    offset: number;
  };
  dataset?: Record<string, unknown>;
  provider?: Record<string, unknown>;
}
