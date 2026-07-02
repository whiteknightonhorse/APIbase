// Statistics Finland PxWeb API — raw response types (UC-571)

export interface PxVariable {
  code: string;
  text: string;
  values: string[];
  valueTexts: string[];
  time?: boolean;
}

export interface PxTableMetadata {
  title: string;
  variables: PxVariable[];
}

export interface PxTableListItem {
  id: string;
  type: string;
  text: string;
  updated?: string;
}

// json-stat2 format returned by POST /table queries
export interface JsonStat2Response {
  version: string;
  class: string;
  label: string;
  source: string;
  updated: string;
  id: string[];
  size: number[];
  dimension: Record<
    string,
    {
      label: string;
      category: {
        index?: Record<string, number>;
        label: Record<string, string>;
      };
    }
  >;
  value: (number | null)[];
  note?: string[];
}

export interface StatfinDataPoint {
  period: string;
  value: number | null;
  label?: string;
}

export interface StatfinOutput {
  title: string;
  source: string;
  updated: string;
  indicator: string;
  unit?: string;
  total_records: number;
  records: StatfinDataPoint[];
}

export interface StatfinTableListOutput {
  category: string;
  total: number;
  tables: Array<{
    id: string;
    title: string;
    updated?: string;
  }>;
}
