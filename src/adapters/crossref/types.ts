// ---------------------------------------------------------------------------
// Raw CrossRef REST API response shapes (api.crossref.org)
// ---------------------------------------------------------------------------

export interface CrossrefAuthor {
  given?: string;
  family?: string;
  name?: string;
}

export interface CrossrefWork {
  DOI: string;
  type?: string;
  title?: string[];
  author?: CrossrefAuthor[];
  publisher?: string;
  'container-title'?: string[];
  issued?: { 'date-parts'?: number[][] };
  URL?: string;
  'is-referenced-by-count'?: number;
  abstract?: string;
}

export interface CrossrefWorksMessage {
  'total-results': number;
  items: CrossrefWork[];
}

export interface CrossrefWorksResponse {
  message: CrossrefWorksMessage;
}

export interface CrossrefJournalCounts {
  'current-dois': number;
  'backfile-dois': number;
  'total-dois': number;
}

export interface CrossrefJournal {
  title?: string;
  publisher?: string;
  ISSN?: string[];
  subjects?: string[];
  counts?: CrossrefJournalCounts;
}

export interface CrossrefJournalResponse {
  message: CrossrefJournal;
}

export interface CrossrefFunder {
  id: string;
  name: string;
  location?: string;
  uri?: string;
  'alt-names'?: string[];
}

export interface CrossrefFundersMessage {
  'total-results': number;
  items: CrossrefFunder[];
}

export interface CrossrefFundersResponse {
  message: CrossrefFundersMessage;
}

export interface CrossrefMember {
  id: number;
  'primary-name': string;
  location?: string;
  names?: string[];
  prefixes?: string[];
  counts?: CrossrefJournalCounts;
}

export interface CrossrefMembersMessage {
  'total-results': number;
  items: CrossrefMember[];
}

export interface CrossrefMembersResponse {
  message: CrossrefMembersMessage;
}

// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface CrossrefWorkItem {
  doi: string;
  title: string;
  authors: string[];
  type: string;
  publisher: string;
  container_title: string | null;
  published_date: string | null;
  url: string | null;
  citation_count: number;
  abstract: string | null;
}

export interface CrossrefWorksSearchOutput {
  total: number;
  results: CrossrefWorkItem[];
}

export interface CrossrefJournalOutput {
  issn: string;
  title: string;
  publisher: string;
  subjects: string[];
  total_dois: number;
  current_dois: number;
  backfile_dois: number;
}

export interface CrossrefFunderItem {
  funder_id: string;
  name: string;
  alt_names: string[];
  location: string | null;
  uri: string | null;
}

export interface CrossrefFunderSearchOutput {
  total: number;
  results: CrossrefFunderItem[];
}

export interface CrossrefMemberItem {
  member_id: number;
  primary_name: string;
  location: string | null;
  total_dois: number;
  current_dois: number;
  prefixes: string[];
}

export interface CrossrefMemberSearchOutput {
  total: number;
  results: CrossrefMemberItem[];
}
