// UNHCR Population API — response types (UC-511)

export interface UnhcrPopulationItem {
  year: number;
  coo_id: number | string;
  coo_name: string;
  coo: string;
  coo_iso: string;
  coa_id: number | string;
  coa_name: string;
  coa: string;
  coa_iso: string;
  refugees: number | string;
  asylum_seekers: number | string;
  returned_refugees: number | string;
  idps: number | string;
  returned_idps: number | string;
  stateless: number | string;
  ooc: number | string;
  oip: number | string | string;
  hst: number | string;
}

export interface UnhcrSolutionsItem {
  year: number;
  coo_id: number | string;
  coo_name: string;
  coo: string;
  coo_iso: string;
  coa_id: number | string;
  coa_name: string;
  coa: string;
  coa_iso: string;
  returned_refugees: number | string;
  resettlement: number | string;
  naturalisation: number | string;
  returned_idps: number | string;
}

export interface UnhcrAsylumApplicationItem {
  year: number;
  coo_id: number | string;
  coo_name: string;
  coo: string;
  coo_iso: string;
  coa_id: number | string;
  coa_name: string;
  coa: string;
  coa_iso: string;
  procedure_type: string;
  app_type: string;
  dec_level: string;
  app_pc: string;
  applied: number | string;
}

export interface UnhcrAsylumDecisionItem {
  year: number;
  coo_id: number | string;
  coo_name: string;
  coo: string;
  coo_iso: string;
  coa_id: number | string;
  coa_name: string;
  coa: string;
  coa_iso: string;
  procedure_type: string;
  dec_level: string;
  dec_pc: string;
  dec_recognized: number | string;
  dec_other: number | string;
  dec_rejected: number | string;
  dec_closed: number | string;
  dec_total: number | string;
}

export interface UnhcrApiResponse<T> {
  page: number;
  maxPages: number;
  total: Record<string, number> | unknown[];
  items: T[];
}
