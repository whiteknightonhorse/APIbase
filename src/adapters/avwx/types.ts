/**
 * AVWX Aviation Weather API response types (UC-424).
 *
 * https://avwx.rest/documentation
 * Parsed NOTAMs, PIREPs, and composite station summaries.
 */

/**
 * AVWX meta object — present in most responses.
 */
export interface AvwxMeta {
  timestamp: string;
  stations?: string[];
  cache_timestamp?: string | null;
  warning?: string | null;
}

/**
 * NOTAM classification type.
 */
export type AvwxNotamClassification = 'FDC' | 'D' | 'U' | 'O' | string;

/**
 * NOTAM type/purpose.
 */
export type AvwxNotamType = string;

/**
 * Single AVWX NOTAM record (parsed).
 */
export interface AvwxNotam {
  id?: string | null;
  location?: string | null;
  classification?: AvwxNotamClassification | null;
  type?: AvwxNotamType | null;
  start_time?: string | null;
  end_time?: string | null;
  body?: string | null;
  raw?: string | null;
  station?: string | null;
  isid?: string | null;
  created?: string | null;
  schedule?: string | null;
}

/**
 * AVWX NOTAM list response.
 */
export interface AvwxNotamResponse {
  meta?: AvwxMeta | null;
  data?: AvwxNotam[] | null;
  [key: string]: unknown;
}

/**
 * AVWX PIREP aircraft field.
 */
export interface AvwxPirepAircraft {
  code?: string | null;
  text?: string | null;
}

/**
 * AVWX PIREP altitude field.
 */
export interface AvwxPirepAltitude {
  repr?: string | null;
  value?: number | null;
  spoken?: string | null;
}

/**
 * AVWX PIREP turbulence entry.
 */
export interface AvwxPirepTurbulence {
  frequency?: { repr: string | null; value: string | null } | null;
  intensity?: { repr: string | null; value: string | null } | null;
  type?: { repr: string | null; value: string | null } | null;
}

/**
 * AVWX PIREP icing entry.
 */
export interface AvwxPirepIcing {
  severity?: { repr: string | null; value: string | null } | null;
  type?: { repr: string | null; value: string | null } | null;
}

/**
 * Single AVWX PIREP record (parsed).
 */
export interface AvwxPirep {
  raw?: string | null;
  station?: string | null;
  time?: { repr: string | null; value: string | null; dt?: string | null } | null;
  location?: string | null;
  altitude?: AvwxPirepAltitude | null;
  aircraft?: AvwxPirepAircraft | null;
  sky_condition?: { repr: string | null; value: string | null }[] | null;
  turbulence?: AvwxPirepTurbulence[] | null;
  icing?: AvwxPirepIcing[] | null;
  wx?: { repr: string | null; value: string | null }[] | null;
  temperature?: { repr: string | null; value: number | null } | null;
  wind?: {
    direction?: { repr: string | null; value: number | null } | null;
    speed?: { repr: string | null; value: number | null } | null;
  } | null;
  urgent?: boolean | null;
  [key: string]: unknown;
}

/**
 * AVWX PIREP list response — array of PIREP records.
 */
export type AvwxPirepResponse = AvwxPirep[];

/**
 * AVWX station summary — composite METAR + TAF + station info.
 */
export interface AvwxStationSummary {
  meta?: AvwxMeta | null;
  metar?: Record<string, unknown> | null;
  taf?: Record<string, unknown> | null;
  station?: Record<string, unknown> | null;
  [key: string]: unknown;
}
