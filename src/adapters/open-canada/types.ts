// ---------------------------------------------------------------------------
// Raw Open Government Canada CKAN Action API response shapes
// (open.canada.ca/data/api/3/action)
// ---------------------------------------------------------------------------

export interface OpenCanadaActionEnvelope<T> {
  help: string;
  success: boolean;
  result: T;
}

// Trimmed dataset shape returned when `fl=` restricts the Solr field list
export interface OpenCanadaDatasetSearchHit {
  id: string;
  name: string;
  title?: string;
  notes?: string;
  organization?: string;
  subject?: string[];
  portal_release_date?: string;
  metadata_modified?: string;
}

export interface OpenCanadaPackageSearchResult {
  count: number;
  results: OpenCanadaDatasetSearchHit[];
  facets?: Record<string, Record<string, number>>;
}

export interface OpenCanadaResource {
  id: string;
  name?: string;
  name_translated?: { en?: string; fr?: string };
  description?: string;
  format?: string;
  url?: string;
  size?: number | null;
  last_modified?: string | null;
  created?: string;
}

export interface OpenCanadaOrganizationRef {
  name?: string;
  title?: string;
}

export interface OpenCanadaGroupRef {
  name?: string;
  title?: string;
  display_name?: string;
}

export interface OpenCanadaPackageShowResult {
  id: string;
  name: string;
  title?: string;
  title_translated?: { en?: string; fr?: string };
  notes?: string;
  notes_translated?: { en?: string; fr?: string };
  organization?: OpenCanadaOrganizationRef;
  groups?: OpenCanadaGroupRef[];
  subject?: string[];
  keywords?: { en?: string[]; fr?: string[] };
  num_resources?: number;
  portal_release_date?: string;
  frequency?: string;
  license_title?: string;
  license_url?: string;
  jurisdiction?: string;
  metadata_modified?: string;
  private?: boolean;
  resources?: OpenCanadaResource[];
}

export interface OpenCanadaOrganizationListEntry {
  id: string;
  name: string;
  title: string;
  display_name?: string;
  description?: string;
  package_count?: number;
}

// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface OpenCanadaDatasetSummary {
  id: string;
  name: string;
  title: string | null;
  notes: string | null;
  organization: string | null;
  subjects: string[];
  portal_release_date: string | null;
  metadata_modified: string | null;
}

export interface OpenCanadaDatasetSearchOutput {
  total: number;
  returned: number;
  datasets: OpenCanadaDatasetSummary[];
}

export interface OpenCanadaDatasetDetailResource {
  id: string;
  name: string | null;
  description: string | null;
  format: string | null;
  download_url: string | null;
  size_bytes: number | null;
  last_modified: string | null;
}

export interface OpenCanadaDatasetDetailOutput {
  id: string;
  name: string;
  title: string | null;
  notes: string | null;
  organization: string | null;
  subjects: string[];
  keywords: string[];
  num_resources: number;
  portal_release_date: string | null;
  frequency: string | null;
  license_title: string | null;
  license_url: string | null;
  jurisdiction: string | null;
  metadata_modified: string | null;
  resources: OpenCanadaDatasetDetailResource[];
}

export interface OpenCanadaSubjectSummary {
  subject: string;
  dataset_count: number;
}

export interface OpenCanadaSubjectListOutput {
  total: number;
  subjects: OpenCanadaSubjectSummary[];
}

export interface OpenCanadaOrganizationSummary {
  id: string;
  slug: string;
  title: string;
  dataset_count: number;
}

export interface OpenCanadaOrganizationListOutput {
  total: number;
  returned: number;
  organizations: OpenCanadaOrganizationSummary[];
}
