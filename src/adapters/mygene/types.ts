/**
 * MyGene.info API response types (UC-479).
 */

export interface MyGeneQueryHit {
  _id: string;
  _score: number;
  symbol?: string;
  name?: string;
  taxid?: number;
  entrezgene?: string;
  type_of_gene?: string;
  summary?: string;
  ensembl?: {
    gene?: string;
    transcript?: string | string[];
  };
  alias?: string | string[];
}

export interface MyGeneQueryResult {
  took: number;
  total: number;
  hits: MyGeneQueryHit[];
}

export interface MyGeneGeneDetail {
  _id: string;
  symbol?: string;
  name?: string;
  taxid?: number;
  entrezgene?: string;
  type_of_gene?: string;
  summary?: string;
  alias?: string | string[];
  ensembl?: {
    gene?: string;
    transcript?: string | string[];
    protein?: string | string[];
  };
  uniprot?: {
    'Swiss-Prot'?: string | string[];
    TrEMBL?: string | string[];
  };
  genomic_pos?: {
    chr?: string;
    start?: number;
    end?: number;
    strand?: number;
  };
  pathway?: {
    kegg?: Array<{ id: string; name: string }>;
    reactome?: Array<{ id: string; name: string }>;
    wikipathways?: Array<{ id: string; name: string }>;
  };
  go?: {
    BP?: Array<{ id: string; term: string; pubmed?: number | number[] }>;
    CC?: Array<{ id: string; term: string; pubmed?: number | number[] }>;
    MF?: Array<{ id: string; term: string; pubmed?: number | number[] }>;
  };
}
