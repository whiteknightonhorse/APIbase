// Raw response shapes from the Socrata Discovery/Catalog API (api.us.socrata.com/api/catalog/v1)
// and the per-domain Socrata "views" metadata + SODA data endpoints.

export interface SocrataCatalogResource {
  name: string;
  id: string;
  description?: string;
  attribution?: string;
  type: string;
  updatedAt?: string;
  createdAt?: string;
  download_count?: number;
}

export interface SocrataCatalogClassification {
  domain_category?: string;
  domain_tags?: string[];
}

export interface SocrataCatalogMetadata {
  domain: string;
  license?: string;
}

export interface SocrataCatalogResult {
  resource: SocrataCatalogResource;
  classification?: SocrataCatalogClassification;
  metadata: SocrataCatalogMetadata;
  link?: string;
  permalink?: string;
}

export interface SocrataCatalogResponse {
  results: SocrataCatalogResult[];
  resultSetSize: number;
}

export interface SocrataViewColumn {
  name: string;
  fieldName: string;
  dataTypeName: string;
  description?: string;
}

export interface SocrataViewMetadata {
  id: string;
  name: string;
  description?: string;
  category?: string;
  attribution?: string;
  createdAt?: number;
  rowsUpdatedAt?: number;
  viewCount?: number;
  downloadCount?: number;
  tags?: string[];
  columns?: SocrataViewColumn[];
}

// SODA `/resource/{id}.json` responses are per-dataset — arbitrary flat JSON objects.
export type SocrataDataRow = Record<string, unknown>;
