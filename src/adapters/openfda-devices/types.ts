/** OpenFDA device endpoint shared meta block */
export interface OpenFdaMeta {
  disclaimer: string;
  terms: string;
  license: string;
  last_updated: string;
  results: { skip: number; limit: number; total: number };
}

/** Embedded openfda object present in many device records */
export interface OpenFdaInner {
  device_name?: string;
  medical_specialty_description?: string;
  regulation_number?: string;
  device_class?: string;
  registration_number?: string[];
  fei_number?: string[];
}

// ─── Device Recall ─────────────────────────────────────────────────────────

export interface DeviceRecallRecord {
  cfres_id?: string;
  product_res_number?: string;
  event_date_initiated?: string;
  event_date_posted?: string;
  recall_status?: string;
  event_date_terminated?: string;
  res_event_number?: string;
  product_code?: string;
  k_numbers?: string[];
  product_description?: string;
  code_info?: string;
  firm_fei_number?: string;
  recalling_firm?: string;
  address_1?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  additional_info_contact?: string;
  reason_for_recall?: string;
  root_cause_description?: string;
  action?: string;
  product_quantity?: string;
  distribution_pattern?: string;
  openfda?: OpenFdaInner;
}

export interface DeviceRecallResponse {
  meta: OpenFdaMeta;
  results: DeviceRecallRecord[];
}

// ─── 510(k) Clearance ──────────────────────────────────────────────────────

export interface Device510kRecord {
  k_number?: string;
  device_name?: string;
  applicant?: string;
  decision_code?: string;
  decision_description?: string;
  decision_date?: string;
  date_received?: string;
  product_code?: string;
  advisory_committee?: string;
  advisory_committee_description?: string;
  clearance_type?: string;
  third_party_flag?: string;
  expedited_review_flag?: string;
  city?: string;
  state?: string;
  country_code?: string;
  address_1?: string;
  address_2?: string;
  postal_code?: string;
  zip_code?: string;
  contact?: string;
  statement_or_summary?: string;
  review_advisory_committee?: string;
  openfda?: OpenFdaInner;
}

export interface Device510kResponse {
  meta: OpenFdaMeta;
  results: Device510kRecord[];
}

// ─── Adverse Events (MAUDE) ────────────────────────────────────────────────

export interface DeviceEventDevice {
  brand_name?: string;
  generic_name?: string;
  manufacturer_name?: string;
  model_number?: string;
  device_class?: string;
  device_availability?: string;
  device_event_key?: string;
  implant_flag?: string;
  expiration_date_of_device?: string;
  openfda?: OpenFdaInner;
}

export interface DeviceEventRecord {
  report_number?: string;
  event_type?: string;
  date_received?: string;
  date_of_event?: string;
  event_location?: string;
  device?: DeviceEventDevice[];
  mdr_report_key?: string;
  type_of_report?: string[];
  source_type?: string[];
  remedial_action?: string[];
  report_to_fda?: string;
  health_professional?: string;
  initial_report_to_fda?: string;
  reporter_occupation_code?: string;
  manufacturer_contact_zip_ext?: string;
}

export interface DeviceEventResponse {
  meta: OpenFdaMeta;
  results: DeviceEventRecord[];
}

// ─── Device Classification ─────────────────────────────────────────────────

export interface DeviceClassificationRecord {
  product_code?: string;
  device_name?: string;
  device_class?: string;
  regulation_number?: string;
  medical_specialty?: string;
  medical_specialty_description?: string;
  review_panel?: string;
  definition?: string;
  submission_type_id?: string;
  life_sustain_support_flag?: string;
  implant_flag?: string;
  third_party_flag?: string;
  gmp_exempt_flag?: string;
  review_code?: string;
  unclassified_reason?: string;
  summary_malfunction_reporting?: string;
  openfda?: OpenFdaInner;
}

export interface DeviceClassificationResponse {
  meta: OpenFdaMeta;
  results: DeviceClassificationRecord[];
}
