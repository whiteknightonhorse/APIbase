// ---------------------------------------------------------------------------
// Raw HathiTrust Bibliographic API response shapes (catalog.hathitrust.org)
// ---------------------------------------------------------------------------
// The API is quirky: `records` and `titles`/`isbns`/etc. are keyed objects
// when at least one match exists, but the upstream serializes them as an
// EMPTY ARRAY (`[]`) instead of an empty object (`{}`) when there are zero
// matches (PHP associative-array-to-JSON behavior). Every "dict-shaped"
// field below must therefore be typed as `X | never[]` and defensively
// normalized before use — see `asRecordMap()`/`asArray()` in index.ts.

export interface HathiTrustBriefRecord {
  recordURL?: string;
  titles?: string[];
  isbns?: string[];
  issns?: string[];
  oclcs?: string[];
  lccns?: string[];
  publishDates?: string[];
  /** Present only on the `full` endpoint — raw MARC-XML for this record. */
  'marc-xml'?: string;
}

export interface HathiTrustItem {
  orig?: string;
  fromRecord?: string;
  htid?: string;
  itemURL?: string;
  rightsCode?: string;
  lastUpdate?: string;
  enumcron?: string | false;
  usRightsString?: string;
}

export interface HathiTrustQueryResult {
  records?: Record<string, HathiTrustBriefRecord> | never[];
  items?: HathiTrustItem[] | never[];
}

/** Top-level response: keyed by the queried `id_type:id_value` string. */
export type HathiTrustVolumesResponse = Record<string, HathiTrustQueryResult>;

// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface HathiTrustRecordSummary {
  record_id: string;
  record_url: string | null;
  title: string | null;
  isbns: string[];
  issns: string[];
  oclcs: string[];
  lccns: string[];
  publish_dates: string[];
}

export interface HathiTrustItemSummary {
  htid: string | null;
  contributing_library: string | null;
  item_url: string | null;
  rights_code: string | null;
  us_rights: string | null;
  last_update: string | null;
}

export interface HathiTrustLookupOutput {
  query: string;
  found: boolean;
  records: HathiTrustRecordSummary[];
  items: HathiTrustItemSummary[];
}

export interface HathiTrustBatchLookupOutput {
  results: HathiTrustLookupOutput[];
}

/** MARC-XML fields parsed out for the full-record tool (see parseMarcXml). */
export interface HathiTrustMarcFields {
  authors: string[];
  publisher: string | null;
  publish_place: string | null;
  physical_description: string | null;
  subjects: string[];
  language: string | null;
}

export interface HathiTrustFullRecordOutput extends HathiTrustLookupOutput {
  marc: HathiTrustMarcFields | null;
}
