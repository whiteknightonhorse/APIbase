// ---------------------------------------------------------------------------
// Statistics Denmark (StatBank) API — Raw response shapes (UC-594)
// ---------------------------------------------------------------------------

/** One node from GET /v1/subjects (topic tree, optionally recursive). */
export interface DkSubject {
  id: string;
  description: string;
  active: boolean;
  hasSubjects: boolean;
  subjects: DkSubject[];
}

/** One result from GET /v1/tables (table list / keyword search). */
export interface DkTableListItem {
  id: string;
  text: string;
  unit?: string;
  updated?: string;
  firstPeriod?: string;
  latestPeriod?: string;
  active: boolean;
  variables: string[];
}

/** A single dimension value (code + label). */
export interface DkVariableValue {
  id: string;
  text: string;
}

/** A single dimension (variable) from GET /v1/tableinfo. */
export interface DkVariable {
  id: string;
  text: string;
  elimination?: boolean;
  time?: boolean;
  values: DkVariableValue[];
}

/** Table metadata response from GET /v1/tableinfo?id=<tableId>. */
export interface DkTableInfo {
  id: string;
  text: string;
  description?: string;
  unit?: string;
  updated?: string;
  active: boolean;
  variables: DkVariable[];
}

/** JSON-stat 2.0-style dataset returned by POST /v1/data (format=JSONSTAT). We return it raw. */
export interface DkDataResponse {
  dataset: {
    label?: string;
    source?: string;
    updated?: string;
    dimension: Record<string, unknown> & {
      id?: string[];
      size?: number[];
      role?: Record<string, string[]>;
    };
    value: (number | null)[];
    [key: string]: unknown;
  };
}

/** StatBank error response shape (returned with a non-2xx HTTP status). */
export interface DkErrorResponse {
  errorTypeCode?: string;
  message?: string;
  [key: string]: unknown;
}
