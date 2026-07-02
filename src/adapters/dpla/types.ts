export interface DplaDate {
  begin?: string;
  displayDate?: string;
  end?: string;
}

export interface DplaSubject {
  name: string;
}

export interface DplaLanguage {
  iso639_3?: string;
  name?: string;
}

export interface DplaProvider {
  '@id'?: string;
  exactMatch?: string[];
  name: string;
}

export interface DplaSourceResource {
  '@id'?: string;
  collection?: Array<{ title?: string; description?: string }>;
  contributor?: string[];
  creator?: string[];
  date?: DplaDate[];
  description?: string[];
  extent?: string[];
  format?: string[];
  identifier?: string[];
  language?: DplaLanguage[];
  publisher?: string[];
  relation?: string[];
  rights?: string[];
  spatial?: Array<{ name?: string; state?: string; country?: string }>;
  subject?: DplaSubject[];
  temporal?: Array<{ begin?: string; end?: string }>;
  title?: string[];
  type?: string[];
}

export interface DplaItem {
  '@context'?: string;
  '@id'?: string;
  '@type'?: string;
  aggregatedCHO?: string;
  dataProvider?: DplaProvider | string;
  id: string;
  ingestDate?: string;
  ingestType?: string;
  isShownAt?: string;
  object?: string;
  originalRecord?: Record<string, unknown>;
  provider?: DplaProvider;
  rights?: string;
  rightsCategory?: string;
  sourceResource?: DplaSourceResource;
}

export interface DplaFacetTerm {
  term: string;
  count: number;
}

export interface DplaFacet {
  terms: DplaFacetTerm[];
  _type?: string;
}

export interface DplaSearchResponse {
  count?: number;
  start?: number;
  limit?: number;
  docs?: DplaItem[];
  facets?: Record<string, DplaFacet>;
}
