/**
 * Bank of Canada Valet API response types (UC-503).
 *
 * API host: https://www.bankofcanada.ca/valet
 * Auth: none (open data, Bank of Canada attribution required)
 * Docs: https://www.bankofcanada.ca/valet/docs
 */

// ---------------------------------------------------------------------------
// Valet API — common observation entry
// ---------------------------------------------------------------------------

export interface ValetObservation {
  /** Date key, e.g. "2026-06-22" */
  d: string;
  /** Series code → { v: "value_string" } map */
  [seriesCode: string]: { v: string } | string;
}

// ---------------------------------------------------------------------------
// Series detail metadata
// ---------------------------------------------------------------------------

export interface ValetSeriesDetail {
  label: string;
  description: string;
  dimension: {
    key: string;
    name: string;
  };
}

// ---------------------------------------------------------------------------
// Full Valet observations response
// ---------------------------------------------------------------------------

export interface ValetObservationsResponse {
  terms?: { url: string };
  seriesDetail: Record<string, ValetSeriesDetail>;
  observations: ValetObservation[];
}
