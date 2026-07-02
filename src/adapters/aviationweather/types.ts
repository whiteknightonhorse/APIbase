/** Raw types for NOAA Aviation Weather Center API (UC-575). */

export interface AvwxMetarEntry {
  icaoId: string;
  receiptTime: string;
  obsTime: number;
  reportTime: string;
  temp: number | null;
  dewp: number | null;
  wdir: number | string | null;
  wspd: number | null;
  wgst: number | null;
  visib: string | number | null;
  altim: number | null;
  slp: number | null;
  metarType: string;
  rawOb: string;
  lat: number;
  lon: number;
  elev: number;
  name: string;
  fltCat: string | null;
  cover: string | null;
  clouds: Array<{ cover: string; base: number }> | null;
  wxString: string | null;
}

export interface AvwxTafForecast {
  timeFrom: number;
  timeTo: number;
  fcstChange: string | null;
  probability: number | null;
  wdir: number | null;
  wspd: number | null;
  wgst: number | null;
  visib: string | number | null;
  wxString: string | null;
  clouds: Array<{ cover: string; base: number; type: string | null }> | null;
}

export interface AvwxTafEntry {
  icaoId: string;
  bulletinTime: string;
  issueTime: string;
  validTimeFrom: number;
  validTimeTo: number;
  rawTAF: string;
  lat: number;
  lon: number;
  elev: number;
  name: string;
  fcsts: AvwxTafForecast[];
}

export interface AvwxPirepEntry {
  receiptTime: string;
  obsTime: number;
  icaoId: string;
  acType: string | null;
  lat: number;
  lon: number;
  fltLvl: number | null;
  temp: number | null;
  wdir: number | null;
  wspd: number | null;
  visib: number | null;
  wxString: string | null;
  clouds: string | null;
  icgInt1: string | null;
  icgType1: string | null;
  icgBas1: number | null;
  icgTop1: number | null;
  tbInt1: string | null;
  tbBas1: number | null;
  tbTop1: number | null;
  rawOb: string;
}

export interface AvwxStationEntry {
  id: string;
  icaoId: string | null;
  iataId: string | null;
  faaId: string | null;
  wmoId: string | null;
  site: string;
  lat: number;
  lon: number;
  elev: number;
  state: string;
  country: string;
  priority: number;
  siteType: string[];
}
