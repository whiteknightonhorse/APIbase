/** Raw shapes from the Statbel beSTAT public REST API (bestat.statbel.fgov.be/bestat/api). */

/** One entry from GET /views (a curated, ready-to-query cross-tab; ~1300 total, one per locale). */
export interface StatbelView {
  id: string;
  name: string;
  standard: boolean;
  dataSourceId: string;
  locale: string;
  inapplicable: boolean;
  lastChangeDate: number;
  lastPublishDate: number;
  published: boolean;
  note?: string | null;
}

/** One entry from GET /datasources (a raw statistical dataset; ~180 total, may back several views). */
export interface StatbelDataSource {
  id: string;
  name: string;
  descriptions: Record<string, string>;
  supportedLocales: string[];
  defaultLocale: string;
  category: string;
  internal: boolean;
  fullySummarized: boolean;
  published: boolean;
  lastDataUpdateDate: number;
  lastPublishDate: number;
  lastMetadataDataUpdateDate: number;
}

/** GET /views/{id}/result/JSON — array of flat fact rows, columns vary per view. */
export type StatbelViewFacts = Array<Record<string, string | number>>;
