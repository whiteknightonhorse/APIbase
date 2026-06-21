/** ROR organization name entry */
export interface RorNameEntry {
  lang: string | null;
  types: string[];
  value: string;
}

/** ROR location / geonames details */
export interface RorGeonamesDetails {
  continent_code: string;
  continent_name: string;
  country_code: string;
  country_name: string;
  country_subdivision_code: string | null;
  country_subdivision_name: string | null;
  lat: number | null;
  lng: number | null;
  name: string;
}

export interface RorLocation {
  geonames_id: number;
  geonames_details: RorGeonamesDetails;
}

/** ROR link entry */
export interface RorLink {
  type: string;
  value: string;
}

/** ROR external identifier entry */
export interface RorExternalId {
  type: string;
  all: string[];
  preferred: string | null;
}

/** ROR relationship entry */
export interface RorRelationship {
  id: string;
  label: string;
  type: string;
}

/** ROR organization (v2 schema returned by /organizations endpoint) */
export interface RorOrganization {
  id: string;
  names: RorNameEntry[];
  types: string[];
  status: string;
  established: number | null;
  locations: RorLocation[];
  links: RorLink[];
  external_ids: RorExternalId[];
  relationships: RorRelationship[];
  domains: string[];
  admin?: Record<string, unknown>;
}

/** ROR search response (/organizations?query=) */
export interface RorSearchResponse {
  number_of_results: number;
  time_taken: number;
  items: RorOrganization[];
  meta: Record<string, unknown> | null;
}

/** ROR affiliation match item (/organizations?affiliation=) */
export interface RorAffiliationItem {
  substring: string;
  score: number;
  matching_type: string;
  chosen: boolean;
  organization: RorOrganization;
}

/** ROR affiliation response */
export interface RorAffiliationResponse {
  number_of_results: number;
  items: RorAffiliationItem[];
}

// ── Normalized output types ───────────────────────────────────────────────────

export interface RorOrgSummary {
  id: string;
  name: string;
  acronym: string | null;
  types: string[];
  status: string;
  established: number | null;
  country: string | null;
  country_code: string | null;
  city: string | null;
  website: string | null;
  wikipedia: string | null;
}

export interface RorSearchOutput {
  total: number;
  results: RorOrgSummary[];
}

export interface RorGetOutput extends RorOrgSummary {
  external_ids: Record<string, string | null>;
  relationships: { type: string; id: string; label: string }[];
  domains: string[];
  locations: {
    city: string;
    country: string;
    country_code: string;
    lat: number | null;
    lng: number | null;
  }[];
}

export interface RorFilterOutput {
  total: number;
  results: RorOrgSummary[];
}

export interface RorAffiliationOutput {
  total: number;
  results: {
    id: string;
    name: string;
    acronym: string | null;
    score: number;
    chosen: boolean;
    matching_type: string;
    types: string[];
    status: string;
    country: string | null;
    country_code: string | null;
    website: string | null;
  }[];
}
