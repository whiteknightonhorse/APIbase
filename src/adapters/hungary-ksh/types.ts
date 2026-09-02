/** One entry from `GET https://data.ksh.hu/datasets.json` — the full HVD (High Value Dataset) list. */
export interface KshDatasetListEntry {
  id: string;
  titles: { hu?: string; en?: string };
  keywords?: { hu?: string[]; en?: string[] };
  themes?: { hu?: string[]; en?: string[] };
}

/** One `dcat:Distribution` parsed out of a dataset's `metadata.rdf`. */
export interface KshDistribution {
  distribution_id: string;
  title_hu: string | null;
  title_en: string | null;
  description_en: string | null;
  format: string | null;
  download_url: string | null;
  temporal_start: string | null;
  temporal_end: string | null;
  license: string | null;
}

/** Parsed `metadata.rdf` for one dataset. */
export interface KshDatasetMetadata {
  dataset_id: string;
  title_hu: string | null;
  title_en: string | null;
  description_en: string | null;
  distributions: KshDistribution[];
}

/** Generic header + rows table produced by both the CSV and SDMX-ML parsers. */
export interface KshParsedTable {
  header: string[];
  rows: string[][];
}
