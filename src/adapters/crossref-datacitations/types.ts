// ---------------------------------------------------------------------------
// Raw CrossRef Data Citations API response shapes (api.crossref.org/beta/datacitations)
// ---------------------------------------------------------------------------

export interface DataCitationParty {
  id: string;
  type: string;
  member?: string;
  'registration-agency'?: string;
}

export interface DataCitationItem {
  timestamp: string;
  relation: string;
  subject: DataCitationParty;
  object: DataCitationParty;
}

export interface DataCitationsMessage {
  'total-results': number;
  'next-page': number | null;
  'items-per-page': number;
  items: DataCitationItem[];
}

export interface DataCitationsResponse {
  status: string;
  'message-type': string;
  message: DataCitationsMessage;
}

// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface DataCitationEvent {
  relation: string;
  timestamp: string;
  citing_work_doi: string;
  citing_work_type: string;
  citing_work_member_id: string | null;
  dataset_doi: string;
  dataset_registration_agency: string | null;
}

export interface DataCitationsOutput {
  total: number;
  has_more: boolean;
  results: DataCitationEvent[];
}
