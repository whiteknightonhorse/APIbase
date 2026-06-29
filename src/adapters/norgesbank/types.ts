// Raw SDMX-JSON response types for Norges Bank API (UC-525)

export interface SdmxDimensionValue {
  id: string;
  name: string | Record<string, string>;
}

export interface SdmxDimension {
  id: string;
  values: SdmxDimensionValue[];
}

export interface SdmxStructure {
  dimensions: {
    series?: SdmxDimension[];
    observation?: SdmxDimension[];
  };
}

export interface SdmxSeries {
  observations: Record<string, [number, ...unknown[]]>;
}

export interface SdmxDataSet {
  series: Record<string, SdmxSeries>;
}

export interface SdmxJsonResponse {
  data: {
    structure: SdmxStructure;
    dataSets: SdmxDataSet[];
  };
}

export interface NorgesBankFxRate {
  currency: string;
  rate: number;
  unit: string;
}

export interface NorgesBankFxLatestResult {
  base: string;
  date: string;
  rates: NorgesBankFxRate[];
}

export interface NorgesBankFxHistoryPoint {
  date: string;
  rate: number;
}

export interface NorgesBankFxHistoryResult {
  currency: string;
  base: string;
  series: NorgesBankFxHistoryPoint[];
}

export interface NorgesBankInterestRate {
  type: string;
  type_label: string;
  frequency: string;
  rate: number;
  date: string;
}

export interface NorgesBankRatesResult {
  rates: NorgesBankInterestRate[];
}

export interface NorgesBankRatesHistoryPoint {
  date: string;
  rate: number;
}

export interface NorgesBankRatesHistoryResult {
  type: string;
  type_label: string;
  frequency: string;
  series: NorgesBankRatesHistoryPoint[];
}
