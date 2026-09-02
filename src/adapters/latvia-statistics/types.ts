// ---------------------------------------------------------------------------
// Central Statistical Bureau of Latvia (data.stat.gov.lv) PXWeb API —
// Raw API response shapes (only fields we consume). Same PXWeb v1 shape as
// Statistics Sweden (src/adapters/scb/types.ts) — UC-668.
// ---------------------------------------------------------------------------

/**
 * A single node in the Latvia statistics catalog tree.
 * type: 'l' = level (subcategory), 't' = table (leaf/queryable)
 */
export interface LatviaCatalogNode {
  id: string;
  type: 'l' | 't' | string;
  text: string;
  updated?: string | null;
}

/**
 * Catalog response — array of child nodes at a given path.
 * Returned by GET /api/v1/en/OSP_PUB/{path}
 * when path points to a non-leaf node.
 */
export type LatviaCatalogResponse = LatviaCatalogNode[];

/**
 * A single variable (dimension) in a table's metadata.
 */
export interface LatviaVariable {
  code: string;
  text: string;
  values: string[];
  valueTexts?: string[];
  time?: boolean;
  elimination?: boolean;
  eliminationValue?: string;
}

/**
 * Table metadata response — returned by GET /api/v1/en/OSP_PUB/{table_path}
 * when path points to a leaf table node.
 */
export interface LatviaTableMetadata {
  title: string;
  variables: LatviaVariable[];
  updated?: string | null;
  infofile?: string | null;
  footnotes?: string[];
}

/**
 * A query filter item used in the POST body.
 */
export interface LatviaQueryFilter {
  code: string;
  selection: {
    filter: string;
    values: string[];
  };
}

/**
 * POST body for querying a table.
 */
export interface LatviaQueryBody {
  query: LatviaQueryFilter[];
  response: {
    format: string;
  };
}

/**
 * JSON-stat2 dataset response from POST query.
 * Shape is defined by the JSON-stat 2 spec — we return it raw.
 */
export interface LatviaQueryResponse {
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
 * Latvia PXWeb error response — some 200 responses include an error field.
 */
export interface LatviaErrorResponse {
  error?: string | string[];
  message?: string;
  [key: string]: unknown;
}
