export interface SparqlBinding {
  type: 'uri' | 'literal' | 'bnode';
  value: string;
  datatype?: string;
  'xml:lang'?: string;
}

export interface SparqlResults {
  head: { vars: string[] };
  results: {
    distinct: boolean;
    ordered: boolean;
    bindings: Record<string, SparqlBinding>[];
  };
}

export interface EurLexAct {
  celex: string;
  date: string;
  title: string | null;
  in_force: boolean | null;
  cellar_uri: string;
  eur_lex_url: string;
}

export interface EurLexSearchOutput {
  items: EurLexAct[];
  total: number;
  query: string;
}

export interface EurLexDetailOutput {
  celex: string;
  date: string;
  title: string | null;
  in_force: boolean | null;
  cellar_uri: string;
  eur_lex_url: string;
}

export interface EurLexRecentOutput {
  items: EurLexAct[];
  total: number;
  from_date: string;
}

export interface EurLexByTypeOutput {
  items: EurLexAct[];
  total: number;
  doc_type: string;
}
