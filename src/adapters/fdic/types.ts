/** FDIC BankFind Suite API response types (UC-191). */

export interface FdicInstitution {
  data: Record<string, unknown>;
  score?: number;
}

export interface FdicSearchResponse {
  meta: { total: number; parameters: Record<string, string> };
  data: FdicInstitution[];
  totals: { count: number };
}

export interface FdicFailure {
  data: Record<string, unknown>;
}

export interface FdicFailuresResponse {
  meta: { total: number };
  data: FdicFailure[];
  totals: { count: number };
}

export interface FdicFinancialsResponse {
  meta: { total: number };
  data: Array<{ data: Record<string, unknown> }>;
  totals: { count: number };
}
