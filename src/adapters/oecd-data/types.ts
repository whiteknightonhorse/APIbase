// Raw response shapes for the OECD SDMX public REST API (sdmx.oecd.org).
// Only the fields actually consumed by the adapter are typed.

export interface SdmxLocalizedText {
  [lang: string]: string;
}

export interface SdmxDataflow {
  id: string;
  version: string;
  agencyID: string;
  name?: string;
  names?: SdmxLocalizedText;
}

export interface SdmxDataflowMessage {
  data: {
    dataflows: SdmxDataflow[];
  };
}

export interface SdmxCodelistCode {
  id: string;
  name?: string;
  names?: SdmxLocalizedText;
}

export interface SdmxCodelist {
  id: string;
  agencyID: string;
  version: string;
  name?: string;
  names?: SdmxLocalizedText;
  codes?: SdmxCodelistCode[];
}

export interface SdmxDimension {
  id: string;
  position: number;
  type: 'Dimension' | 'TimeDimension';
  localRepresentation?: {
    enumeration?: string;
  };
}

export interface SdmxDataStructure {
  id: string;
  agencyID: string;
  version: string;
  name?: string;
  names?: SdmxLocalizedText;
  dataStructureComponents?: {
    dimensionList?: {
      dimensions?: SdmxDimension[];
      timeDimensions?: SdmxDimension[];
    };
  };
}

export interface SdmxStructureMessage {
  data: {
    dataflows?: SdmxDataflow[];
    codelists?: SdmxCodelist[];
    dataStructures?: SdmxDataStructure[];
  };
}

export interface SdmxDimensionValue {
  id: string;
  name?: string;
  names?: SdmxLocalizedText;
  start?: string;
  end?: string;
}

export interface SdmxStructureDimension {
  id: string;
  keyPosition: number;
  name?: string;
  names?: SdmxLocalizedText;
  values: SdmxDimensionValue[];
}

export interface SdmxSeries {
  attributes: unknown[];
  observations: Record<string, Array<number | string | null>>;
}

export interface SdmxDataMessage {
  data: {
    dataSets: Array<{
      series?: Record<string, SdmxSeries>;
    }>;
    structure: {
      name?: string;
      names?: SdmxLocalizedText;
      dimensions: {
        series?: SdmxStructureDimension[];
        observation?: SdmxStructureDimension[];
      };
    };
  };
}
