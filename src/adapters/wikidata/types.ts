/** Wikidata API raw response types (UC-323). */

export interface WikidataSearchResult {
  id: string;
  label: string;
  description: string;
  url: string;
}

export interface WikidataSearchOutput {
  results: {
    id: string;
    label: string;
    description: string;
    url: string;
  }[];
  count: number;
}

export interface WikidataEntityOutput {
  id: string;
  label: string;
  description: string;
  aliases: string[];
  properties: Record<string, unknown>;
  url: string;
}
