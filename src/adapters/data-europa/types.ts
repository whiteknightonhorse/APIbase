// ---------------------------------------------------------------------------
// Raw data.europa.eu Hub-Search API response shapes
// (data.europa.eu/api/hub/search)
// ---------------------------------------------------------------------------

// Most DCAT-AP fields on the /search endpoint are returned as either a plain
// string or a map of ISO 639-1 language code -> localized string.
export type LocalizedString = string | Record<string, string>;

export interface DataEuropaCountryRef {
  id: string;
  label: string;
  resource?: string;
}

export interface DataEuropaCatalogRef {
  id: string;
  title?: LocalizedString;
}

export interface DataEuropaCategoryRef {
  id: string;
  label?: LocalizedString;
}

export interface DataEuropaDistributionFormat {
  id?: string;
  label?: string;
}

export interface DataEuropaDistribution {
  id?: string;
  format?: DataEuropaDistributionFormat;
  access_url?: string[];
  license?: { id?: string; label?: LocalizedString };
}

export interface DataEuropaSearchHit {
  id: string;
  title?: LocalizedString;
  description?: LocalizedString;
  catalog?: DataEuropaCatalogRef;
  country?: DataEuropaCountryRef;
  categories?: DataEuropaCategoryRef[];
  issued?: string;
  modified?: string;
  distributions?: DataEuropaDistribution[];
}

export interface DataEuropaSearchResult {
  count: number;
  results: DataEuropaSearchHit[];
}

export interface DataEuropaSearchEnvelope {
  result: DataEuropaSearchResult;
}

// --- CKAN-compatible shim (/ckan/package_show) — flat, single-language shape ---

export interface DataEuropaCkanOrganization {
  id?: string;
  name?: string | null;
  title?: LocalizedString;
}

export interface DataEuropaCkanGroup {
  id?: string;
  name?: string | null;
  'display-name'?: string | null;
}

export interface DataEuropaCkanResource {
  id: string;
  format?: string;
  access_url?: string;
  license?: { id?: string; label?: LocalizedString } | null;
  date_released?: string;
  date_updated?: string;
}

export interface DataEuropaCkanPackageShowResult {
  id: string;
  title?: LocalizedString;
  notes?: LocalizedString;
  organization?: DataEuropaCkanOrganization | null;
  groups?: DataEuropaCkanGroup[];
  tags?: string[];
  license_id?: string | null;
  num_resources?: number;
  metadata_created?: string;
  metadata_modified?: string;
  resources?: DataEuropaCkanResource[];
}

export interface DataEuropaCkanEnvelope<T> {
  success: boolean;
  result: T;
}

// --- Vocabulary (/vocabularies/{vocabulary}) ---

export interface DataEuropaVocabularyEntry {
  id: string;
  pref_label?: LocalizedString;
}

export interface DataEuropaVocabularyResult {
  count: number;
  results: DataEuropaVocabularyEntry[];
}

export interface DataEuropaVocabularyEnvelope {
  result: DataEuropaVocabularyResult;
}

// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface DataEuropaDatasetSummary {
  id: string;
  title: string | null;
  description: string | null;
  catalog_id: string | null;
  catalog_title: string | null;
  country: string | null;
  categories: string[];
  issued: string | null;
  modified: string | null;
  distribution_count: number;
  formats: string[];
}

export interface DataEuropaDatasetSearchOutput {
  total: number;
  returned: number;
  datasets: DataEuropaDatasetSummary[];
}

export interface DataEuropaDatasetDistribution {
  id: string;
  format: string | null;
  download_url: string | null;
  license: string | null;
  date_released: string | null;
  date_updated: string | null;
}

export interface DataEuropaDatasetDetailOutput {
  id: string;
  title: string | null;
  description: string | null;
  catalog: string | null;
  catalog_title: string | null;
  tags: string[];
  license_id: string | null;
  num_resources: number;
  metadata_created: string | null;
  metadata_modified: string | null;
  distributions: DataEuropaDatasetDistribution[];
}

export interface DataEuropaThemeSummary {
  id: string;
  label: string | null;
}

export interface DataEuropaThemeListOutput {
  total: number;
  themes: DataEuropaThemeSummary[];
}

export interface DataEuropaCatalogueListOutput {
  total: number;
  returned: number;
  catalogues: string[];
}
