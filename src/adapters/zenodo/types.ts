/** Zenodo REST API response types (UC-461). Open-access research repository. */

export interface ZenodoCreator {
  name: string;
  affiliation?: string;
  orcid?: string;
  gnd?: string;
}

export interface ZenodoResourceType {
  type: string;
  subtype?: string;
  title?: string;
}

export interface ZenodoFile {
  key: string;
  mimetype?: string;
  size?: number;
  checksum?: string;
  links?: { self?: string; download?: string };
}

export interface ZenodoRecordMetadata {
  title: string;
  doi?: string;
  publication_date?: string;
  description?: string;
  access_right?: string;
  creators?: ZenodoCreator[];
  keywords?: string[];
  resource_type?: ZenodoResourceType;
  license?: { id?: string };
  communities?: Array<{ id?: string }>;
  language?: string;
  notes?: string;
  journal?: Record<string, string>;
}

export interface ZenodoRecord {
  id: string | number;
  recid?: string | number;
  conceptrecid?: string;
  doi?: string;
  doi_url?: string;
  conceptdoi?: string;
  created?: string;
  modified?: string;
  updated?: string;
  title?: string;
  metadata?: ZenodoRecordMetadata;
  files?: ZenodoFile[];
  links?: Record<string, string>;
  stats?: {
    downloads?: number;
    unique_downloads?: number;
    views?: number;
    unique_views?: number;
    version_downloads?: number;
    version_views?: number;
  };
  status?: string;
}

export interface ZenodoSearchResponse {
  hits: {
    hits: ZenodoRecord[];
    total: number;
  };
  links?: Record<string, string>;
  aggregations?: Record<string, unknown>;
}

export interface ZenodoFilesResponse {
  enabled?: boolean;
  entries?: ZenodoFile[];
  links?: Record<string, string>;
}

export interface ZenodoCommunity {
  id?: string;
  slug?: string;
  created?: string;
  updated?: string;
  metadata?: { title?: string; description?: string; website?: string; type?: string };
  links?: Record<string, string>;
}

export interface ZenodoCommunitySearchResponse {
  hits: {
    hits: ZenodoCommunity[];
    total: number | { value: number; relation: string };
  };
  links?: Record<string, string>;
}
