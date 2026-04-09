// ---------------------------------------------------------------------------
// Normalized output types
// ---------------------------------------------------------------------------

export interface CdcDatasetResult {
  id: string;
  name: string;
  description: string;
  category: string;
  updated_at: string;
  page_views: number;
}

export interface CdcDatasetsOutput {
  total: number;
  results: CdcDatasetResult[];
}

export interface CdcQueryOutput {
  dataset_id: string;
  rows: number;
  columns: string[];
  data: Record<string, unknown>[];
}
