/**
 * Raw response types for CMS Provider Data API (UC-561).
 *
 * Datasets used:
 *   xubh-q36u — Hospital General Information (5 432 hospitals)
 *   4pq5-n9py — Nursing Home Provider Information (14 695 facilities)
 *   6jpm-sxkc — Home Health Care Agencies (12 392 agencies)
 *   23ew-n7w9 — Dialysis Facility Listing (7 557 facilities)
 *
 * API: POST https://data.cms.gov/provider-data/api/1/datastore/query/{identifier}/0
 * Auth: None (US Government public domain, no rate limits documented).
 */

export interface CmsQueryResponse {
  results: Record<string, string | number | null>[];
  count: number;
  schema: Record<string, unknown>;
  query: {
    limit: number;
    offset: number;
    count: boolean;
    results: boolean;
    schema: boolean;
    keys: boolean;
    format: string;
    rowIds: boolean;
  };
}

export interface CmsHospital {
  facility_id: string;
  facility_name: string;
  address: string;
  citytown: string;
  state: string;
  zip_code: string;
  countyparish: string;
  telephone_number: string;
  hospital_type: string;
  hospital_ownership: string;
  emergency_services: string;
  hospital_overall_rating: string;
}

export interface CmsNursingHome {
  cms_certification_number_ccn: string;
  provider_name: string;
  provider_address: string;
  citytown: string;
  state: string;
  zip_code: string;
  telephone_number: string;
  ownership_type: string;
  number_of_certified_beds: string;
  overall_rating: string;
  health_inspection_rating: string;
  staffing_rating: string;
  quality_measure_rating: string;
}

export interface CmsHomeHealthAgency {
  cms_certification_number_ccn: string;
  provider_name: string;
  address: string;
  citytown: string;
  state: string;
  zip_code: string;
  telephone_number: string;
  type_of_ownership: string;
  offers_nursing_care_services: string;
  offers_physical_therapy_services: string;
  offers_occupational_therapy_services: string;
  quality_of_patient_care_star_rating: string;
}

export interface CmsDialysisFacility {
  cms_certification_number_ccn: string;
  facility_name: string;
  address_line_1: string;
  citytown: string;
  state: string;
  zip_code: string;
  telephone_number: string;
  profit_or_nonprofit: string;
  chain_owned: string;
  five_star: string;
}
