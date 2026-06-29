// ---------------------------------------------------------------------------
// ONS UK Statistics API — raw response types (UC-533)
// ---------------------------------------------------------------------------

export interface OnsDatasetItem {
  id: string;
  title: string;
  description?: string;
  last_updated?: string;
  release_frequency?: string;
  state?: string;
  national_statistic?: boolean;
  unit_of_measure?: string;
  next_release?: string;
  keywords?: string[];
  links?: {
    self?: { href: string };
    latest_version?: { href: string };
    editions?: { href: string };
  };
}

export interface OnsDatasetListResponse {
  items: OnsDatasetItem[];
  count: number;
  offset: number;
  limit: number;
  total_count: number;
}

export interface OnsObservationDimension {
  href?: string;
  id?: string;
  label?: string;
}

export interface OnsObservation {
  dimensions: Record<string, OnsObservationDimension>;
  observation: string | null;
}

export interface OnsObservationsResponse {
  dimensions?: Record<string, { option?: { href?: string; id?: string } }>;
  limit: number;
  offset: number;
  total_observations: number;
  observations: OnsObservation[] | null;
  unit_of_measure?: string;
  links?: {
    dataset_metadata?: { href: string };
    self?: { href: string };
    version?: { href: string; id?: string };
  };
}

export interface OnsDatasetMetadata {
  id?: string;
  title?: string;
  description?: string;
  links: {
    latest_version: { href: string };
    editions?: { href: string };
  };
}

// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface OnsDataRecord {
  period: string;
  value: number | null;
}

export interface OnsStatsOutput {
  dataset_id: string;
  title: string;
  unit: string;
  latest_period: string;
  latest_value: number | null;
  total_observations: number;
  returned_observations: number;
  records: OnsDataRecord[];
}

export interface OnsDatasetSummary {
  id: string;
  title: string;
  description: string;
  last_updated: string;
  release_frequency: string;
  state: string;
  national_statistic: boolean;
}

export interface OnsDatasetsOutput {
  total_count: number;
  returned: number;
  datasets: OnsDatasetSummary[];
}
