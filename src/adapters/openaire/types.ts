/**
 * OpenAIRE Graph API v1 raw response types (UC-622).
 * https://api.openaire.eu/graph/v1
 */

export interface OpenaireHeader {
  numFound: number;
  maxScore?: number | null;
  queryTime?: number;
  page?: number;
  pageSize?: number;
}

export interface OpenaireSearchResponse<T> {
  header: OpenaireHeader;
  results: T[] | null;
}

export interface OpenaireLabeledCode {
  code?: string | null;
  label?: string | null;
}

export interface OpenaireAuthor {
  fullName?: string | null;
  name?: string | null;
  surname?: string | null;
  rank?: number | null;
}

export interface OpenairePid {
  scheme?: string | null;
  value?: string | null;
}

export interface OpenaireResearchProduct {
  id: string;
  type?: string | null;
  mainTitle?: string | null;
  subTitle?: string | null;
  descriptions?: string[] | null;
  authors?: OpenaireAuthor[] | null;
  publicationDate?: string | null;
  publisher?: string | null;
  language?: OpenaireLabeledCode | null;
  bestAccessRight?: OpenaireLabeledCode | null;
  sources?: string[] | null;
  pids?: OpenairePid[] | null;
  originalIds?: string[] | null;
}

export interface OpenaireFundingStream {
  id?: string | null;
  description?: string | null;
}

export interface OpenaireFunding {
  shortName?: string | null;
  name?: string | null;
  jurisdiction?: string | null;
  fundingStream?: OpenaireFundingStream | null;
}

export interface OpenaireProject {
  id: string;
  code?: string | null;
  acronym?: string | null;
  title?: string | null;
  websiteUrl?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  callIdentifier?: string | null;
  keywords?: string | null;
  summary?: string | null;
  fundings?: OpenaireFunding[] | null;
}

export interface OpenaireOrganization {
  id: string;
  legalShortName?: string | null;
  legalName?: string | null;
  websiteUrl?: string | null;
  alternativeNames?: string[] | null;
  country?: OpenaireLabeledCode | null;
}
