/** Macrostrat API v2 raw response types (UC-643). */

export interface MacrostratEnvelope<T> {
  success: {
    v: number;
    license: string;
    data: T;
  };
}

export interface MacrostratColumn {
  col_id: number;
  col_name: string;
  col_group?: string;
  col_group_id?: number;
  group_col_id?: string;
  lat: string;
  lng: string;
  col_area: number | string;
  max_thick?: string;
  t_units?: string;
  project_id: number;
  status_code?: string;
  notes?: string | null;
  refs?: number[];
}

export interface MacrostratLithEntry {
  lith_id: number;
  name: string;
  type: string;
  class: string;
  prop?: number;
  atts?: string[];
}

export interface MacrostratEnvironEntry {
  environ_id: number;
  name: string;
  type: string;
  class: string;
}

export interface MacrostratUnit {
  unit_id: number;
  section_id: number;
  col_id: number;
  project_id: number;
  unit_name: string;
  strat_name_id?: number;
  Mbr?: string;
  Fm?: string;
  Gp?: string;
  SGp?: string;
  t_age: number;
  b_age: number;
  max_thick: number;
  min_thick: number;
  outcrop?: string;
  pbdb_collections: number;
  pbdb_occurrences: number;
  lith?: MacrostratLithEntry[];
  environ?: MacrostratEnvironEntry[];
  color?: string;
  t_int_name?: string;
  b_int_name?: string;
  notes?: string;
}

export interface MacrostratMapUnit {
  map_id: number;
  source_id: number;
  name: string;
  strat_name?: string;
  lith?: string;
  descrip?: string;
  comments?: string;
  macro_units?: number[];
  strat_names?: number[];
  liths?: number[];
  t_int_id?: number;
  t_int_age?: number;
  t_int_name?: string;
  b_int_id?: number;
  b_int_age?: number;
  b_int_name?: string;
  color?: string;
  t_age?: number;
  b_age?: number;
  best_int_name?: string | null;
}

export interface MacrostratFossilCollection {
  cltn_id: number;
  cltn_name: string;
  t_age: number;
  b_age: number;
  pbdb_occs: number;
  genus_no?: number[];
  taxon_no?: string;
  unit_id: number;
  col_id: number;
  refs?: number[];
  strat_name_concept_id?: number;
}
