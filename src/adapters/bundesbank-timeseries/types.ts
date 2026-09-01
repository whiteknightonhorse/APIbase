// Raw response shapes for the Deutsche Bundesbank SDMX 2.1 REST API
// (api.statistiken.bundesbank.de/rest). Metadata (dataflow list, data structure + codelists)
// is served ONLY as XML — hand-parsed with regex in index.ts, same pattern as
// src/adapters/usgs-mrds/index.ts's GML parser. The data endpoint (/rest/data/{flowRef}/{key})
// DOES support application/json, so its response is typed and JSON.parse'd normally by
// BaseAdapter — same SDMX-JSON dataSets/series shape as src/adapters/istat/types.ts.

export interface SdmxDimensionValue {
  id: string;
  name?: string;
}

export interface SdmxStructureDimension {
  id: string;
  keyPosition: number;
  values: SdmxDimensionValue[];
}

export interface SdmxSeries {
  observations: Record<string, Array<number | string | null>>;
}

export interface SdmxDataMessage {
  data: {
    dataSets: Array<{
      series?: Record<string, SdmxSeries>;
    }>;
    structure: {
      dimensions: {
        series?: SdmxStructureDimension[];
        observation?: SdmxStructureDimension[];
      };
    };
  };
}

export interface BundesbankDataflowEntry {
  id: string;
  version: string;
  name: string | null;
}

export interface BundesbankCodelistCode {
  code: string;
  name: string | null;
}

export interface BundesbankDimension {
  dimension_id: string;
  position: number;
  total_codes: number;
  codes: BundesbankCodelistCode[];
}
