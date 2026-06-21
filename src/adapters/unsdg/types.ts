// UN SDG API response types (UC-457)

export interface UnsdgGoal {
  code: string;
  title: string;
  description: string;
  uri: string;
}

export interface UnsdgTarget {
  goal: string;
  code: string;
  title: string;
  description: string;
  uri: string;
}

export interface UnsdgIndicatorSeries {
  goal: string[];
  target: string[];
  indicator: string[];
  release: string;
  code: string;
  description: string;
  uri: string;
}

export interface UnsdgIndicator {
  goal: string;
  target: string;
  code: string;
  description: string;
  tier: string;
  uri: string;
  series: UnsdgIndicatorSeries[] | null;
}

export interface UnsdgGeoArea {
  geoAreaCode: string;
  geoAreaName: string;
}

export interface UnsdgDataRecord {
  goal: string[];
  target: string[];
  indicator: string[];
  series: string;
  seriesDescription: string;
  seriesCount: string;
  geoAreaCode: string;
  geoAreaName: string;
  timePeriodStart: number;
  value: string;
  valueType: string;
  time_detail: string | null;
  timeCoverage: string | null;
  upperBound: string | null;
  lowerBound: string | null;
  basePeriod: string | null;
  source: string | null;
  geoInfoUrl: string | null;
  footnotes: string[];
  attributes: Record<string, string>;
  dimensions: Record<string, string>;
}

export interface UnsdgDataPage {
  size: number;
  totalElements: number;
  totalPages: number;
  pageNumber: number;
  data: UnsdgDataRecord[];
}
