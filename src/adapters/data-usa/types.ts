/**
 * Data USA raw API response types (UC-737).
 * Tesseract OLAP server backing https://datausa.io — US public data
 * (Census/ACS, BLS, IPEDS, etc.) exposed as browsable "cubes".
 * https://datausa.io/about/api/
 */

export interface DataUsaCubeAnnotations {
  topic?: string;
  subtopic?: string;
  dataset_name?: string;
  dataset_link?: string;
  source_name?: string;
  source_description?: string;
  [key: string]: unknown;
}

export interface DataUsaCubeMeasure {
  name: string;
  caption: string;
  aggregator?: string;
  annotations?: Record<string, unknown>;
}

export interface DataUsaCubeLevel {
  name: string;
  caption: string;
  depth?: number;
  properties?: Array<{ name: string; caption: string }>;
}

export interface DataUsaCubeHierarchy {
  name: string;
  caption: string;
  levels: DataUsaCubeLevel[];
}

export interface DataUsaCubeDimension {
  name: string;
  caption: string;
  type?: string;
  hierarchies: DataUsaCubeHierarchy[];
}

export interface DataUsaCube {
  name: string;
  caption: string;
  annotations: DataUsaCubeAnnotations;
  dimensions: DataUsaCubeDimension[];
  measures?: DataUsaCubeMeasure[];
}

export interface DataUsaCubesResponse {
  cubes: DataUsaCube[];
}

export interface DataUsaDataResponse {
  annotations: DataUsaCubeAnnotations;
  page: { limit: number; offset: number; total: number };
  columns: string[];
  data: Array<Record<string, string | number | null>>;
}

export interface DataUsaMember {
  key: string;
  caption: string;
}

export interface DataUsaMembersResponse {
  name: string;
  caption: string;
  depth?: number;
  properties?: Array<{ name: string; caption: string }>;
  members: DataUsaMember[];
}
