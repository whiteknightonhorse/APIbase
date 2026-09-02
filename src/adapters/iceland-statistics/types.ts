// ---------------------------------------------------------------------------
// Statistics Iceland / Hagstofa Íslands (px.hagstofa.is) PXWeb API —
// Raw API response shapes (only fields we consume). Same PXWeb v1 shape as
// Statistics Sweden (src/adapters/scb/types.ts) and Latvia (UC-668) — UC-669.
//
// One quirk verified live: the ROOT path ('') returns a list of *databases*
// keyed by `dbid` instead of the usual `id`/`type` catalog node shape used
// at every deeper path. Both shapes are folded into IcelandCatalogNode below
// so a single catalog tool covers root + all subcategories without special
// casing in the adapter.
// ---------------------------------------------------------------------------

/**
 * A single node in the Iceland statistics catalog tree.
 * type: 'l' = level (subcategory), 't' = table (leaf/queryable) — present at
 * every path except the root, where nodes instead carry `dbid` (database id).
 */
export interface IcelandCatalogNode {
  id?: string;
  dbid?: string;
  type?: 'l' | 't' | string;
  text: string;
  updated?: string | null;
}

/**
 * Catalog response — array of child nodes at a given path.
 * Returned by GET /pxen/api/v1/en/{path}
 * when path points to a non-leaf node (or the root).
 */
export type IcelandCatalogResponse = IcelandCatalogNode[];

/**
 * A single variable (dimension) in a table's metadata.
 */
export interface IcelandVariable {
  code: string;
  text: string;
  values: string[];
  valueTexts?: string[];
  time?: boolean;
  elimination?: boolean;
  eliminationValue?: string;
}

/**
 * Table metadata response — returned by GET /pxen/api/v1/en/{table_path}
 * when path points to a leaf table node.
 */
export interface IcelandTableMetadata {
  title: string;
  variables: IcelandVariable[];
  updated?: string | null;
  infofile?: string | null;
  footnotes?: string[];
}

/**
 * A query filter item used in the POST body.
 */
export interface IcelandQueryFilter {
  code: string;
  selection: {
    filter: string;
    values: string[];
  };
}

/**
 * POST body for querying a table.
 */
export interface IcelandQueryBody {
  query: IcelandQueryFilter[];
  response: {
    format: string;
  };
}

/**
 * JSON-stat2 dataset response from POST query.
 * Shape is defined by the JSON-stat 2 spec — we return it raw.
 */
export interface IcelandQueryResponse {
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
 * Iceland PXWeb error response — some 200 responses include an error field.
 */
export interface IcelandErrorResponse {
  error?: string | string[];
  message?: string;
  [key: string]: unknown;
}
