// ---------------------------------------------------------------------------
// Raw Australian Government Open Data CKAN Action API response shapes
// (data.gov.au/data/api/3/action)
// ---------------------------------------------------------------------------

export interface AuDataGovActionEnvelope<T> {
  help: string;
  success: boolean;
  result: T;
}

// Trimmed dataset shape returned when `fl=` restricts the Solr field list —
// `organization` resolves to the flat slug string in this mode (not the
// nested object CKAN returns when `fl` is omitted).
export interface AuDataGovDatasetSearchHit {
  id: string;
  name: string;
  title?: string;
  notes?: string;
  organization?: string;
  metadata_modified?: string;
}

export interface AuDataGovPackageSearchResult {
  count: number;
  results: AuDataGovDatasetSearchHit[];
}

export interface AuDataGovSubjectFacetResult {
  search_facets?: {
    subject?: {
      items: Array<{ name: string; display_name: string; count: number }>;
    };
  };
}

export interface AuDataGovResource {
  id: string;
  name?: string;
  description?: string;
  format?: string;
  url?: string;
  size?: number | null;
  last_modified?: string | null;
  created?: string;
}

export interface AuDataGovOrganizationRef {
  name?: string;
  title?: string;
}

export interface AuDataGovPackageShowResult {
  id: string;
  name: string;
  title?: string;
  notes?: string;
  organization?: AuDataGovOrganizationRef;
  tags?: Array<{ name: string; display_name?: string }>;
  num_resources?: number;
  license_title?: string;
  license_url?: string;
  metadata_created?: string;
  metadata_modified?: string;
  resources?: AuDataGovResource[];
}

export interface AuDataGovOrganizationAutocompleteEntry {
  id: string;
  name: string;
  title: string;
}

// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface AuDataGovDatasetSummary {
  id: string;
  name: string;
  title: string | null;
  notes: string | null;
  organization: string | null;
  metadata_modified: string | null;
}

export interface AuDataGovDatasetSearchOutput {
  total: number;
  returned: number;
  datasets: AuDataGovDatasetSummary[];
}

export interface AuDataGovDatasetDetailResource {
  id: string;
  name: string | null;
  description: string | null;
  format: string | null;
  download_url: string | null;
  size_bytes: number | null;
  last_modified: string | null;
}

export interface AuDataGovDatasetDetailOutput {
  id: string;
  name: string;
  title: string | null;
  notes: string | null;
  organization: string | null;
  tags: string[];
  num_resources: number;
  license_title: string | null;
  license_url: string | null;
  metadata_created: string | null;
  metadata_modified: string | null;
  resources: AuDataGovDatasetDetailResource[];
}

export interface AuDataGovSubjectSummary {
  subject: string;
  dataset_count: number;
}

export interface AuDataGovSubjectListOutput {
  total: number;
  subjects: AuDataGovSubjectSummary[];
}

export interface AuDataGovOrganizationSummary {
  id: string;
  slug: string;
  title: string;
}

export interface AuDataGovOrganizationSearchOutput {
  returned: number;
  organizations: AuDataGovOrganizationSummary[];
}
