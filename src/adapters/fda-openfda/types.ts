/** OpenFDA shared meta block (same shape across all openFDA endpoints) */
export interface OpenFdaMeta {
  disclaimer: string;
  terms: string;
  license: string;
  last_updated: string;
  results: { skip: number; limit: number; total: number };
}

// ─── Drug Enforcement (Recalls) ─────────────────────────────────────────────

export interface DrugEnforcementOpenFdaInner {
  application_number?: string[];
  brand_name?: string[];
  generic_name?: string[];
  manufacturer_name?: string[];
  product_ndc?: string[];
  product_type?: string[];
  route?: string[];
  substance_name?: string[];
  rxcui?: string[];
  pharm_class_epc?: string[];
}

export interface DrugEnforcementRecord {
  recall_number?: string;
  reason_for_recall?: string;
  status?: string;
  distribution_pattern?: string;
  product_quantity?: string;
  recall_initiation_date?: string;
  state?: string;
  event_id?: string;
  product_type?: string;
  product_description?: string;
  country?: string;
  city?: string;
  recalling_firm?: string;
  report_date?: string;
  classification?: string;
  code_info?: string;
  initial_firm_notification?: string;
  voluntary_mandated?: string;
  openfda?: DrugEnforcementOpenFdaInner;
}

export interface DrugEnforcementResponse {
  meta: OpenFdaMeta;
  results: DrugEnforcementRecord[];
}

// ─── NDC Directory ───────────────────────────────────────────────────────────

export interface NdcActiveIngredient {
  name?: string;
  strength?: string;
}

export interface NdcPackaging {
  package_ndc?: string;
  description?: string;
  marketing_start_date?: string;
  sample?: boolean;
}

export interface NdcRecord {
  product_ndc?: string;
  generic_name?: string;
  labeler_name?: string;
  brand_name?: string;
  active_ingredients?: NdcActiveIngredient[];
  finished?: boolean;
  packaging?: NdcPackaging[];
  listing_expiration_date?: string;
  marketing_category?: string;
  dosage_form?: string;
  product_type?: string;
  route?: string[];
  marketing_start_date?: string;
  application_number?: string;
  pharm_class?: string[];
  dea_schedule?: string;
}

export interface NdcResponse {
  meta: OpenFdaMeta;
  results: NdcRecord[];
}

// ─── Food Adverse Events (CAERS) ────────────────────────────────────────────

export interface FoodEventProduct {
  name_brand?: string;
  industry_code?: string;
  industry_name?: string;
  role?: string;
}

export interface FoodEventReaction {
  reactions?: string[];
}

export interface FoodEventRecord {
  report_number?: string;
  date_created?: string;
  date_started?: string;
  outcomes?: string[];
  reactions?: string[];
  products?: FoodEventProduct[];
  consumer?: { age?: string; age_unit?: string; gender?: string };
}

export interface FoodEventResponse {
  meta: OpenFdaMeta;
  results: FoodEventRecord[];
}
