// ---------------------------------------------------------------------------
// Statistics Estonia (Statistikaamet, andmed.stat.ee) PXWeb API —
// Raw API response shapes (only fields we consume). Same PXWeb v1 shape as
// Statistics Sweden (src/adapters/scb/types.ts), Latvia (UC-668), and
// Iceland (src/adapters/iceland-statistics/types.ts, UC-669) — UC-670.
//
// Unlike Iceland, the Estonia root path (empty '') returns the same
// `id`/`type` catalog node shape used at every deeper path — no `dbid`
// special case was observed live, but the fields stay optional in
// EstoniaCatalogNode for parity with the shared PXWeb node shape and in
// case a future path variant differs.
// ---------------------------------------------------------------------------

/**
 * A single node in the Estonia statistics catalog tree.
 * type: 'l' = level (subcategory), 't' = table (leaf/queryable).
 */
export interface EstoniaCatalogNode {
  id?: string;
  dbid?: string;
  type?: 'l' | 't' | string;
  text: string;
  updated?: string | null;
}

/**
 * Catalog response — array of child nodes at a given path.
 * Returned by GET /api/v1/en/stat/{path}
 * when path points to a non-leaf node (or the root).
 */
export type EstoniaCatalogResponse = EstoniaCatalogNode[];

/**
 * A single variable (dimension) in a table's metadata.
 */
export interface EstoniaVariable {
  code: string;
  text: string;
  values: string[];
  valueTexts?: string[];
  time?: boolean;
  elimination?: boolean;
  eliminationValue?: string;
}

/**
 * Table metadata response — returned by GET /api/v1/en/stat/{table_path}
 * when path points to a leaf table node.
 */
export interface EstoniaTableMetadata {
  title: string;
  variables: EstoniaVariable[];
  updated?: string | null;
  infofile?: string | null;
  footnotes?: string[];
}

/**
 * A query filter item used in the POST body.
 */
export interface EstoniaQueryFilter {
  code: string;
  selection: {
    filter: string;
    values: string[];
  };
}

/**
 * POST body for querying a table.
 */
export interface EstoniaQueryBody {
  query: EstoniaQueryFilter[];
  response: {
    format: string;
  };
}

/**
 * JSON-stat2 dataset response from POST query.
 * Shape is defined by the JSON-stat 2 spec — we return it raw.
 */
export interface EstoniaQueryResponse {
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
 * Estonia PXWeb error response — some 200 responses include an error field.
 */
export interface EstoniaErrorResponse {
  error?: string | string[];
  message?: string;
  [key: string]: unknown;
}
