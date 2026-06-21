/** Raw API response types for the Catalogue of Life API (api.catalogueoflife.org). */

export interface ColName {
  id: string;
  scientificName?: string;
  authorship?: string;
  rank?: string;
  code?: string;
}

export interface ColClassificationEntry {
  id: string;
  name: string;
  authorship?: string;
  rank: string;
  status: string;
}

/** Single result from /dataset/3/nameusage/search */
export interface ColNameUsageResult {
  id: string;
  classification?: ColClassificationEntry[];
  usage?: {
    id?: string;
    name?: ColName;
    status?: string;
    extinct?: boolean;
    label?: string;
  };
  vernacularNames?: Array<{ name: string; language?: string }>;
  sectorDatasetKey?: number;
  group?: string;
}

/** Paginated response from /dataset/3/nameusage/search */
export interface ColSearchResponse {
  offset: number;
  limit: number;
  total: number;
  result: ColNameUsageResult[];
  empty?: boolean;
  last?: boolean;
}

/** Single nameusage record (from /dataset/3/nameusage/{id}) */
export interface ColNameUsageDetail {
  id: string;
  datasetKey?: number;
  name?: ColName;
  status?: string;
  parentId?: string;
  extinct?: boolean;
  label?: string;
  labelHtml?: string;
  scrutinizer?: string;
  scrutinizerDate?: string;
  link?: string;
}

/** Single suggestion from /dataset/3/nameusage/suggest */
export interface ColSuggestion {
  match: string;
  context?: string;
  usageId: string;
  nameId?: string;
  rank?: string;
  status?: string;
  nomCode?: string;
  group?: string;
  suggestion?: string;
}

/* ─── Normalized output shapes ─────────────────────────────────────────── */

export interface ColTaxonSummary {
  id: string;
  scientific_name: string;
  authorship: string;
  rank: string;
  status: string;
  extinct: boolean;
  group: string;
  kingdom: string;
  phylum: string;
  class_name: string;
  order: string;
  family: string;
  genus: string;
  vernacular_names: string[];
}

export interface ColSearchOutput {
  total: number;
  offset: number;
  results: ColTaxonSummary[];
}

export interface ColDetailOutput extends ColTaxonSummary {
  parent_id: string;
  scrutinizer: string;
  scrutinizer_date: string;
  link: string;
}

export interface ColSuggestOutput {
  suggestions: Array<{
    usage_id: string;
    match: string;
    rank: string;
    status: string;
    group: string;
    context: string;
    suggestion: string;
  }>;
}

export interface ColChildrenOutput {
  parent_id: string;
  total: number;
  results: ColTaxonSummary[];
}
