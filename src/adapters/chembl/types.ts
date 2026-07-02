// Raw API response types from ChEMBL REST API (https://www.ebi.ac.uk/chembl/api/data/)

export interface ChemblMoleculeProperties {
  alogp: string | null;
  aromatic_rings: number | null;
  cx_logd: string | null;
  cx_logp: string | null;
  cx_most_apka: string | null;
  cx_most_bpka: string | null;
  full_molformula: string | null;
  full_mwt: string | null;
  hba: number | null;
  hba_lipinski: number | null;
  hbd: number | null;
  hbd_lipinski: number | null;
  heavy_atoms: number | null;
  mw_freebase: string | null;
  num_ro5_violations: number | null;
  psa: string | null;
  qed_weighted: string | null;
  ro3_pass: string | null;
  rtb: number | null;
}

export interface ChemblMoleculeStructures {
  canonical_smiles: string | null;
  molfile: string | null;
  standard_inchi: string | null;
  standard_inchi_key: string | null;
}

export interface ChemblMoleculeRaw {
  molecule_chembl_id: string;
  pref_name: string | null;
  max_phase: number | null;
  molecule_type: string | null;
  first_approval: number | null;
  oral: boolean;
  parenteral: boolean;
  topical: boolean;
  black_box_warning: number;
  withdrawn_flag: boolean;
  natural_product: number;
  molecule_properties: ChemblMoleculeProperties | null;
  molecule_structures: ChemblMoleculeStructures | null;
  atc_classifications: string[];
}

export interface ChemblMoleculeListRaw {
  molecules: ChemblMoleculeRaw[];
  page_meta: { total_count: number; limit: number; offset: number };
}

export interface ChemblTargetComponent {
  accession: string | null;
  component_description: string | null;
  component_id: number;
  component_type: string;
  relationship: string;
  target_component_synonyms: Array<{ component_synonym: string; syn_type: string }>;
}

export interface ChemblTargetRaw {
  target_chembl_id: string;
  pref_name: string;
  target_type: string;
  organism: string | null;
  tax_id: number | null;
  species_group_flag: boolean;
  target_components: ChemblTargetComponent[];
}

export interface ChemblTargetListRaw {
  targets: ChemblTargetRaw[];
  page_meta: { total_count: number; limit: number; offset: number };
}

export interface ChemblActivityRaw {
  activity_id: number;
  assay_chembl_id: string;
  molecule_chembl_id: string;
  target_chembl_id: string | null;
  standard_type: string | null;
  standard_value: string | null;
  standard_units: string | null;
  standard_relation: string | null;
  activity_comment: string | null;
  pchembl_value: string | null;
  assay_description: string | null;
  document_chembl_id: string | null;
  src_id: number | null;
}

export interface ChemblActivityListRaw {
  activities: ChemblActivityRaw[];
  page_meta: { total_count: number; limit: number; offset: number };
}

// Normalized output shapes

export interface MoleculeItem {
  chembl_id: string;
  name: string | null;
  max_phase: number | null;
  molecule_type: string | null;
  first_approval: number | null;
  molecular_formula: string | null;
  molecular_weight: number | null;
  alogp: number | null;
  hbd: number | null;
  hba: number | null;
  psa: number | null;
  ro5_violations: number | null;
  smiles: string | null;
  inchi_key: string | null;
  oral: boolean;
  withdrawn: boolean;
  atc_codes: string[];
}

export interface MoleculeSearchOutput {
  total: number;
  returned: number;
  molecules: MoleculeItem[];
}

export interface MoleculeDetailOutput extends MoleculeItem {
  inchi: string | null;
  qed: number | null;
  natural_product: boolean;
  black_box_warning: boolean;
}

export interface TargetItem {
  chembl_id: string;
  name: string;
  target_type: string;
  organism: string | null;
  component_count: number;
  gene_names: string[];
  accessions: string[];
}

export interface TargetSearchOutput {
  total: number;
  returned: number;
  targets: TargetItem[];
}

export interface ActivityItem {
  activity_id: number;
  molecule_chembl_id: string;
  target_chembl_id: string | null;
  assay_chembl_id: string;
  activity_type: string | null;
  value: number | null;
  units: string | null;
  relation: string | null;
  pchembl_value: number | null;
  activity_comment: string | null;
  assay_description: string | null;
  document_chembl_id: string | null;
}

export interface BioactivityOutput {
  total: number;
  returned: number;
  activities: ActivityItem[];
}
