// ---------------------------------------------------------------------------
// Raw SDMX-JSON response shape (ECB Data Portal, format=jsondata)
// ---------------------------------------------------------------------------

export interface SdmxObservationValue {
  id: string;
  name: string;
  start?: string;
  end?: string;
}

export interface SdmxJsonResponse {
  dataSets: Array<{
    action: string;
    series: Record<
      string,
      {
        observations: Record<string, Array<number | null>>;
      }
    >;
  }>;
  structure: {
    name: string;
    dimensions: {
      observation: Array<{
        id: string;
        name: string;
        values: SdmxObservationValue[];
      }>;
    };
  };
}

// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface EcbSeriesPoint {
  period: string;
  value: number | null;
}

export interface EcbSeriesOutput {
  dataset_name: string;
  series_key: string;
  observations: EcbSeriesPoint[];
}
