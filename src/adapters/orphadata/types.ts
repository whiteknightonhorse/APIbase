// ---------------------------------------------------------------------------
// Orphadata raw API response types
// ---------------------------------------------------------------------------

export interface OrphadataExternalRef {
  Source: string;
  Reference: string;
  DisorderMappingRelation: string;
  DisorderMappingValidationStatus: string;
  DisorderMappingICDRelation?: string | null;
  DisorderMappingICDRefUri?: number | null;
  DisorderMappingICDRefUrl?: string | null;
}

export interface OrphadataRawDisease {
  ORPHAcode: number;
  'Preferred term': string;
  DisorderGroup: string;
  Typology: string;
  OrphanetURL: string;
  Date?: string;
  SummaryInformation?: Array<{ Definition: string }>;
  ExternalReference?: OrphadataExternalRef[];
  Synonym?: string[];
}

export interface OrphadataPrevalence {
  PrevalenceType: string;
  PrevalenceClass: string;
  PrevalenceGeographic: string;
  PrevalenceQualification: string;
  PrevalenceValidationStatus: string;
  ValMoy: string;
  Source: string;
}

export interface OrphadataRawEpidemiology {
  ORPHAcode: number;
  'Preferred term': string;
  DisorderGroup: string;
  Typology: string;
  OrphanetURL: string;
  Date?: string;
  Prevalence: OrphadataPrevalence[];
}

export interface OrphadataHPOAssociation {
  HPO: {
    HPOId: string;
    HPOTerm: string;
  };
  HPOFrequency: string;
  DiagnosticCriteria?: string | null;
}

export interface OrphadataRawPhenotypes {
  Date?: string;
  Source?: string;
  ValidationDate?: string;
  ValidationStatus?: string;
  Online?: string;
  Disorder: {
    ORPHAcode: number;
    'Preferred term': string;
    DisorderGroup: string;
    Typology: string;
    OrphanetURL: string;
    HPODisorderAssociation: OrphadataHPOAssociation[];
  };
}

export interface OrphadataRawNaturalHistory {
  ORPHAcode: number;
  'Preferred term': string;
  DisorderGroup: string;
  Typology: string;
  OrphanetURL: string;
  Date?: string;
  AverageAgeOfOnset: string[];
  TypeOfInheritance: string[];
}

// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface OrphadataCrossRef {
  source: string;
  reference: string;
  mapping_relation: string;
  validated: boolean;
  icd_relation?: string;
}

export interface OrphadataDiseaseLookupOutput {
  orphacode: number;
  name: string;
  definition: string;
  disorder_group: string;
  typology: string;
  synonyms: string[];
  cross_references: OrphadataCrossRef[];
  orphanet_url: string;
  last_updated: string;
}

export interface OrphadataPrevalenceRecord {
  type: string;
  prevalence_class: string;
  geographic_area: string;
  qualification: string;
  mean_value: number | null;
  validation_status: string;
  sources: string[];
}

export interface OrphadataDiseaseEpidemiologyOutput {
  orphacode: number;
  name: string;
  prevalence_records: OrphadataPrevalenceRecord[];
  orphanet_url: string;
}

export interface OrphadataHPOTerm {
  hpo_id: string;
  hpo_term: string;
  frequency: string;
  is_diagnostic_criterion: boolean;
}

export interface OrphadataDiseasePhenotypesOutput {
  orphacode: number;
  name: string;
  hpo_terms: OrphadataHPOTerm[];
  validation_status: string;
  validated_date: string;
  source_pmids: string[];
}

export interface OrphadataDiseaseNaturalHistoryOutput {
  orphacode: number;
  name: string;
  inheritance_modes: string[];
  age_of_onset: string[];
  disorder_group: string;
  typology: string;
  orphanet_url: string;
}
