/**
 * DuckDuckGo Instant Answer API response types (UC-637).
 *
 * API host: api.duckduckgo.com
 * Auth: none
 * Free tier: unlimited (no documented rate limit)
 */

export interface DuckDuckGoInfoboxContentItem {
  data_type: string;
  label: string;
  value: string;
  wiki_order?: number;
}

export interface DuckDuckGoInfobox {
  content?: DuckDuckGoInfoboxContentItem[];
  meta?: unknown[];
}

export interface DuckDuckGoIcon {
  URL: string;
  Height: number | string;
  Width: number | string;
}

export interface DuckDuckGoRelatedTopic {
  FirstURL?: string;
  Icon?: DuckDuckGoIcon;
  Result?: string;
  Text?: string;
  Name?: string;
  Topics?: DuckDuckGoRelatedTopic[];
}

export interface DuckDuckGoInstantAnswerResponse {
  Abstract: string;
  AbstractSource: string;
  AbstractText: string;
  AbstractURL: string;
  Answer: string;
  AnswerType: string;
  Definition: string;
  DefinitionSource: string;
  DefinitionURL: string;
  Entity: string;
  Heading: string;
  Image: string;
  Infobox: DuckDuckGoInfobox | [];
  Redirect: string;
  RelatedTopics: DuckDuckGoRelatedTopic[];
  Results: DuckDuckGoRelatedTopic[];
  Type: string;
}
