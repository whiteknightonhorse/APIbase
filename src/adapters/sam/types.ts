// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface SamEntityResult {
  uei: string;
  cage_code: string;
  legal_name: string;
  dba_name: string;
  registration_status: string;
  expiration_date: string;
  physical_address: string;
  state: string;
  country: string;
  naics_codes: string[];
  business_types: string[];
  entity_structure: string;
  sam_registered: boolean;
}

export interface SamEntitySearchOutput {
  total: number;
  results: SamEntityResult[];
}

export interface SamEntityDetailOutput {
  uei: string;
  cage_code: string;
  legal_name: string;
  dba_name: string;
  registration_status: string;
  activation_date: string;
  expiration_date: string;
  physical_address: string;
  mailing_address: string;
  state: string;
  country: string;
  congressional_district: string;
  naics_codes: { code: string; primary: boolean }[];
  psc_codes: string[];
  business_types: string[];
  entity_structure: string;
  organization_structure: string;
  entity_url: string;
}
