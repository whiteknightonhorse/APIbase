/**
 * MyChem.info API response types (UC-481).
 */

export interface MyChemQueryHit {
  _id: string;
  _score?: number;
  chebi?: {
    name?: string;
    definition?: string;
    inchi?: string;
    inchikey?: string;
    smiles?: string;
    formula?: string;
    mass?: number;
    iupac?: string;
    synonyms?: string | string[];
  };
  chembl?: {
    pref_name?: string;
    molecule_chembl_id?: string;
    molecule_type?: string;
    max_phase?: number;
    first_approval?: number;
    oral?: boolean;
    parenteral?: boolean;
    black_box_warning?: number;
    therapeutic_flag?: boolean;
    atc_classifications?: string[];
    molecule_properties?: {
      full_mwt?: number;
      alogp?: number;
      hbd?: number;
      hba?: number;
      psa?: number;
      rtb?: number;
      ro5_violations?: number;
    };
    indication_class?: string;
    usan_stem_definition?: string;
    withdrawn_flag?: boolean;
    withdrawn_reason?: string;
  };
  pubchem?: {
    cid?: number;
    inchi?: string;
    inchikey?: string;
    smiles?: {
      isomeric?: string;
      canonical?: string;
    };
    iupac?: {
      preferred?: string;
    };
    molecular_formula?: string;
    molecular_weight?: number;
    monoisotopic_weight?: number;
    xlogp?: number;
    h_bond_donor_count?: number;
    h_bond_acceptor_count?: number;
    rotatable_bond_count?: number;
    heavy_atom_count?: number;
    tpsa?: number;
    complexity?: number;
  };
  drugbank?: {
    name?: string;
    id?: string;
    description?: string;
    indication?: string;
    mechanism_of_action?: string;
    categories?: Array<{ category?: string; mesh_id?: string }>;
    groups?: string[];
    targets?: Array<{
      name?: string;
      gene_name?: string;
      actions?: string[];
      organism?: string;
    }>;
    atc_codes?: Array<{ code?: string; description?: string }>;
    synonyms?: string[];
  };
  pharmgkb?: {
    id?: string;
    name?: string;
    dosing_guideline?: boolean;
    clinical_annotation_count?: number;
  };
  notfound?: boolean;
}

export interface MyChemQueryResult {
  took?: number;
  total: number;
  max_score?: number;
  hits: MyChemQueryHit[];
}

export interface MyChemMetadata {
  biothing_type?: string;
  build_version?: string;
  build_date?: string;
  stats?: Record<string, number>;
  src?: Record<string, unknown>;
}
