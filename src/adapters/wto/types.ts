/** Single entry from /indicators endpoint */
export interface WtoIndicator {
  code: string;
  name: string;
  categoryCode: string;
  categoryLabel: string;
  subcategoryCode: string;
  subcategoryLabel: string;
  unitCode: string;
  unitLabel: string;
  startYear: number;
  endYear: number;
  frequencyCode: string;
  frequencyLabel: string;
  numberReporters: number | null;
  numberPartners: number | null;
  hasMetadata: string;
  numberDecimals: number;
  numberDatapoints: number;
  updateFrequency: string | null;
  description: string | null;
  sortOrder: number;
}

/** Single entry from /reporters or /partners endpoint */
export interface WtoEconomy {
  code: string;
  iso3A: string | null;
  name: string;
  displayOrder: number;
}

/** Single entry from /topics endpoint */
export interface WtoTopic {
  id: number;
  name: string;
  sortOrder: number;
}

/** Single data record from /data endpoint Dataset array */
export interface WtoDataPoint {
  IndicatorCategoryCode: string;
  IndicatorCategory: string;
  IndicatorCode: string;
  Indicator: string;
  ReportingEconomyCode: string;
  ReportingEconomy: string;
  PartnerEconomyCode: string | null;
  PartnerEconomy: string | null;
  ProductOrSectorClassificationCode: string | null;
  ProductOrSectorClassification: string | null;
  ProductOrSectorCode: string | null;
  ProductOrSector: string | null;
  PeriodCode: string;
  Period: string;
  FrequencyCode: string;
  Frequency: string;
  UnitCode: string;
  Unit: string;
  Year: number;
  ValueFlagCode: string | null;
  ValueFlag: string | null;
  TextValue: string | null;
  Value: number | null;
}

/** Top-level /data response envelope */
export interface WtoDataResponse {
  Dataset: WtoDataPoint[];
}
