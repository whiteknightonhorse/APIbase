/** Europe PMC REST API response types (UC-490). */

export interface EuropepmcJournalInfo {
  issue?: string;
  volume?: string;
  journalIssueId?: number;
  dateOfPublication?: string;
  monthOfPublication?: number;
  yearOfPublication?: number;
  printPublicationDate?: string;
  journal?: {
    title?: string;
    medlineAbbreviation?: string;
    essn?: string;
    issn?: string;
    isoabbreviation?: string;
    nlmid?: string;
  };
}

export interface EuropepmcAuthor {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  initials?: string;
  affiliation?: string;
  authorId?: { type: string; value: string };
}

export interface EuropepmcArticle {
  id: string;
  source: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title?: string;
  authorString?: string;
  authorList?: { author: EuropepmcAuthor[] };
  journalInfo?: EuropepmcJournalInfo;
  pubYear?: string;
  abstractText?: string;
  affiliation?: string;
  publicationStatus?: string;
  language?: string;
  pubTypeList?: { pubType: string[] };
  isOpenAccess?: string;
  inEPMC?: string;
  inPMC?: string;
  hasPDF?: string;
  citedByCount?: number;
  hasReferences?: string;
  hasTextMinedTerms?: string;
  dateOfCreation?: string;
  firstPublicationDate?: string;
  electronicPublicationDate?: string;
  pageInfo?: string;
  keywordList?: { keyword: string[] };
  meshHeadingList?: { meshHeading: Array<{ majorTopic_YN: string; descriptorName: string }> };
}

export interface EuropepmcSearchResponse {
  version?: string;
  hitCount: number;
  nextCursorMark?: string;
  request?: {
    query?: string;
    resultType?: string;
    cursorMark?: string;
    pageSize?: number;
    sort?: string;
    synonym?: boolean;
  };
  resultList: {
    result: EuropepmcArticle[];
  };
}

export interface EuropepmcCitation {
  id?: string;
  source?: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title?: string;
  authorString?: string;
  journalAbbreviation?: string;
  pubYear?: string;
  volume?: string;
  issue?: string;
  pageInfo?: string;
  citationType?: string;
}

export interface EuropepmcCitationsResponse {
  version?: string;
  hitCount: number;
  request?: Record<string, unknown>;
  citationList?: {
    citation: EuropepmcCitation[];
  };
}

export interface EuropepmcReference {
  id?: string;
  source?: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title?: string;
  authorString?: string;
  journalAbbreviation?: string;
  pubYear?: string;
  volume?: string;
  issue?: string;
  pageInfo?: string;
}

export interface EuropepmcReferencesResponse {
  version?: string;
  hitCount: number;
  request?: Record<string, unknown>;
  referenceList?: {
    reference: EuropepmcReference[];
  };
}
