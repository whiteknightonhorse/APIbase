// EPA ECHO (Enforcement and Compliance History Online) response types (UC-577)

export interface EchoFacility {
  registry_id: string;
  facility_name: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
  sic_code: string;
  sic_desc: string;
  naics_code: string;
  programs: {
    caa: boolean;
    cwa: boolean;
    rcra: boolean;
    sdwa: boolean;
    tri: boolean;
    ghg: boolean;
  };
  penalties_total: string;
  inspections_count: number;
  date_last_inspection: string;
  formal_actions: number;
  informal_actions: number;
}

export interface EchoFacilitySearchOutput {
  total: number;
  results: EchoFacility[];
}

export interface EchoEnvInterest {
  interest_type: string;
  system: string;
  alt_id: string;
  active_status: string;
  federal_ind: string;
}

export interface EchoFacilityDetailOutput {
  registry_id: string;
  facility_name: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  county: string;
  latitude: number | null;
  longitude: number | null;
  sic_code: string;
  naics_code: string;
  huc_code: string;
  federal_facility: boolean;
  created_date: string;
  terminated_date: string;
  env_interests: EchoEnvInterest[];
}

export interface EchoAirFacility {
  registry_id: string;
  facility_name: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  latitude: number | null;
  longitude: number | null;
  permit_types: string;
  permit_status: string;
  quarters_noncompliance: string;
  inspections: string;
  high_priority_violations: string;
}

export interface EchoAirFacilitiesOutput {
  total: number;
  results: EchoAirFacility[];
}

export interface EchoEnforcementAction {
  activity_id: string;
  activity_type: string;
  action_type: string;
  action_subtype: string;
  settlement_date: string;
  federal_penalty: string;
  state_penalty: string;
  sep_amount: string;
  program_codes: string;
  compliance_schedule_required: boolean;
}

export interface EchoViolationsOutput {
  registry_id: string;
  total_actions: number;
  results: EchoEnforcementAction[];
}
