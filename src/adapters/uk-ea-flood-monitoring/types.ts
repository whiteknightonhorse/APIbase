// Raw response types for the UK Environment Agency Flood Monitoring API (UC-683).
// https://environment.data.gov.uk/flood-monitoring/

export interface FloodMonitoringMeta {
  publisher?: string;
  licence?: string;
  version?: string;
  comment?: string;
  limit?: number;
}

export interface FloodMonitoringFloodArea {
  '@id': string;
  county?: string;
  notation?: string;
  polygon?: string;
  riverOrSea?: string;
}

export interface FloodMonitoringFlood {
  '@id': string;
  description?: string;
  eaAreaName?: string;
  eaRegionName?: string;
  floodArea?: FloodMonitoringFloodArea;
  floodAreaID?: string;
  isTidal?: boolean;
  message?: string;
  severity?: string;
  severityLevel?: number;
  timeMessageChanged?: string;
  timeRaised?: string;
  timeSeverityChanged?: string;
}

export interface FloodMonitoringFloodsResponse {
  meta: FloodMonitoringMeta;
  items: FloodMonitoringFlood[];
}

export interface FloodMonitoringMeasureRef {
  '@id': string;
  parameter?: string;
  parameterName?: string;
  period?: number;
  qualifier?: string;
  unitName?: string;
}

export interface FloodMonitoringStation {
  '@id': string;
  RLOIid?: string;
  catchmentName?: string;
  dateOpened?: string;
  easting?: number;
  northing?: number;
  label: string | string[];
  lat?: number;
  long?: number;
  measures?: FloodMonitoringMeasureRef | FloodMonitoringMeasureRef[];
  notation: string;
  riverName?: string;
  stationReference: string;
  status?: string;
  town?: string;
  wiskiID?: string;
}

export interface FloodMonitoringStationsResponse {
  meta: FloodMonitoringMeta;
  items: FloodMonitoringStation[];
}

export interface FloodMonitoringReading {
  '@id'?: string;
  dateTime?: string;
  measure: string;
  value: number;
}

export interface FloodMonitoringReadingsResponse {
  meta: FloodMonitoringMeta;
  items: FloodMonitoringReading[];
}
