// Swiss Federal Statistics Office (FSO/BFS) PxWeb API types — UC-526

export interface SwissFsoDatabaseEntry {
  dbid: string;
  text: string;
}

export interface SwissFsoTableEntry {
  id: string;
  type: string;
  text: string;
  updated: string;
}

export interface SwissFsoVariable {
  code: string;
  text: string;
  values: string[];
  valueTexts: string[];
  elimination?: boolean;
}

export interface SwissFsoTableMetadata {
  title: string;
  variables: SwissFsoVariable[];
}

export interface SwissFsoQueryFilter {
  code: string;
  values: string[];
}

export interface SwissFsoJsonStat2 {
  class: string;
  id: string[];
  size: number[];
  value: (number | null)[];
  dimension?: Record<
    string,
    {
      label: string;
      category?: {
        index?: Record<string, number>;
        label?: Record<string, string>;
      };
    }
  >;
}
