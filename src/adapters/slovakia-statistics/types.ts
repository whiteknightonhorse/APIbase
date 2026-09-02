/**
 * Slovak Statistical Office (Statistical Office of the Slovak Republic, "DATAcube.") JSON-stat
 * API v2 types (UC-667).
 *
 * Response shapes per REST_API_HELP_EN.pdf (data.statistics.sk/api/help/) and the JSON-stat 2.0
 * spec (https://json-stat.org/). Category can legitimately be an empty array `[]` — the upstream
 * API returns this (instead of an object) when a requested dimension value has no match, e.g. a
 * year outside the published range. Every consumer of `category` must check `Array.isArray()`
 * before reading `.index`/`.label`.
 */

export interface SkCategory {
  index: Record<string, number>;
  label?: Record<string, string>;
}

export interface SkCollectionItemDimension {
  label: string;
  note?: string;
  href: string;
}

export interface SkCollectionItem {
  class: string;
  href: string;
  // Absent for ~40 of 675 tables (confirmed live) — upstream data quirk, not a parsing bug.
  label?: string;
  update?: string;
  dimension: Record<string, SkCollectionItemDimension>;
}

export interface SkCollectionResponse {
  version: string;
  class: string;
  label: string;
  href: string;
  link: { item: SkCollectionItem[] };
}

export interface SkDimensionResponse {
  class: string;
  version: string;
  label: string;
  note?: string;
  category: SkCategory | [];
}

export interface SkDatasetDimension {
  label: string;
  note?: string;
  category: SkCategory | [];
}

export interface SkDatasetResponse {
  version: string;
  class: string;
  label: string;
  update?: string;
  note?: string;
  href: string;
  id: string[];
  size: number[];
  role: { time?: string[]; geo?: string[]; metric: string[] };
  dimension: Record<string, SkDatasetDimension>;
  value: Array<number | null>;
}

export interface SkErrorResponse {
  status: number;
  status_message: string;
}
