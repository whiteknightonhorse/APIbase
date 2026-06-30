/**
 * NLM Clinical Tables ICD-11 search API response.
 * Format: [total_matches, codes, extra_fields, display_records]
 * Each display record: [code, title, type] where type is "stem" or "extension".
 */
export type Icd11ApiResponse = [
  number,
  string[] | null,
  Record<string, string[]> | null,
  [string, string, string][] | null,
];

export interface Icd11Result {
  code: string;
  title: string;
  type: string;
}
