// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface DisasterDeclaration {
  disaster_number: number;
  title: string;
  state: string;
  declaration_type: string;
  incident_type: string;
  declaration_date: string;
  incident_begin: string;
  incident_end: string;
  designated_areas: string;
  ih_program: boolean;
  ia_program: boolean;
  pa_program: boolean;
  hm_program: boolean;
}

export interface FemaDisastersOutput {
  total: number;
  results: DisasterDeclaration[];
}

export interface FloodClaim {
  state: string;
  county_code: string;
  year_of_loss: number;
  flood_zone: string;
  building_payment: number | null;
  contents_payment: number | null;
  building_coverage: number | null;
  contents_coverage: number | null;
  cause_of_damage: string;
  occupancy_type: number;
}

export interface FemaFloodClaimsOutput {
  total: number;
  results: FloodClaim[];
}

export interface HousingAssistance {
  disaster_number: number;
  state: string;
  county: string;
  city: string;
  valid_registrations: number;
  avg_damage: number;
  total_inspected: number;
  total_damage: number;
  total_approved: number;
}

export interface FemaAssistanceOutput {
  total: number;
  results: HousingAssistance[];
}
