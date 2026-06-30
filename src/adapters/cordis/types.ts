// ---------------------------------------------------------------------------
// CORDIS EURIO SPARQL raw binding type
// ---------------------------------------------------------------------------

export interface SparqlBinding {
  [varName: string]: {
    type: 'uri' | 'literal' | 'bnode';
    value: string;
    'xml:lang'?: string;
    datatype?: string;
  };
}

export interface SparqlResult {
  head: { vars: string[] };
  results: { bindings: SparqlBinding[] };
}

// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface CordisProjectSummary {
  id: string;
  rcn: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
}

export interface CordisProjectSearchOutput {
  total: number;
  results: CordisProjectSummary[];
}

export interface CordisOrgParticipant {
  name: string;
  role: string;
}

export interface CordisProjectDetail {
  id: string;
  rcn: string;
  title: string;
  acronym: string | null;
  abstract: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  total_cost_eur: number | null;
  duration_months: number | null;
  signature_date: string | null;
  url: string;
  organisations: CordisOrgParticipant[];
}

export interface CordisOrgResult {
  id: string;
  rcn: string;
  name: string;
  country: string | null;
  url: string | null;
  type: string | null;
}

export interface CordisOrgSearchOutput {
  total: number;
  results: CordisOrgResult[];
}

export interface CordisPublication {
  id: string;
  title: string;
  doi: string | null;
  publication_date: string | null;
  project_rcn: string | null;
}

export interface CordisPublicationsOutput {
  total: number;
  results: CordisPublication[];
}
