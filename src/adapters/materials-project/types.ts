/**
 * Materials Project types (UC-222).
 * DOE/Lawrence Berkeley Lab — 150K+ inorganic materials with DFT-computed properties.
 */

export interface MaterialsSummary {
  material_id: string;
  formula_pretty: string;
  band_gap: number | null;
  formation_energy_per_atom: number | null;
  energy_above_hull: number | null;
  is_stable: boolean | null;
  density: number | null;
  volume: number | null;
  nsites: number | null;
  is_metal: boolean | null;
  is_magnetic: boolean | null;
  is_gap_direct: boolean | null;
  cbm: number | null;
  vbm: number | null;
  efermi: number | null;
  symmetry: {
    symbol: string;
    number: number;
    crystal_system: string;
  } | null;
  elements: string[];
  nelements: number | null;
  theoretical: boolean | null;
  total_magnetization: number | null;
  ordering: string | null;
  bulk_modulus: { vrh: number | null } | null;
  shear_modulus: { vrh: number | null } | null;
  homogeneous_poisson: number | null;
  database_IDs: Record<string, string[]> | null;
}

export interface MaterialsElasticity {
  material_id: string;
  bulk_modulus: { vrh: number; voigt: number; reuss: number } | null;
  shear_modulus: { vrh: number; voigt: number; reuss: number } | null;
  universal_anisotropy: number | null;
  homogeneous_poisson: number | null;
  elastic_tensor: { ieee_format: number[][] } | null;
}

export interface MaterialsApiResponse<T> {
  data: T[];
  meta: {
    api_version: string;
    time_stamp: string;
    total_doc: number;
    max_limit: number;
  };
}

// Normalized outputs

export interface MaterialsSearchResult {
  materials: Array<{
    material_id: string;
    formula: string;
    band_gap_ev: number | null;
    formation_energy_ev: number | null;
    energy_above_hull_ev: number | null;
    is_stable: boolean | null;
    density_g_cm3: number | null;
    crystal_system: string | null;
    spacegroup: string | null;
    is_metal: boolean | null;
    is_magnetic: boolean | null;
    elements: string[];
  }>;
  total: number;
}

export interface MaterialsDetailsResult {
  material_id: string;
  formula: string;
  elements: string[];
  crystal_system: string | null;
  spacegroup: string | null;
  spacegroup_number: number | null;
  nsites: number | null;
  volume_ang3: number | null;
  density_g_cm3: number | null;
  band_gap_ev: number | null;
  is_gap_direct: boolean | null;
  cbm_ev: number | null;
  vbm_ev: number | null;
  fermi_energy_ev: number | null;
  is_metal: boolean | null;
  formation_energy_ev: number | null;
  energy_above_hull_ev: number | null;
  is_stable: boolean | null;
  is_magnetic: boolean | null;
  total_magnetization: number | null;
  magnetic_ordering: string | null;
  bulk_modulus_gpa: number | null;
  shear_modulus_gpa: number | null;
  poisson_ratio: number | null;
  theoretical: boolean | null;
  database_ids: Record<string, string[]> | null;
}

export interface MaterialsElasticityResult {
  material_id: string;
  bulk_modulus: { vrh: number; voigt: number; reuss: number } | null;
  shear_modulus: { vrh: number; voigt: number; reuss: number } | null;
  universal_anisotropy: number | null;
  poisson_ratio: number | null;
  elastic_tensor_ieee: number[][] | null;
}
