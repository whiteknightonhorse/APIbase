// DataCite REST API response types (UC-458)

export interface DataCiteDoiAttributes {
  doi: string;
  prefix: string;
  suffix: string;
  url: string | null;
  titles: Array<{ title: string; titleType?: string; lang?: string }>;
  creators: Array<{
    name: string;
    nameType?: string;
    givenName?: string;
    familyName?: string;
    affiliation?: Array<{ name: string }>;
    nameIdentifiers?: Array<{ nameIdentifier: string; nameIdentifierScheme: string }>;
  }>;
  publisher: string | null;
  publicationYear: number | null;
  types: {
    resourceTypeGeneral?: string;
    resourceType?: string;
    schemaOrg?: string;
  };
  subjects: Array<{ subject: string; subjectScheme?: string; lang?: string }>;
  descriptions: Array<{ description: string; descriptionType?: string; lang?: string }>;
  fundingReferences: Array<{
    funderName?: string;
    funderIdentifier?: string;
    awardNumber?: string;
    awardTitle?: string;
  }>;
  rightsList: Array<{ rights?: string; rightsUri?: string }>;
  relatedIdentifiers: Array<{
    relatedIdentifier: string;
    relatedIdentifierType: string;
    relationType: string;
  }>;
  dates: Array<{ date: string; dateType?: string }>;
  language: string | null;
  formats: string[];
  sizes: string[];
  version: string | null;
  viewCount: number;
  downloadCount: number;
  citationCount: number;
  referenceCount: number;
  state: string;
  created: string;
  registered: string | null;
  updated: string;
}

export interface DataCiteDoiItem {
  id: string;
  type: string;
  attributes: DataCiteDoiAttributes;
}

export interface DataCiteDoiResponse {
  data: DataCiteDoiItem;
}

export interface DataCiteSearchMeta {
  total: number;
  totalPages: number;
  page: number;
  resourceTypes?: Array<{ id: string; title: string; count: number }>;
  years?: Array<{ id: string; title: string; count: number }>;
  providers?: Array<{ id: string; title: string; count: number }>;
  clients?: Array<{ id: string; title: string; count: number }>;
  funders?: Array<{ id: string; title: string; count: number }>;
}

export interface DataCiteSearchResponse {
  data: DataCiteDoiItem[];
  meta: DataCiteSearchMeta;
}

export interface DataCiteClientAttributes {
  name: string;
  symbol: string;
  description: string | null;
  contactEmail: string | null;
  url: string | null;
  doiCount: number;
  created: string;
  updated: string;
}

export interface DataCiteClientItem {
  id: string;
  type: string;
  attributes: DataCiteClientAttributes;
}

export interface DataCiteClientSearchResponse {
  data: DataCiteClientItem[];
  meta: {
    total: number;
    totalPages: number;
    page: number;
  };
}

export interface DataCiteWorksStatsResponse {
  meta: DataCiteSearchMeta & {
    registered?: Array<{ id: string; title: string; count: number }>;
    'data-centers'?: Array<{ id: string; title: string; count: number }>;
  };
}
