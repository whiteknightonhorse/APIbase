export interface CernRecordType {
  primary: string;
  secondary?: string[];
}

export interface CernAbstract {
  description: string;
}

export interface CernFile {
  key: string;
  size: number;
  uri?: string;
  checksum?: string;
}

export interface CernLink {
  text?: string;
  url: string;
  description?: string;
}

export interface CernGlossarySeeAlso {
  term: string;
}

export interface CernMetadata {
  title?: string;
  type?: CernRecordType;
  abstract?: CernAbstract;
  experiment?: string[];
  date_published?: string;
  collections?: string[];
  availability?: string;
  collision_energy?: string;
  collision_type?: string;
  accelerator?: string;
  authors?: Array<{ name: string; orcid?: string }>;
  files?: CernFile[];
  links?: CernLink[];
  keywords?: string[];
  license?: { attribution?: string };
  run_period?: string[];
  // Glossary-specific
  term?: string[];
  definition?: string;
  category?: string;
  anchor?: string;
  see_also?: CernGlossarySeeAlso[];
}

export interface CernRecord {
  id: string;
  created: string;
  updated: string;
  metadata: CernMetadata;
  links?: Record<string, string>;
}

export interface CernSearchResponse {
  hits: {
    hits: CernRecord[];
    total: number;
  };
  links?: {
    next?: string;
    self?: string;
  };
}
