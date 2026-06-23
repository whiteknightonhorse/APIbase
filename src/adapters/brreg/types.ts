// ---------------------------------------------------------------------------
// Raw Brreg API response types (JSON HAL)
// ---------------------------------------------------------------------------

export interface BrregAddress {
  land?: string;
  landkode?: string;
  postnummer?: string;
  poststed?: string;
  adresse?: string[];
  kommune?: string;
  kommunenummer?: string;
}

export interface BrregOrgForm {
  kode: string;
  beskrivelse: string;
}

export interface BrregNaeringskode {
  kode: string;
  beskrivelse: string;
}

export interface BrregRawEntity {
  organisasjonsnummer: string;
  navn: string;
  organisasjonsform?: BrregOrgForm;
  hjemmeside?: string;
  postadresse?: BrregAddress;
  forretningsadresse?: BrregAddress;
  registreringsdatoEnhetsregisteret?: string;
  registrertIMvaregisteret?: boolean;
  naeringskode1?: BrregNaeringskode;
  naeringskode2?: BrregNaeringskode;
  naeringskode3?: BrregNaeringskode;
  antallAnsatte?: number;
  harRegistrertAntallAnsatte?: boolean;
  overordnetEnhet?: string;
  konkurs?: boolean;
  underAvvikling?: boolean;
  underTvangsavviklingEllerTvangsopplosning?: boolean;
  maalform?: string;
  telefon?: string;
  mobil?: string;
  epostadresse?: string;
  sisteInnsendteAarsregnskap?: string;
  stiftelsesdato?: string;
  registreringsdatoAntallAnsatteEnhetsregisteret?: string;
}

export interface BrregRawSubUnit {
  organisasjonsnummer: string;
  navn: string;
  organisasjonsform?: BrregOrgForm;
  overordnetEnhet?: string;
  postadresse?: BrregAddress;
  forretningsadresse?: BrregAddress;
  registreringsdatoEnhetsregisteret?: string;
  naeringskode1?: BrregNaeringskode;
  antallAnsatte?: number;
}

export interface BrregRawPerson {
  fodselsdato?: string;
  navn?: {
    fornavn?: string;
    etternavn?: string;
  };
  erDoed?: boolean;
}

export interface BrregRawRole {
  type: {
    kode: string;
    beskrivelse: string;
  };
  person?: BrregRawPerson;
  enhet?: {
    organisasjonsnummer?: string;
    navn?: string;
  };
  avregistrert?: boolean;
  rekkefolge?: number;
}

export interface BrregRawRoleGroup {
  type: {
    kode: string;
    beskrivelse: string;
  };
  sistEndret?: string;
  roller: BrregRawRole[];
}

// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface BrregEntityResult {
  org_number: string;
  name: string;
  org_form: string;
  org_form_description: string;
  website: string | null;
  phone: string | null;
  email: string | null;
  employees: number | null;
  registered: string | null;
  founded: string | null;
  vat_registered: boolean;
  bankrupt: boolean;
  winding_up: boolean;
  nace_code: string | null;
  nace_description: string | null;
  municipality: string | null;
  post_address: string | null;
  business_address: string | null;
  last_annual_report: string | null;
  parent_org_number: string | null;
}

export interface BrregSearchOutput {
  total: number;
  page: number;
  results: BrregEntityResult[];
}

export interface BrregSubUnit {
  org_number: string;
  name: string;
  org_form: string;
  registered: string | null;
  nace_code: string | null;
  nace_description: string | null;
  municipality: string | null;
  employees: number | null;
}

export interface BrregSubUnitsOutput {
  parent_org_number: string;
  total: number;
  results: BrregSubUnit[];
}

export interface BrregRolePerson {
  birth_year: string | null;
  first_name: string | null;
  last_name: string | null;
  deceased: boolean;
}

export interface BrregRoleEntry {
  role_type_code: string;
  role_type_description: string;
  person: BrregRolePerson | null;
  entity_org_number: string | null;
  entity_name: string | null;
  active: boolean;
}

export interface BrregRoleGroup {
  group_code: string;
  group_description: string;
  last_changed: string | null;
  roles: BrregRoleEntry[];
}

export interface BrregRolesOutput {
  org_number: string;
  role_groups: BrregRoleGroup[];
}
