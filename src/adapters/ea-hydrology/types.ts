// Raw response types for the Environment Agency Hydrology API (UC-654).
// https://environment.data.gov.uk/hydrology/

export interface EaHydrologyMeta {
  '@id': string;
  publisher?: string;
  license?: string;
  licenseName?: string;
  comment?: string;
  version?: string;
  limit?: number;
}

export interface EaHydrologyLabeledRef {
  '@id': string;
  label?: string;
}

export interface EaHydrologyStation {
  '@id': string;
  label: string;
  notation: string;
  lat?: number;
  long?: number;
  easting?: number;
  northing?: number;
  riverName?: string;
  catchmentName?: string;
  town?: string;
  wiskiID?: string;
  stationGuid?: string;
  dateOpened?: string;
  status?: EaHydrologyLabeledRef | EaHydrologyLabeledRef[];
  observedProperty?: EaHydrologyLabeledRef | EaHydrologyLabeledRef[];
  measures?: Array<{
    '@id': string;
    parameter?: string;
    period?: number;
    valueStatistic?: EaHydrologyLabeledRef;
  }>;
}

export interface EaHydrologyStationsResponse {
  meta: EaHydrologyMeta;
  items: EaHydrologyStation[];
}

export interface EaHydrologyMeasure {
  '@id': string;
  label?: string;
  notation: string;
  parameter?: string;
  parameterName?: string;
  period?: number;
  periodName?: string;
  valueType?: string;
  valueStatistic?: EaHydrologyLabeledRef;
  observedProperty?: EaHydrologyLabeledRef;
  station?: EaHydrologyLabeledRef & { wiskiID?: string };
  unit?: { '@id': string };
  unitName?: string;
}

export interface EaHydrologyMeasuresResponse {
  meta: EaHydrologyMeta;
  items: EaHydrologyMeasure[];
}

export interface EaHydrologyReading {
  measure?: EaHydrologyLabeledRef;
  date?: string;
  dateTime?: string;
  value: number;
  quality?: string;
  valid?: string;
  invalid?: string;
  missing?: string;
  completeness?: string;
}

export interface EaHydrologyReadingsResponse {
  meta: EaHydrologyMeta;
  items: EaHydrologyReading[];
}
