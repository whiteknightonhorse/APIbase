// EPA SDWIS (Safe Drinking Water Information System) — normalized output types (UC-508)

export interface WaterSystem {
  pwsid: string;
  name: string;
  state: string;
  type: string;
  activity: string;
  population_served: number | null;
  service_connections: number | null;
  source: string;
  owner_type: string;
  org_name: string | null;
  city: string | null;
  zip: string | null;
  epa_region: string;
}

export interface WaterSystemsOutput {
  total: number;
  results: WaterSystem[];
}

export interface DrinkingWaterViolation {
  pwsid: string;
  violation_id: string;
  state: string;
  population_served: number | null;
  violation_code: string;
  category: string;
  health_based: boolean;
  contaminant_code: string;
  compliance_status: string;
  measure: number | null;
  unit: string | null;
  major: boolean | null;
  period_begin: string | null;
  period_end: string | null;
  rtc_date: string | null;
  notification_tier: number | null;
  rule_code: string;
  rule_family: string;
}

export interface ViolationsOutput {
  total: number;
  results: DrinkingWaterViolation[];
}

export interface EnforcementAction {
  pwsid: string;
  enforcement_id: string;
  enforcement_date: string | null;
  action_type: string;
  originator: string;
  comment: string | null;
}

export interface EnforcementOutput {
  total: number;
  results: EnforcementAction[];
}

export interface ServiceArea {
  pwsid: string;
  state: string;
  epa_region: string;
  state_served: string | null;
  county_served: string | null;
  city_served: string | null;
  zip_served: string | null;
  area_type: string | null;
  tribal_code: string | null;
}

export interface ServiceAreasOutput {
  total: number;
  results: ServiceArea[];
}
