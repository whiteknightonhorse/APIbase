// ---------------------------------------------------------------------------
// Normalized output types
// ---------------------------------------------------------------------------

export interface HfModelResult {
  model_id: string;
  pipeline_tag: string;
  downloads: number;
  likes: number;
  tags: string[];
  last_modified: string;
}

export interface HfModelsOutput {
  total: number;
  results: HfModelResult[];
}

export interface HfModelDetailOutput {
  model_id: string;
  pipeline_tag: string;
  library_name: string;
  downloads: number;
  likes: number;
  tags: string[];
  author: string;
  last_modified: string;
  card_data: Record<string, unknown>;
}

export interface HfDatasetResult {
  id: string;
  downloads: number;
  likes: number;
  tags: string[];
  last_modified: string;
}

export interface HfDatasetsOutput {
  total: number;
  results: HfDatasetResult[];
}
