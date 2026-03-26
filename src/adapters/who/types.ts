/** WHO Global Health Observatory OData API response types (UC-193). */

export interface ODataResponse<T> {
  '@odata.context'?: string;
  value: T[];
}

export interface WhoIndicator {
  IndicatorCode: string;
  IndicatorName: string;
  Language: string;
}

export interface WhoDataPoint {
  Id: number;
  IndicatorCode: string;
  SpatialDimType: string;
  SpatialDim: string;
  TimeDimType: string;
  TimeDim: string;
  Dim1Type: string | null;
  Dim1: string | null;
  Dim2Type: string | null;
  Dim2: string | null;
  Dim3Type: string | null;
  Dim3: string | null;
  DataSourceDimType: string | null;
  DataSourceDim: string | null;
  Value: string;
  NumericValue: number | null;
  Low: number | null;
  High: number | null;
  Comments: string | null;
}

export interface WhoCountry {
  Code: string;
  Title: string;
  ParentCode: string | null;
  ParentTitle: string | null;
}
