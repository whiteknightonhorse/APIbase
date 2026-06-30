/**
 * USGS NWIS Streamflow adapter types (UC-557).
 *
 * API host: waterservices.usgs.gov
 * Auth: None (US Government open data, public domain)
 *
 * Endpoints:
 *   /nwis/dv/   — Daily Values service (historical means)
 *   /nwis/stat/ — Statistics service (annual statistics, RDB)
 *   /nwis/iv/   — Instantaneous Values (multi-site HUC basin query)
 *   /nwis/site/ — Site Service (expanded metadata, RDB)
 */

// ---------------------------------------------------------------------------
// Shared NWIS JSON envelope (IV + DV responses share this shape)
// ---------------------------------------------------------------------------

export interface NwisTimeSeries {
  sourceInfo: {
    siteName: string;
    siteCode: Array<{ value: string; network: string; agencyCode: string }>;
    geoLocation: {
      geogLocation: { latitude: number; longitude: number; srs: string };
    };
    timeZoneInfo: {
      defaultTimeZone: { zoneOffset: string; zoneAbbreviation: string };
    };
  };
  variable: {
    variableName: string;
    variableDescription: string;
    unit: { unitCode: string };
    noDataValue: number;
  };
  values: Array<{
    value: Array<{ value: string; qualifiers: string[]; dateTime: string }>;
    qualifier: Array<{ qualifierCode: string; qualifierDescription: string }>;
  }>;
  name: string;
}

export interface NwisJsonResponse {
  value: {
    timeSeries: NwisTimeSeries[];
    queryInfo: {
      queryURL: string;
      criteria: {
        locationParam: string;
        variableParam: string;
        timeParam?: { beginDateTime: string; endDateTime: string };
      };
      note: Array<{ value: string; title: string }>;
    };
  };
  nil?: boolean;
  globalScope?: boolean;
  typeSubstituted?: boolean;
}

// ---------------------------------------------------------------------------
// Tool output types
// ---------------------------------------------------------------------------

export interface DailyValueEntry {
  date: string;
  value_cfs: number | null;
  qualifier: string;
}

export interface DailyValuesOutput {
  site_no: string;
  station_name: string;
  parameter: string;
  unit: string;
  period_start: string;
  period_end: string;
  count: number;
  values: DailyValueEntry[];
}

export interface AnnualStatRow {
  year: number;
  mean_flow_cfs: number | null;
}

export interface AnnualStatsOutput {
  site_no: string;
  station_name: string;
  parameter: string;
  record_count: number;
  min_year: number | null;
  max_year: number | null;
  years: AnnualStatRow[];
}

export interface BasinSiteReading {
  site_no: string;
  station_name: string;
  latitude: number;
  longitude: number;
  streamflow_cfs: number | null;
  datetime: string;
  qualifier: string;
}

export interface BasinConditionsOutput {
  huc_code: string;
  sites_found: number;
  sites_with_data: number;
  readings: BasinSiteReading[];
}

export interface SiteInfoOutput {
  site_no: string;
  station_name: string;
  site_type: string;
  latitude: number;
  longitude: number;
  altitude_ft: number | null;
  altitude_accuracy: number | null;
  altitude_datum: string;
  huc_code: string;
  drainage_area_sqmi: number | null;
  state_cd: string;
  county_cd: string;
  timezone: string;
  agency: string;
}
