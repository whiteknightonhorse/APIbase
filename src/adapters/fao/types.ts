// SDMX-JSON response types for FAO FAOSTAT SDG API

export interface SdmxDimensionValue {
  id: string;
  name: string;
}

export interface SdmxDimension {
  id: string;
  name: string;
  keyPosition: number;
  values: SdmxDimensionValue[];
}

export interface SdmxStructure {
  name?: string;
  description?: string;
  dimensions: {
    dataset?: SdmxDimension[];
    series: SdmxDimension[];
    observation: SdmxDimension[];
  };
  attributes?: {
    series?: SdmxDimension[];
    observation?: SdmxDimension[];
  };
}

export interface SdmxSeriesData {
  attributes: (number | null)[];
  annotations?: number[];
  observations: Record<string, (string | number | null)[]>;
}

export interface SdmxDataSet {
  action?: string;
  series: Record<string, SdmxSeriesData>;
}

export interface SdmxJsonResponse {
  header?: Record<string, unknown>;
  dataSets: SdmxDataSet[];
  structure: SdmxStructure;
}

// Normalized output types

export interface FaoObservation {
  year: string;
  value: number | null;
  note?: string;
}

export interface FaoSeriesResult {
  indicator: string;
  indicator_code: string;
  unit: string;
  unit_code: string;
  area: string;
  area_code: string;
  observations: FaoObservation[];
}

export interface FaoFoodSecurityOutput {
  country: string;
  country_code: string;
  indicator: 'undernourishment';
  prevalence_pct: FaoObservation[];
  count_millions: FaoObservation[];
  source: string;
}

export interface FaoFoodInsecurityOutput {
  country: string;
  country_code: string;
  indicator: 'food_insecurity';
  moderate_or_severe_pct: FaoObservation[];
  moderate_or_severe_millions: FaoObservation[];
  severe_pct: FaoObservation[];
  source: string;
}

export interface FaoWaterStressOutput {
  country: string;
  country_code: string;
  indicator: 'water_stress';
  freshwater_withdrawal_pct: FaoObservation[];
  source: string;
}

export interface FaoForestAreaOutput {
  country: string;
  country_code: string;
  indicator: 'forest_area';
  forest_pct_of_land: FaoObservation[];
  forest_ha: FaoObservation[];
  source: string;
}

export interface FaoFoodLossEntry {
  area: string;
  area_code: string;
  product: string;
  product_code: string;
  loss_pct: FaoObservation[];
  loss_index: FaoObservation[];
}

export interface FaoFoodLossOutput {
  indicator: 'food_loss';
  year_range: string;
  results: FaoFoodLossEntry[];
  source: string;
}
