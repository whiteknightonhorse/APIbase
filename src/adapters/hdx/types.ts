// ---------------------------------------------------------------------------
// Raw HDX CKAN Action API response shapes (data.humdata.org/api/3/action)
// ---------------------------------------------------------------------------

export interface HdxActionEnvelope<T> {
  help: string;
  success: boolean;
  result: T;
}

// Trimmed dataset shape returned when `fl=` restricts the Solr field list
export interface HdxDatasetSearchHit {
  id: string;
  name: string;
  title: string;
  notes?: string;
  organization?: string | { name?: string; title?: string };
  num_resources?: number;
  num_tags?: number;
  dataset_date?: string;
  last_modified?: string;
  license_title?: string;
  tags?: Array<string | { name: string }>;
}

export interface HdxPackageSearchResult {
  count: number;
  results: HdxDatasetSearchHit[];
}

export interface HdxResource {
  id: string;
  name?: string;
  description?: string;
  format?: string;
  download_url?: string;
  url?: string;
  size?: number | null;
  last_modified?: string;
  created?: string;
}

export interface HdxTag {
  name: string;
}

export interface HdxOrganizationRef {
  name?: string;
  title?: string;
}

export interface HdxGroupRef {
  name?: string;
  title?: string;
  display_name?: string;
}

export interface HdxPackageShowResult {
  id: string;
  name: string;
  title: string;
  notes?: string;
  organization?: HdxOrganizationRef;
  groups?: HdxGroupRef[];
  tags?: HdxTag[];
  num_resources?: number;
  dataset_date?: string;
  data_update_frequency?: string;
  license_title?: string;
  license_url?: string;
  methodology?: string;
  dataset_source?: string;
  metadata_created?: string;
  metadata_modified?: string;
  private?: boolean;
  resources?: HdxResource[];
}

export interface HdxGroupListEntry {
  id: string;
  name: string;
  title: string;
  display_name?: string;
  package_count?: number;
  description?: string;
}

export interface HdxOrganizationListEntry {
  id: string;
  name: string;
  title: string;
  description?: string;
  package_count?: number;
  image_url?: string;
}

// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface HdxDatasetSummary {
  id: string;
  name: string;
  title: string;
  notes: string | null;
  organization: string | null;
  num_resources: number | null;
  dataset_date: string | null;
  last_modified: string | null;
  license_title: string | null;
  tags: string[];
}

export interface HdxDatasetSearchOutput {
  total: number;
  returned: number;
  datasets: HdxDatasetSummary[];
}

export interface HdxDatasetDetailResource {
  id: string;
  name: string | null;
  description: string | null;
  format: string | null;
  download_url: string | null;
  size_bytes: number | null;
  last_modified: string | null;
}

export interface HdxDatasetDetailOutput {
  id: string;
  name: string;
  title: string;
  notes: string | null;
  organization: string | null;
  locations: string[];
  tags: string[];
  num_resources: number;
  dataset_date: string | null;
  data_update_frequency: string | null;
  license_title: string | null;
  license_url: string | null;
  dataset_source: string | null;
  metadata_modified: string | null;
  resources: HdxDatasetDetailResource[];
}

export interface HdxLocationSummary {
  id: string;
  iso3: string;
  name: string;
  dataset_count: number;
}

export interface HdxLocationListOutput {
  total: number;
  returned: number;
  locations: HdxLocationSummary[];
}

export interface HdxOrganizationSummary {
  id: string;
  slug: string;
  title: string;
  dataset_count: number;
}

export interface HdxOrganizationListOutput {
  total: number;
  returned: number;
  organizations: HdxOrganizationSummary[];
}
