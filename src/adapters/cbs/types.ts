// ---------------------------------------------------------------------------
// Statistics Netherlands (CBS) OData v3 API — Raw API response shapes
// UC-432
// ---------------------------------------------------------------------------

/**
 * A single entry in the CBS table catalog.
 * Returned by GET /ODataApi/odata/CBS.Tables?$filter=...
 */
export interface CbsCatalogEntry {
  Identifier: string;
  Title: string;
  ShortDescription?: string | null;
  Summary?: string | null;
  Modified?: string | null;
  OutputStatus?: string | null;
  Period?: string | null;
  Frequency?: string | null;
  Language?: string | null;
  Catalog?: string | null;
  Url?: string | null;
  DefaultPresentation?: string | null;
  ReasonDelivery?: string | null;
  ExplanatoryText?: string | null;
  ID?: number | null;
  [key: string]: unknown;
}

/**
 * OData v3 catalog search response envelope.
 * Returned by GET /ODataApi/odata/CBS.Tables?$filter=...
 */
export interface CbsCatalogResponse {
  'odata.metadata'?: string;
  value: CbsCatalogEntry[];
}

/**
 * A single row in TableInfos metadata.
 * Returned by GET /ODataApi/odata/{table_id}/TableInfos
 */
export interface CbsTableInfo {
  ID?: number | null;
  Identifier?: string | null;
  Title?: string | null;
  ShortDescription?: string | null;
  LongDescription?: string | null;
  DefaultPresentation?: string | null;
  DefaultSelection?: string | null;
  Frequency?: string | null;
  Period?: string | null;
  Modified?: string | null;
  ReasonDelivery?: string | null;
  OutputStatus?: string | null;
  ExplanatoryText?: string | null;
  'odata.etag'?: string | null;
  [key: string]: unknown;
}

/**
 * OData v3 metadata response envelope.
 * Returned by GET /ODataApi/odata/{table_id}/TableInfos
 */
export interface CbsTableMetadataResponse {
  'odata.metadata'?: string;
  value: CbsTableInfo[];
}

/**
 * A single data row from TypedDataSet.
 * Field names match dimension/measure codes in the table (vary per table).
 */
export type CbsDataRow = Record<string, unknown>;

/**
 * OData v3 TypedDataSet response envelope.
 * Returned by GET /ODataApi/odata/{table_id}/TypedDataSet?$top=...
 */
export interface CbsDataResponse {
  'odata.metadata'?: string;
  'odata.nextLink'?: string | null;
  value: CbsDataRow[];
}
