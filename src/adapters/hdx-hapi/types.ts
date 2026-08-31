/** Raw row shapes returned by the HDX HAPI v2 endpoints (UC-648). */

interface HdxHapiEnvelope<T> {
  data: T[];
}

export interface HdxHapiOperationalPresenceRow {
  location_code: string;
  location_name: string;
  admin1_code: string | null;
  admin1_name: string | null;
  admin2_code: string | null;
  admin2_name: string | null;
  admin_level: number;
  org_acronym: string | null;
  org_name: string | null;
  org_type_description: string | null;
  sector_code: string | null;
  sector_name: string | null;
  reference_period_start: string;
  reference_period_end: string;
}
export type HdxHapiOperationalPresenceResponse = HdxHapiEnvelope<HdxHapiOperationalPresenceRow>;

export interface HdxHapiHumanitarianNeedsRow {
  location_code: string;
  location_name: string;
  admin1_code: string | null;
  admin1_name: string | null;
  admin2_code: string | null;
  admin2_name: string | null;
  admin_level: number;
  sector_code: string | null;
  sector_name: string | null;
  category: string | null;
  population_status: string;
  population: number;
  reference_period_start: string;
  reference_period_end: string;
}
export type HdxHapiHumanitarianNeedsResponse = HdxHapiEnvelope<HdxHapiHumanitarianNeedsRow>;

export interface HdxHapiBaselinePopulationRow {
  location_code: string;
  location_name: string;
  admin1_code: string | null;
  admin1_name: string | null;
  admin2_code: string | null;
  admin2_name: string | null;
  admin_level: number;
  gender: string | null;
  age_range: string | null;
  min_age: number | null;
  max_age: number | null;
  population: number;
  reference_period_start: string;
  reference_period_end: string;
}
export type HdxHapiBaselinePopulationResponse = HdxHapiEnvelope<HdxHapiBaselinePopulationRow>;

export interface HdxHapiFoodSecurityRow {
  location_code: string;
  location_name: string;
  admin1_code: string | null;
  admin1_name: string | null;
  admin2_code: string | null;
  admin2_name: string | null;
  admin_level: number;
  ipc_phase: string;
  ipc_type: string;
  population_in_phase: number;
  population_fraction_in_phase: number | null;
  reference_period_start: string;
  reference_period_end: string;
}
export type HdxHapiFoodSecurityResponse = HdxHapiEnvelope<HdxHapiFoodSecurityRow>;
