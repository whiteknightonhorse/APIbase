// ---------------------------------------------------------------------------
// OECD SDMX REST API — raw response types
// ---------------------------------------------------------------------------

/** One dimension (series or observation level) in an SDMX-JSON structure */
export interface OecdSdmxDimension {
  id: string;
  name?: string;
  values: Array<{ id: string; name?: string }>;
}

/** SDMX-JSON structure block (one per dataflow in the response) */
export interface OecdSdmxStructure {
  name?: string;
  dimensions: {
    series?: OecdSdmxDimension[];
    observation?: OecdSdmxDimension[];
  };
}

/** One series entry in a dataSet */
export interface OecdSdmxSeries {
  attributes?: (number | null)[];
  observations?: Record<string, (number | null)[]>;
}

/** One dataSet in an SDMX-JSON response */
export interface OecdSdmxDataSet {
  series?: Record<string, OecdSdmxSeries>;
  observations?: Record<string, (number | null)[]>;
}

/** Top-level SDMX-JSON 2.0 response from sdmx.oecd.org */
export interface OecdSdmxResponse {
  data?: {
    structures?: OecdSdmxStructure[];
    dataSets?: OecdSdmxDataSet[];
  };
  errors?: unknown[];
}

// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

/** A single observation within a time series */
export interface OecdObservation {
  period: string;
  value: number;
}

/** A decoded time series with dimension labels */
export interface OecdSeries {
  dimensions: Record<string, string>;
  observations: OecdObservation[];
}

/** Normalized output returned by every OECD tool */
export interface OecdToolOutput {
  dataset: string;
  country: string;
  start_period: string;
  end_period: string;
  series: OecdSeries[];
  total_series: number;
  returned_series: number;
}
