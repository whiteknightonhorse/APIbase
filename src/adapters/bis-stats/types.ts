// ---------------------------------------------------------------------------
// BIS Statistics SDMX REST API — raw response types
// ---------------------------------------------------------------------------

/** One dimension (series or observation level) in a BIS SDMX-JSON structure */
export interface BisSdmxDimension {
  id: string;
  name?: string;
  values: Array<{ id: string; name?: string }>;
}

/** BIS SDMX-JSON structure block — note: BIS nests this as a single `structure`
 *  object (unlike the OECD API's `structures[]` array). */
export interface BisSdmxStructure {
  name?: string;
  dimensions: {
    series?: BisSdmxDimension[];
    observation?: BisSdmxDimension[];
  };
}

/** One series entry in a dataSet */
export interface BisSdmxSeries {
  attributes?: (number | null)[];
  observations?: Record<string, (string | number | null)[]>;
}

/** One dataSet in a BIS SDMX-JSON response */
export interface BisSdmxDataSet {
  series?: Record<string, BisSdmxSeries>;
  observations?: Record<string, (string | number | null)[]>;
}

/** Top-level SDMX-JSON response from stats.bis.org (v1.0.0 data message) */
export interface BisSdmxResponse {
  data?: {
    structure?: BisSdmxStructure;
    dataSets?: BisSdmxDataSet[];
  };
  errors?: Array<{ code?: number; message?: string }>;
}

// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

/** A single observation within a time series */
export interface BisObservation {
  period: string;
  value: number;
}

/** A decoded time series with dimension labels */
export interface BisSeries {
  dimensions: Record<string, string>;
  observations: BisObservation[];
}

/** Normalized output returned by every BIS Statistics tool */
export interface BisToolOutput {
  dataset: string;
  country: string;
  start_period: string;
  end_period: string;
  series: BisSeries[];
  total_series: number;
  returned_series: number;
}
