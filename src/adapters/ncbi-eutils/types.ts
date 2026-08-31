/** NCBI E-utilities Taxonomy API raw response types (UC-647). */

export interface EutilsTaxonomySearchResult {
  count?: string;
  retmax?: string;
  retstart?: string;
  idlist?: string[];
  querytranslation?: string;
  ERROR?: string;
  errorlist?: { phrasesnotfound?: string[]; fieldsnotfound?: string[] };
}

export interface EutilsTaxonomySearchResponse {
  header: { type: string; version: string };
  esearchresult: EutilsTaxonomySearchResult;
}

export interface EutilsTaxonomySummary {
  uid: string;
  status?: string;
  rank?: string;
  division?: string;
  scientificname?: string;
  commonname?: string;
  taxid?: number;
  genbankdivision?: string;
  error?: string;
}

export interface EutilsTaxonomySummaryResponse {
  header: { type: string; version: string };
  result: {
    uids: string[];
    [uid: string]: EutilsTaxonomySummary | string[];
  };
}

export interface EutilsLineageNode {
  tax_id: string;
  scientific_name: string;
  rank: string;
}

export interface EutilsTaxonomyLineage {
  tax_id: string;
  found: boolean;
  scientific_name?: string;
  common_name?: string;
  rank?: string;
  division?: string;
  parent_tax_id?: string;
  lineage_text?: string;
  lineage?: EutilsLineageNode[];
}
