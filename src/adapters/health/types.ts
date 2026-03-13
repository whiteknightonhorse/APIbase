/**
 * Health & Nutrition API response types (UC-011).
 *
 * Three upstream providers:
 * - USDA FoodData Central (api.nal.usda.gov/fdc/v1)
 * - OpenFDA (api.fda.gov)
 * - NIH DSLD (api.ods.od.nih.gov/dsld/v9)
 */

// ---------------------------------------------------------------------------
// USDA FoodData Central
// ---------------------------------------------------------------------------

export interface UsdaFoodNutrient {
  nutrientId: number;
  nutrientName: string;
  nutrientNumber: string;
  unitName: string;
  value: number;
  derivationCode?: string;
  derivationDescription?: string;
}

export interface UsdaFoodSearchItem {
  fdcId: number;
  description: string;
  dataType: string;
  brandOwner?: string;
  brandName?: string;
  ingredients?: string;
  foodNutrients: UsdaFoodNutrient[];
  publishedDate?: string;
  score?: number;
}

export interface UsdaFoodSearchResponse {
  totalHits: number;
  currentPage: number;
  totalPages: number;
  foods: UsdaFoodSearchItem[];
}

export interface UsdaFoodDetailsResponse {
  fdcId: number;
  description: string;
  dataType: string;
  brandOwner?: string;
  brandName?: string;
  ingredients?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  foodNutrients: UsdaFoodNutrient[];
  foodPortions?: Array<{
    id: number;
    amount: number;
    gramWeight: number;
    measureUnit: { name: string; abbreviation: string };
    modifier?: string;
  }>;
  publishedDate?: string;
  foodCategory?: { description: string };
  labelNutrients?: Record<string, { value: number }>;
}

// ---------------------------------------------------------------------------
// OpenFDA
// ---------------------------------------------------------------------------

export interface OpenFdaMeta {
  disclaimer: string;
  terms: string;
  license: string;
  last_updated: string;
  results: {
    skip: number;
    limit: number;
    total: number;
  };
}

export interface OpenFdaDrugEvent {
  safetyreportid: string;
  receivedate: string;
  receiptdate?: string;
  serious: string;
  seriousnessdeath?: string;
  patient: {
    patientsex?: string;
    patientonsetage?: string;
    patientonsetageunit?: string;
    reaction?: Array<{ reactionmeddrapt: string; reactionoutcome?: string }>;
    drug?: Array<{
      medicinalproduct: string;
      drugindication?: string;
      drugcharacterization?: string;
      openfda?: Record<string, unknown>;
    }>;
  };
  [key: string]: unknown;
}

export interface OpenFdaDrugEventsResponse {
  meta: OpenFdaMeta;
  results: OpenFdaDrugEvent[];
}

export interface OpenFdaFoodRecall {
  recall_number: string;
  reason_for_recall: string;
  status: string;
  distribution_pattern: string;
  product_description: string;
  recalling_firm: string;
  city: string;
  state: string;
  country: string;
  voluntary_mandated: string;
  classification: string;
  report_date: string;
  recall_initiation_date: string;
  [key: string]: unknown;
}

export interface OpenFdaFoodRecallsResponse {
  meta: OpenFdaMeta;
  results: OpenFdaFoodRecall[];
}

export interface OpenFdaDrugLabel {
  id: string;
  effective_time?: string;
  openfda?: {
    brand_name?: string[];
    generic_name?: string[];
    manufacturer_name?: string[];
    route?: string[];
    substance_name?: string[];
    product_type?: string[];
  };
  indications_and_usage?: string[];
  dosage_and_administration?: string[];
  warnings?: string[];
  adverse_reactions?: string[];
  drug_interactions?: string[];
  contraindications?: string[];
  [key: string]: unknown;
}

export interface OpenFdaDrugLabelsResponse {
  meta: OpenFdaMeta;
  results: OpenFdaDrugLabel[];
}

// ---------------------------------------------------------------------------
// NIH DSLD (Dietary Supplement Label Database)
// ---------------------------------------------------------------------------

export interface DsldSupplementSearchItem {
  dsld_id: number;
  product_name: string;
  brand_name?: string;
  net_contents?: string;
  net_content_unit?: string;
  serving_size?: string;
  product_type?: string;
  date_entered?: string;
}

export interface DsldSupplementSearchResponse {
  total: number;
  data: DsldSupplementSearchItem[];
}

export interface DsldSupplementIngredient {
  ingredient_name: string;
  amount_per_serving?: string;
  unit?: string;
  daily_value_percent?: string;
}

export interface DsldSupplementDetails {
  dsld_id: number;
  product_name: string;
  brand_name?: string;
  net_contents?: string;
  net_content_unit?: string;
  serving_size?: string;
  servings_per_container?: string;
  product_type?: string;
  target_groups?: string[];
  ingredients: DsldSupplementIngredient[];
  other_ingredients?: string;
  date_entered?: string;
  [key: string]: unknown;
}
