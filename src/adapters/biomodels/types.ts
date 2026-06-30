// Raw API response types for BioModels REST API (biomodels.org)

export interface BioModelsSearchRaw {
  matches: number;
  models: BioModelsModelSummaryRaw[];
  queryParameters: {
    numResults: number;
    offset: number;
    sortBy: string;
    sortDirection: string;
  };
}

export interface BioModelsModelSummaryRaw {
  id: string;
  name: string;
  format: string;
  submissionDate: string | null;
  lastModified: string | null;
  submitter: string;
  url: string;
}

export interface BioModelsModelDetailRaw {
  name: string;
  description: string;
  format: {
    name: string;
    identifier: string;
    version: string;
  };
  publication: {
    type: string;
    accession: string;
    journal: string;
    title: string;
    synopsis: string;
    year: number;
    month: string;
    volume: string;
    issue: string;
    pages: string;
    link: string;
    authors: Array<{ name: string; institution?: string; orcid?: string }>;
  } | null;
  files: {
    main: BioModelsFileRaw[];
    additional: BioModelsFileRaw[];
  };
  history: {
    revisions: Array<{ version: number; submitted: string; submitter: string }>;
  } | null;
  firstPublished: string | null;
  submissionId: string;
  curationStatus: string;
  modellingApproach: { name: string; accession: string; resource: string } | null;
  contributors: Record<
    string,
    Array<{
      name: string;
      email?: string;
      affiliation?: string;
      orcid?: string;
      external?: boolean;
    }>
  >;
  modelLevelAnnotations: Array<{
    qualifier: string;
    accession: string;
    resource: string;
    uri: string;
  }>;
}

export interface BioModelsFileRaw {
  name: string;
  description: string;
  fileSize: string;
  mimeType: string;
  md5sum: string;
  sha1sum?: string;
  sha256sum?: string;
}

// Normalized output types

export interface BioModelsModelSummary {
  id: string;
  name: string;
  format: string;
  submission_date: string | null;
  last_modified: string | null;
  submitter: string;
  url: string;
}

export interface BioModelsSearchOutput {
  total: number;
  returned: number;
  models: BioModelsModelSummary[];
}

export interface BioModelsAuthor {
  name: string;
  institution?: string;
  orcid?: string;
}

export interface BioModelsAnnotation {
  qualifier: string;
  resource: string;
  accession: string;
  uri: string;
}

export interface BioModelsModelDetailOutput {
  id: string;
  name: string;
  curation_status: string;
  modelling_approach: string | null;
  format: string;
  format_version: string;
  first_published: string | null;
  description_text: string;
  publication: {
    pmid: string | null;
    title: string;
    journal: string;
    year: number;
    authors: BioModelsAuthor[];
    link: string;
  } | null;
  contributors: Record<string, string[]>;
  annotations: BioModelsAnnotation[];
  main_files: string[];
  additional_files: string[];
}

export interface BioModelsFileEntry {
  name: string;
  description: string;
  mime_type: string;
  size_bytes: number;
  md5: string;
  download_url: string;
}

export interface BioModelsFilesOutput {
  id: string;
  main: BioModelsFileEntry[];
  additional: BioModelsFileEntry[];
}

export interface BioModelsLatestOutput {
  total_curated: number;
  returned: number;
  models: BioModelsModelSummary[];
}
