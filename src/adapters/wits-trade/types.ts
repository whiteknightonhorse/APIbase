// Raw response shapes for the World Bank WITS SDMX-JSON API
// (wits.worldbank.org/API/V1/SDMX/V21). Only the fields consumed by the
// adapter are typed.

export interface WitsDimensionValue {
  id: string;
  name?: string;
}

export interface WitsDimension {
  id: string;
  name?: string;
  values: WitsDimensionValue[];
}

export interface WitsSdmxResponse {
  header?: { id?: string; prepared?: string };
  dataSets?: Array<{
    series?: Record<string, { observations?: Record<string, Array<number | null>> }>;
  }>;
  structure?: {
    name?: string;
    dimensions?: {
      series?: WitsDimension[];
      observation?: WitsDimension[];
    };
    attributes?: {
      observation?: WitsDimension[];
    };
  };
}
