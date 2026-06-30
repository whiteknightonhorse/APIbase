// Bureau of Economic Analysis (BEA) API response types (UC-545)

export interface BeaNipaDataRow {
  TableName: string;
  SeriesCode: string;
  LineNumber: string;
  LineDescription: string;
  TimePeriod: string;
  METRIC_NAME: string;
  CL_UNIT: string;
  UNIT_MULT: string;
  DataValue: string;
  NoteRef: string;
}

export interface BeaNipaResults {
  Statistic: string;
  UTCProductionTime: string;
  Data: BeaNipaDataRow[];
  Notes?: Array<{ NoteRef: string; NoteText: string }>;
}

export interface BeaNipaResponse {
  BEAAPI: {
    Request?: Record<string, unknown>;
    Results?: BeaNipaResults;
    Error?: { APIErrorCode: string; APIErrorDescription: string };
  };
}

// ITA (International Transactions) — Results.Data is a single object
export interface BeaItaDataRow {
  Indicator: string;
  AreaOrCountry: string;
  Frequency: string;
  Year: string;
  TimeSeriesId: string;
  TimeSeriesDescription: string;
  TimePeriod: string;
  CL_UNIT: string;
  UNIT_MULT: string;
  DataValue: string;
  NoteRef: string;
}

export interface BeaItaResults {
  TsLastUpdated?: string;
  Dimensions: Array<{ Ordinal: string; Name: string; DataType: string; IsValue: string }>;
  Data: BeaItaDataRow | BeaItaDataRow[];
  Notes?: Array<{ NoteRef: string; NoteText: string }>;
}

export interface BeaItaResponse {
  BEAAPI: {
    Request?: Record<string, unknown>;
    Results?: BeaItaResults;
    Error?: { APIErrorCode: string; APIErrorDescription: string };
  };
}

// Regional (state GDP) response
export interface BeaRegionalDataRow {
  Code: string;
  GeoFips: string;
  GeoName: string;
  TimePeriod: string;
  CL_UNIT: string;
  UNIT_MULT: string;
  DataValue: string;
}

export interface BeaRegionalResults {
  Statistic?: string;
  UTCProductionTime?: string;
  Data: BeaRegionalDataRow | BeaRegionalDataRow[];
  Notes?: Array<{ NoteRef: string; NoteText: string }>;
}

export interface BeaRegionalResponse {
  BEAAPI: {
    Request?: Record<string, unknown>;
    Results?: BeaRegionalResults;
    Error?: { APIErrorCode: string; APIErrorDescription: string };
  };
}

// GDPbyIndustry — Results is an array
export interface BeaGdpIndustryDataRow {
  TableID: string;
  Frequency: string;
  Year: string;
  Quarter: string;
  Industry: string;
  IndustrYDescription: string;
  DataValue: string;
  NoteRef: string;
}

export interface BeaGdpIndustryResult {
  Statistic: string;
  UTCProductionTime: string;
  Dimensions: Array<{ Ordinal: string; Name: string; DataType: string; IsValue: string }>;
  Data: BeaGdpIndustryDataRow[];
  Notes?: Array<{ NoteRef: string; NoteText: string }>;
}

export interface BeaGdpIndustryResponse {
  BEAAPI: {
    Request?: Record<string, unknown>;
    Results?: BeaGdpIndustryResult | BeaGdpIndustryResult[];
    Error?: { APIErrorCode: string; APIErrorDescription: string };
  };
}
