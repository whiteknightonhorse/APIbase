/** ABS SDMX-JSON 2.0 response structure */
export interface AbsSdmxResponse {
  data: {
    structures: AbsSdmxStructure[];
    dataSets: AbsSdmxDataSet[];
  };
  errors?: unknown[];
}

export interface AbsSdmxStructure {
  name: string;
  dimensions: {
    observation: AbsSdmxDimension[];
  };
}

export interface AbsSdmxDimension {
  id: string;
  name: string;
  keyPosition: number;
  values: AbsSdmxDimensionValue[];
}

export interface AbsSdmxDimensionValue {
  id: string;
  name: string;
  order?: number;
}

export interface AbsSdmxDataSet {
  observations: Record<string, (number | null)[]>;
}

export interface AbsObservation {
  period: string;
  value: number;
  dimensions?: Record<string, string>;
}

export interface AbsSeriesResult {
  dataset: string;
  dataset_name: string;
  unit?: string;
  observations: AbsObservation[];
  count: number;
}
