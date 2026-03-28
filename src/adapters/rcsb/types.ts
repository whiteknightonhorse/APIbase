/**
 * RCSB Protein Data Bank response types (UC-218).
 */

export interface RcsbSearchResult {
  query_id: string;
  result_type: string;
  total_count: number;
  result_set: Array<{
    identifier: string;
    score: number;
    services?: Array<{ nodes: Array<{ match_context?: unknown }> }>;
  }>;
}

export interface RcsbEntryResponse {
  rcsb_id: string;
  struct: {
    title: string;
    pdbx_descriptor?: string;
  };
  exptl: Array<{
    method: string;
    crystals_number?: number;
  }>;
  rcsb_entry_info: {
    resolution_combined?: number[];
    deposited_polymer_entity_instance_count?: number;
    deposited_nonpolymer_entity_instance_count?: number;
    molecular_weight?: number;
    polymer_entity_count_protein?: number;
    polymer_entity_count_DNA?: number;
    polymer_entity_count_RNA?: number;
    assembly_count?: number;
    software_programs_combined?: string[];
  };
  rcsb_accession_info: {
    deposit_date: string;
    initial_release_date: string;
    revision_date?: string;
  };
  rcsb_primary_citation?: {
    title?: string;
    pdbx_database_id_PubMed?: number;
    pdbx_database_id_DOI?: string;
    journal_abbrev?: string;
    year?: number;
    rcsb_authors?: string[];
  };
  cell?: {
    length_a?: number;
    length_b?: number;
    length_c?: number;
    angle_alpha?: number;
    angle_beta?: number;
    angle_gamma?: number;
  };
}

export interface RcsbChemCompResponse {
  rcsb_id: string;
  chem_comp: {
    id: string;
    name: string;
    formula: string;
    formula_weight: number;
    type: string;
    pdbx_formal_charge?: number;
  };
  rcsb_chem_comp_descriptor?: Record<string, unknown>;
  rcsb_chem_comp_info?: {
    atom_count_heavy?: number;
    bond_count?: number;
    initial_release_date?: string;
  };
}
