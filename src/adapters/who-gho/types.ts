export interface WhoIndicator {
  IndicatorCode: string;
  IndicatorName: string;
  Language: string;
  FullName?: string | null;
  MeasurementMethod?: string | null;
  Definition?: string | null;
  IndicatorScheme?: string | null;
}

export interface WhoDataValue {
  Id: number;
  IndicatorCode: string;
  SpatialDimType?: string | null;
  SpatialDim?: string | null;
  TimeDimType?: string | null;
  TimeDim?: number | null;
  Dim1Type?: string | null;
  Dim1?: string | null;
  Dim2Type?: string | null;
  Dim2?: string | null;
  Dim3Type?: string | null;
  Dim3?: string | null;
  Value?: string | null;
  NumericValue?: number | null;
  Low?: number | null;
  High?: number | null;
  Comments?: string | null;
  Date?: string | null;
  TimeDimensionValue?: string | null;
  TimeDimensionBegin?: string | null;
  TimeDimensionEnd?: string | null;
}

export interface WhoDimensionValue {
  Code: string;
  Title: string;
  ParentDimension?: string | null;
  ParentCode?: string | null;
  ParentTitle?: string | null;
  DisplaySequence?: number | null;
}

export interface WhoIndicatorSearchOutput {
  total: number;
  indicators: Array<{
    code: string;
    name: string;
    full_name: string | null;
    definition: string | null;
  }>;
}

export interface WhoIndicatorDataOutput {
  indicator_code: string;
  total: number;
  values: Array<{
    country: string | null;
    year: number | null;
    value: string | null;
    numeric_value: number | null;
    low: number | null;
    high: number | null;
    sex: string | null;
    age_group: string | null;
  }>;
}

export interface WhoCountryHealthOutput {
  country_code: string;
  year: number | null;
  total: number;
  values: Array<{
    indicator_code: string;
    value: string | null;
    numeric_value: number | null;
    year: number | null;
    sex: string | null;
  }>;
}

export interface WhoDimensionValuesOutput {
  dimension: string;
  total: number;
  values: Array<{
    code: string;
    title: string;
    parent_code: string | null;
  }>;
}
