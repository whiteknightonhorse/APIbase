// ---------------------------------------------------------------------------
// Raw API response types for CBS Netherlands OData API
// ---------------------------------------------------------------------------

export interface CbsCatalogTableRaw {
  Identifier: string;
  Title: string;
  ShortTitle: string;
  ShortDescription: string;
  Period: string;
  Frequency: string;
  Language: string;
  Catalog: string;
  RecordCount: number;
  Updated: string;
  ApiUrl: string;
}

export interface CbsTableInfoRaw {
  Identifier: string;
  Title: string;
  ShortTitle: string;
  ShortDescription: string;
  Summary: string;
  Language: string;
  Catalog: string;
  Frequency: string;
  Period: string;
  OutputStatus: string;
  Source: string;
  Updated: string;
  Modified: string;
  RecordCount: number;
  ColumnCount: number;
  ApiUrl: string;
  FeedUrl: string;
  DefaultSelection: string;
}

export interface CbsDataPropertyRaw {
  ID: number;
  Position: number;
  ParentID: string | null;
  Type: string;
  Key: string;
  Title: string;
  Description: string;
  ReleasePolicy: string | null;
  Unit: string;
  Decimals: number;
  Default: string | null;
}

// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface CbsCatalogEntry {
  identifier: string;
  title: string;
  short_title: string;
  period: string;
  frequency: string;
  record_count: number;
  updated: string;
  api_url: string;
}

export interface CbsCatalogSearchOutput {
  total: number;
  results: CbsCatalogEntry[];
}

export interface CbsTableInfoOutput {
  identifier: string;
  title: string;
  short_title: string;
  description: string;
  summary: string;
  period: string;
  frequency: string;
  language: string;
  source: string;
  output_status: string;
  record_count: number;
  column_count: number;
  updated: string;
  api_url: string;
  default_selection: string;
}

export interface CbsDataProperty {
  position: number;
  key: string;
  type: string;
  title: string;
  description: string;
  unit: string;
  decimals: number;
}

export interface CbsTablePropertiesOutput {
  table_id: string;
  properties: CbsDataProperty[];
}

export interface CbsTableDataOutput {
  table_id: string;
  count: number;
  records: Record<string, unknown>[];
}
