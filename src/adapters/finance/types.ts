/**
 * Finance adapter response types (UC-016).
 *
 * Covers 6 upstream providers:
 *   fawazahmed0 CDN (200+ currencies)
 *   Frankfurter/ECB (~33 fiat)
 *   FRED (816K+ economic series)
 *   World Bank (16K+ indicators)
 *   US Treasury Fiscal Data
 *   OpenIBAN (IBAN validation)
 */

// ---------------------------------------------------------------------------
// fawazahmed0 Currency API (CDN)
// ---------------------------------------------------------------------------

/** GET /@latest/v1/currencies/{base}.json */
export interface FawazRatesResponse {
  date: string;
  [base: string]: string | Record<string, number>;
}

// ---------------------------------------------------------------------------
// Frankfurter / ECB
// ---------------------------------------------------------------------------

/** GET /latest?from=BASE or /{date}?from=BASE */
export interface FrankfurterRatesResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

// ---------------------------------------------------------------------------
// FRED (Federal Reserve Economic Data)
// ---------------------------------------------------------------------------

export interface FredObservation {
  realtime_start: string;
  realtime_end: string;
  date: string;
  value: string; // FRED returns value as string; "." means missing
}

export interface FredObservationsResponse {
  realtime_start: string;
  realtime_end: string;
  observation_start: string;
  observation_end: string;
  units: string;
  output_type: number;
  file_type: string;
  order_by: string;
  sort_order: string;
  count: number;
  offset: number;
  limit: number;
  observations: FredObservation[];
}

// ---------------------------------------------------------------------------
// World Bank API v2
// ---------------------------------------------------------------------------

export interface WorldBankMeta {
  page: number;
  pages: number;
  per_page: number;
  total: number;
  sourceid: string;
  lastupdated: string;
}

export interface WorldBankDataPoint {
  indicator: { id: string; value: string };
  country: { id: string; value: string };
  countryiso3code: string;
  date: string;
  value: number | null;
  unit: string;
  obs_status: string;
  decimal: number;
}

/** World Bank returns 2-element array: [meta, data[]] */
export type WorldBankResponse = [WorldBankMeta, WorldBankDataPoint[] | null];

// ---------------------------------------------------------------------------
// US Treasury Fiscal Data
// ---------------------------------------------------------------------------

export interface TreasuryRecord {
  [field: string]: string; // All fields are strings
}

export interface TreasuryDataResponse {
  data: TreasuryRecord[];
  meta: {
    count: number;
    labels: Record<string, string>;
    dataTypes: Record<string, string>;
    dataFormats: Record<string, string>;
    total_count: number;
    total_pages: number;
  };
  links: {
    self: string;
    first: string;
    prev: string | null;
    next: string | null;
    last: string;
  };
}

// ---------------------------------------------------------------------------
// OpenIBAN
// ---------------------------------------------------------------------------

export interface OpenIbanBankData {
  bankCode: string;
  name: string;
  zip: string;
  city: string;
  bic: string;
}

export interface OpenIbanCheckResult {
  code: string;
  message: string;
}

export interface OpenIbanResponse {
  valid: boolean;
  messages: string[];
  iban: string;
  bankData: OpenIbanBankData;
  checkResults: Record<string, OpenIbanCheckResult>;
}
