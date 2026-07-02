// Raw types for ADB Key Indicators Database (KIDB) API responses

export interface AdbkidbIndicatorRaw {
  code: string;
  name: string;
  description: string | null;
}

export interface AdbkidbObservation {
  indicator: string;
  economy: string;
  period: string;
  value: number | null;
  unit: string;
  unit_mult: number;
  decimals: number;
  status: string;
  source: string;
  footnote: string;
}

export interface AdbkidbDataOutput {
  dataflow: string;
  economies: string[];
  indicators: string[];
  start_year: number;
  end_year: number;
  observations: AdbkidbObservation[];
  observation_count: number;
}

export interface AdbkidbIndicatorsOutput {
  dataflow: string;
  count: number;
  indicators: Array<{
    code: string;
    name: string;
    description: string | null;
  }>;
}

export interface AdbkidbDataflow {
  code: string;
  name: string;
}

export interface AdbkidbDataflowsOutput {
  count: number;
  dataflows: AdbkidbDataflow[];
}

export interface AdbkidbEconomy {
  code: string;
  name: string;
}

export interface AdbkidbEconomiesOutput {
  count: number;
  economies: AdbkidbEconomy[];
}
