// Raw response shapes for the Argentine government Series de Tiempo API
// (apis.datos.gob.ar/series/api). Only the fields actually consumed by the
// adapter are typed.

export interface SeriesCatalogRef {
  identifier?: string;
  title?: string;
}

export interface SeriesDatasetRef {
  title?: string;
  description?: string;
  source?: string;
  publisher?: { name?: string };
}

export interface SeriesDistributionRef {
  title?: string;
  downloadURL?: string;
}

export interface SeriesFieldRef {
  id: string;
  description?: string;
  units?: string;
  representation_mode?: string;
}

export interface SeriesMetaEntry {
  catalog?: SeriesCatalogRef;
  dataset?: SeriesDatasetRef;
  distribution?: SeriesDistributionRef;
  field?: SeriesFieldRef;
}

export interface SeriesTimeRangeMeta {
  frequency?: string;
  start_date?: string;
  end_date?: string;
}

/** Response shape for GET /series/?ids=... */
export interface SeriesDataResponse {
  data: Array<[string, ...(number | null)[]]>;
  count: number;
  meta?: [SeriesTimeRangeMeta, ...SeriesMetaEntry[]];
  errors?: Array<{ error: string }>;
  failed_series?: string[];
}

/** One search result entry from GET /search/?q=... */
export interface SeriesSearchField {
  id: string;
  description?: string;
  title?: string;
  frequency?: string;
  time_index_start?: string;
  time_index_end?: string;
  units?: string;
}

export interface SeriesSearchDataset {
  title?: string;
  source?: string;
  publisher?: { name?: string };
  theme?: string;
}

export interface SeriesSearchResult {
  field: SeriesSearchField;
  dataset?: SeriesSearchDataset;
}

/** Response shape for GET /search/?q=... */
export interface SeriesSearchResponse {
  data: SeriesSearchResult[];
  count: number;
  limit?: number;
  start?: number;
}
