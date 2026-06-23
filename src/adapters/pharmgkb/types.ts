// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface PharmGkbGeneResult {
  id: string;
  symbol: string;
  name: string;
  chromosome: string | null;
  chr_start_b38: number | null;
  chr_stop_b38: number | null;
  strand: string | null;
  cpic_gene: boolean;
  amp: boolean;
  allele_type: string | null;
  vip_tier: string | null;
  vip_summary: string | null;
  alt_symbols: string[];
}

export interface PharmGkbDrugResult {
  id: string;
  name: string;
  types: string[];
  smiles: string | null;
  inchi: string | null;
  trade_names: string[];
  generic_names: string[];
  atc_code: string | null;
  chebi_id: string | null;
  drugbank_id: string | null;
  pediatric: boolean;
}

export interface PharmGkbVariantResult {
  id: string;
  symbol: string;
  name: string;
  change_classification: string | null;
  clinical_significance: string | null;
  variant_type: string | null;
  rare: boolean;
  rarity_source: string | null;
  chromosome: string | null;
  position_b38: number | null;
  genes: string[];
  clinvar_ids: string[];
}

export interface PharmGkbDrugLabelResult {
  id: string;
  name: string;
  source: string;
  dosing_information: boolean;
  alternate_drug_available: boolean;
  cancer_genome: boolean;
  biomarker_status: string | null;
  pediatric: boolean;
  has_testing_info: boolean;
  updated: string | null;
}
