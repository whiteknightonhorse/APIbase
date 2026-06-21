// ---------------------------------------------------------------------------
// RxNorm raw API response types (NIH NLM RxNav REST API)
// ---------------------------------------------------------------------------

// /REST/drugs.json?name=...
export interface RxNormConceptProperty {
  rxcui: string;
  name: string;
  synonym: string;
  tty: string;
  language: string;
  suppress: string;
}

export interface RxNormConceptGroup {
  tty: string;
  conceptProperties?: RxNormConceptProperty[];
}

export interface RxNormDrugsResponse {
  drugGroup: {
    name: string | null;
    conceptGroup?: RxNormConceptGroup[];
  };
}

// /REST/rxcui/{rxcui}/properties.json
export interface RxNormPropertiesResponse {
  properties: RxNormConceptProperty;
}

// /REST/ndcstatus.json?ndc=...
export interface RxNormNdcStatusResponse {
  ndcStatus: {
    ndc11: string;
    status: string;
    active: string;
    rxnormNdc: string;
    rxcui: string;
    conceptName: string;
    conceptStatus: string;
    sourceList: { sourceName: string[] };
    altNdc: string;
    comment: string | null;
    ndcHistory?: Array<{
      activeRxcui: string;
      originalRxcui: string;
      startDate: string;
      endDate: string;
    }>;
  };
}

// /REST/rxclass/class/byRxcui.json?rxcui=...
export interface RxNormClassEntry {
  minConcept: {
    rxcui: string;
    name: string;
    tty: string;
  };
  rxclassMinConceptItem: {
    classId: string;
    className: string;
    classType: string;
  };
  rela: string;
  relaSource: string;
}

export interface RxNormDrugClassResponse {
  rxclassDrugInfoList: {
    rxclassDrugInfo: RxNormClassEntry[];
  };
}

// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface RxNormDrugConcept {
  rxcui: string;
  name: string;
  synonym: string;
  tty: string;
  tty_label: string;
}

export interface RxNormDrugSearchOutput {
  query: string;
  total: number;
  drugs: RxNormDrugConcept[];
}

export interface RxNormPropertiesOutput {
  rxcui: string;
  name: string;
  synonym: string;
  tty: string;
  tty_label: string;
  language: string;
  suppressed: boolean;
}

export interface RxNormNdcOutput {
  ndc11: string;
  status: string;
  active: boolean;
  rxcui: string;
  concept_name: string;
  concept_status: string;
  sources: string[];
}

export interface RxNormClassItem {
  class_id: string;
  class_name: string;
  class_type: string;
  relationship: string;
  source: string;
}

export interface RxNormDrugClassOutput {
  rxcui: string;
  classes: RxNormClassItem[];
}
