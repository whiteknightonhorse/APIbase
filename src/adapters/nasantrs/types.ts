export interface NtrsAuthorAffiliation {
  sequence: number;
  submissionId: number;
  meta: {
    author: {
      name: string;
    };
    organization?: {
      name: string;
    };
  };
}

export interface NtrsDownload {
  draft: boolean;
  mimetype: string;
  name: string;
  type: string;
  links: {
    original: string;
    pdf?: string;
    fulltext?: string;
  };
}

export interface NtrsCenter {
  code: string;
  name: string;
  id: string;
}

export interface NtrsPublication {
  submissionId: number;
  id: string;
  publicationName?: string;
  volume?: string;
  issue?: string;
  startPage?: string;
  endPage?: string;
}

export interface NtrsCitation {
  id: number;
  title: string;
  abstract?: string;
  stiType: string;
  stiTypeDetails?: string;
  distribution: string;
  submittedDate: string;
  distributionDate?: string;
  modified?: string;
  created?: string;
  center?: NtrsCenter;
  authorAffiliations?: NtrsAuthorAffiliation[];
  keywords?: string[];
  subjectCategories?: string[];
  downloads?: NtrsDownload[];
  downloadsAvailable?: boolean;
  publications?: NtrsPublication[];
  otherReportNumbers?: string[];
  onlyAbstract?: boolean;
  status?: string;
}

export interface NtrsSearchStats {
  took: number;
  total: number;
  estimate: boolean;
  maxScore: number | null;
}

export interface NtrsAggBucket {
  key: string;
  doc_count: number;
}

export interface NtrsAggField {
  buckets: NtrsAggBucket[];
}

export interface NtrsAggregations {
  stiType?: NtrsAggField;
  subjectCategory?: NtrsAggField;
  center?: NtrsAggField;
  author?: NtrsAggField;
  keyword?: NtrsAggField;
}

export interface NtrsSearchResponse {
  stats: NtrsSearchStats;
  results: NtrsCitation[];
  aggregations?: NtrsAggregations;
}
