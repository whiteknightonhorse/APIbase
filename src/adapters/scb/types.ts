// ---------------------------------------------------------------------------
// Statistics Sweden (SCB) PXWeb API — Raw API response shapes (only fields we consume)
// UC-431
// ---------------------------------------------------------------------------

/**
 * A single node in the SCB catalog tree.
 * type: 'l' = level (subcategory), 't' = table (leaf/queryable)
 */
export interface ScbCatalogNode {
  id: string;
  type: 'l' | 't' | string;
  text: string;
  updated?: string | null;
}

/**
 * Catalog response — array of child nodes at a given path.
 * Returned by GET /OV0104/v1/doris/en/ssd/{path}
 * when path points to a non-leaf node.
 */
export type ScbCatalogResponse = ScbCatalogNode[];

/**
 * A single variable (dimension) in a table's metadata.
 */
export interface ScbVariable {
  code: string;
  text: string;
  values: string[];
  valueTexts?: string[];
  time?: boolean;
  elimination?: boolean;
  eliminationValue?: string;
}

/**
 * Table metadata response — returned by GET /OV0104/v1/doris/en/ssd/{table_path}
 * when path points to a leaf table node.
 */
export interface ScbTableMetadata {
  title: string;
  variables: ScbVariable[];
  updated?: string | null;
  infofile?: string | null;
  footnotes?: string[];
}

/**
 * A query filter item used in POST body.
 */
export interface ScbQueryFilter {
  code: string;
  selection: {
    filter: string;
    values: string[];
  };
}

/**
 * POST body for querying a table.
 */
export interface ScbQueryBody {
  query: ScbQueryFilter[];
  response: {
    format: string;
  };
}

/**
 * JSON-stat2 dataset response from POST query.
 * Shape is defined by JSON-stat 2 spec — we return it raw.
 */
export interface ScbQueryResponse {
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
 * SCB error response — some 200 responses include an error field.
 */
export interface ScbErrorResponse {
  error?: string | string[];
  message?: string;
  [key: string]: unknown;
}
