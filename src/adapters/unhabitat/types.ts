// ArcGIS Feature Service response types for UN-Habitat Urban Indicators Database.

export interface ArcGisFeature<T> {
  attributes: T;
}

export interface ArcGisResponse<T> {
  features: ArcGisFeature<T>[];
  exceededTransferLimit?: boolean;
}

// SDG 11.2.1 — Proportion of population with convenient access to public transport
export interface TransportAccessRecord {
  Indicator: string;
  Cities: string;
  Country: string;
  Region: string;
  Percentage_Value: number | null;
  Estimate_source: string;
  ObjectId: number;
}

// SDG 11.3.1 — Land consumption rate vs population growth rate
export interface LandConsumptionRecord {
  Cities: string;
  Country: string;
  Region: string;
  LCR_1990_to_2000: number | null;
  LCR_2000_to_2015: number | null;
  PGR_1990_to_2000: number | null;
  PGR_2000_to_2015: number | null;
  LCRPGR_1990_to_2000: number | null;
  LCRPGR_2000_to_2015: number | null;
  BUP_area_per_Capita_1990: number | null;
  BUP_area_per_Capita_2000: number | null;
  BUP_area_per_Capita_2015: number | null;
  Estimate_source: string;
  ObjectId: number;
}

// SDG 11.7.1 — Average share of built-up area that is open public space
export interface OpenSpacesRecord {
  Indicator_series: string;
  Indicator_Description: string;
  City: string;
  Country: string;
  Region: string;
  Estimate_Year: number | null;
  Urban_Share_in_OPS: number | null;
  Urban_Share_in_Streets: number | null;
  Urban_Share_in_OPS_and_Streets: number | null;
  Population_with_OPS_access: number | null;
  Estimate_Source: string;
  ObjectId: number;
}

// Global Municipal Database — city budget & expenditure
export interface CityBudgetRecord {
  City: string;
  NAME: string;
  COUNTRY: string;
  Region: string;
  Country_in: string;
  Year: string;
  Population: number | null;
  Total_Bu_2: number | null;
  PerCapBudg: number | null;
  Capital__1: number | null;
  PC_OwnSour: number | null;
  TotalOwnSo: number | null;
  Streets: number | null;
  Building: number | null;
  Sanitati_1: number | null;
  Solid_Wa_1: number | null;
  Water: number | null;
  Energy: number | null;
  Educatio_1: number | null;
  Health: number | null;
  PublicTran: number | null;
  ObjectId: number;
}
