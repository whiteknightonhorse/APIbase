// ---------------------------------------------------------------------------
// Statistics Canada Web Data Service (WDS) — raw response types
// ---------------------------------------------------------------------------

/** A cube (table) entry from getAllCubesListLite */
export interface StatCanCubeListItem {
  productId: number;
  cansimId?: string;
  cubeTitleEn: string;
  cubeTitleFr?: string;
  cubeStartDate: string;
  cubeEndDate: string;
  releaseTime?: string;
  archived?: string;
  subjectCode?: string[];
  surveyCode?: string[];
  frequencyCode?: number;
}

/** Member (dimension category) in cube metadata */
export interface StatCanMember {
  memberId: number;
  memberNameEn?: string;
  memberNameFr?: string;
  classificationCode?: string;
  classificationTypeCode?: string;
  geoLevel?: number;
  vintage?: number;
  parentMemberId?: number[];
  terminated?: number;
  memberUomCode?: number;
}

/** Dimension in cube metadata */
export interface StatCanDimension {
  dimensionPositionId: number;
  dimensionNameEn?: string;
  dimensionNameFr?: string;
  hasUom?: number;
  member?: StatCanMember[];
}

/** Footnote in cube metadata */
export interface StatCanFootnote {
  footnoteId?: number;
  footnoteTextEn?: string;
  footnoteTextFr?: string;
}

/** Full cube metadata object */
export interface StatCanCubeMetadata {
  productId: number;
  cansimId?: string;
  cubeTitleEn: string;
  cubeTitleFr?: string;
  cubeStartDate?: string;
  cubeEndDate?: string;
  releaseTime?: string;
  archived?: string;
  subjectCode?: string[];
  surveyCode?: string[];
  frequencyCode?: number;
  dimension?: StatCanDimension[];
  footnote?: StatCanFootnote[];
  correctionFootnote?: StatCanFootnote[];
  correction?: unknown[];
}

/** Series (vector) info */
export interface StatCanSeriesInfo {
  responseStatusCode?: number;
  productId: number;
  coordinate?: string;
  vectorId: number;
  frequencyCode?: number;
  scalarFactorCode?: number;
  decimals?: number;
  terminated?: number;
  SeriesTitleEn?: string;
  SeriesTitleFr?: string;
  memberUomCode?: number;
}

/** A single observation data point */
export interface StatCanDataPoint {
  refPer: string;
  refPer2?: string;
  value: number | null;
  decimals?: number;
  scalarFactorCode?: number;
  symbolCode?: number;
  statusCode?: number;
  releaseTime?: string;
  frequencyCode?: number;
}

/** Vector data object returned by getDataFromVectorsAndLatestNPeriods */
export interface StatCanVectorData {
  responseStatusCode?: number;
  productId?: number;
  coordinate?: string;
  vectorId: number;
  vectorDataPoint?: StatCanDataPoint[];
}

/** Standard WDS API response wrapper */
export interface StatCanApiResponse<T> {
  status: string;
  object: T;
}

// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

/** A normalized catalog search result entry */
export interface StatCanTableEntry {
  product_id: number;
  cansim_id: string;
  title: string;
  start_date: string;
  end_date: string;
  archived: boolean;
  frequency: string;
  subjects: string[];
}

/** Normalized series (vector) data point */
export interface StatCanObservation {
  ref_period: string;
  value: number | null;
  release_time?: string;
}

/** Normalized series data response */
export interface StatCanSeriesDataOutput {
  vector_id: number;
  product_id: number;
  coordinate: string;
  title: string;
  observations: StatCanObservation[];
  periods_returned: number;
}
