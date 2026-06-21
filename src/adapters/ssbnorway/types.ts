// ---------------------------------------------------------------------------
// Statistics Norway (SSB) PXWeb API — Raw response shapes (UC-459)
// ---------------------------------------------------------------------------

/**
 * One result from GET /api/v0/en/table/?query=<term>
 */
export interface SsbSearchResult {
  id: string;
  path?: string;
  title: string;
  score?: number;
  published?: string;
}

/**
 * A single variable (dimension) returned by GET /api/v0/en/table/<id>
 */
export interface SsbVariable {
  code: string;
  text: string;
  values: string[];
  valueTexts?: string[];
  time?: boolean;
  elimination?: boolean;
  eliminationValue?: string;
}

/**
 * Table metadata response from GET /api/v0/en/table/<id>
 */
export interface SsbTableMetadata {
  title: string;
  variables: SsbVariable[];
  updated?: string | null;
  footnotes?: string[];
}

/**
 * A query filter item used in POST body.
 */
export interface SsbQueryFilter {
  code: string;
  selection: {
    filter: string;
    values: string[];
  };
}

/**
 * JSON-stat2 dataset response from POST /api/v0/en/table/<id>
 * We return it raw — the shape follows the JSON-stat 2.0 spec.
 */
export interface SsbQueryResponse {
  version: string;
  class: string;
  label: string;
  source?: string | null;
  updated?: string | null;
  id?: string[];
  size?: number[];
  dimension?: Record<string, unknown>;
  value?: (number | null)[];
  note?: string[];
  role?: Record<string, string[]>;
  [key: string]: unknown;
}

/**
 * SSB API error response (returned in 200 responses as well).
 */
export interface SsbErrorResponse {
  error?: string;
  [key: string]: unknown;
}
