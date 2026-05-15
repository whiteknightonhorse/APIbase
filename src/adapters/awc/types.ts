/**
 * NOAA Aviation Weather Center (AWC) API response types (UC-422).
 *
 * https://aviationweather.gov/data/api/
 * US Federal Government public domain data.
 */

/**
 * METAR observation record — aviation meteorological aerodrome report.
 */
export interface AwcMetarRecord {
  icaoId: string;
  receiptTime: string;
  obsTime: number;
  reportTime: string;
  temp: number | null;
  dewp: number | null;
  wdir: number | string | null;
  wspd: number | null;
  visib: string | number | null;
  altim: number | null;
  slp: number | null;
  qcField: number;
  maxT24?: number | null;
  minT24?: number | null;
  metarType: string;
  rawOb: string;
  lat: number;
  lon: number;
  elev: number;
  name: string;
  cover?: string | null;
  clouds?: Array<{ cover: string; base: number }> | null;
  wxString?: string | null;
}

/**
 * TAF forecast record — terminal aerodrome forecast.
 */
export interface AwcTafRecord {
  icaoId: string;
  dbPopTime: string;
  bulletinTime: string;
  issueTime: string;
  validTimeFrom: number;
  validTimeTo: number;
  rawTAF: string;
  fcsts?: Array<{
    timeFrom: number;
    timeTo: number;
    changeType?: string | null;
    wdir?: number | string | null;
    wspd?: number | null;
    wgst?: number | null;
    visib?: string | number | null;
    wxString?: string | null;
    clouds?: Array<{ cover: string; base: number }> | null;
  }>;
}

/**
 * SIGMET/AIRMET hazard alert record.
 */
export interface AwcSigmetRecord {
  icaoId: string;
  alphaChar?: string | null;
  seriesId?: string | null;
  receiptTime: string;
  creationTime: string;
  validTimeFrom: number;
  validTimeTo: number;
  airSigmetType: string;
  hazard: string;
  severity?: string | null;
  altitudeHi1?: number | null;
  altitudeHi2?: number | null;
  altitudeLow1?: number | null;
  altitudeLow2?: number | null;
  movementDir?: number | null;
  movementSp?: number | null;
  rawAirSigmet?: string | null;
  coords?: Array<{ lat: number; lon: number }>;
}
