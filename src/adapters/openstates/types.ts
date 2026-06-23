// ---------------------------------------------------------------------------
// OpenStates v3 API raw response types (UC-498)
// ---------------------------------------------------------------------------

export interface OpenStatesPagination {
  per_page: number;
  page: number;
  max_page: number;
  total_items: number;
}

// --- People ---

export interface OpenStatesParty {
  name: string;
}

export interface OpenStatesCurrentRole {
  title: string;
  org_classification: string;
  district: string | null;
  division_id: string | null;
}

export interface OpenStatesJurisdictionRef {
  id: string;
  name: string;
  classification: string;
}

export interface OpenStatesPerson {
  id: string;
  name: string;
  party: OpenStatesParty[];
  current_role: OpenStatesCurrentRole | null;
  jurisdiction: OpenStatesJurisdictionRef;
  given_name: string;
  family_name: string;
  image: string;
  email: string | null;
  gender: string;
  birth_date: string | null;
  death_date: string | null;
  extras: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  openstates_url: string;
}

export interface OpenStatesPeopleResponse {
  results: OpenStatesPerson[];
  pagination: OpenStatesPagination;
}

// --- Bills ---

export interface OpenStatesBillSummary {
  id: string;
  session: string;
  jurisdiction: OpenStatesJurisdictionRef;
  from_organization: { classification: string } | null;
  identifier: string;
  title: string;
  classification: string[];
  subject: string[];
  extras: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  openstates_url: string;
  first_action_date: string | null;
  latest_action_date: string | null;
  latest_action_description: string | null;
  latest_passage_date: string | null;
}

export interface OpenStatesBillAction {
  organization: { name: string; classification: string } | null;
  description: string;
  date: string;
  classification: string[];
  order: number;
}

export interface OpenStatesBillSponsorship {
  name: string;
  entity_type: string;
  organization_id: string | null;
  person_id: string | null;
  primary: boolean;
  classification: string;
}

export interface OpenStatesBillAbstract {
  abstract: string;
  note: string;
  date: string;
}

export interface OpenStatesBillVote {
  id: string;
  identifier: string;
  motion_text: string;
  motion_classification: string[];
  start_date: string;
  result: string;
  organization: { name: string; classification: string } | null;
  counts: Array<{ option: string; value: number }>;
}

export interface OpenStatesBillDetail extends OpenStatesBillSummary {
  abstracts: OpenStatesBillAbstract[];
  actions: OpenStatesBillAction[];
  sponsorships: OpenStatesBillSponsorship[];
  votes: OpenStatesBillVote[];
}

export interface OpenStateBillsResponse {
  results: OpenStatesBillSummary[];
  pagination: OpenStatesPagination;
}

// --- Committees ---

export interface OpenStatesCommitteeMember {
  name: string;
  role: string;
  person: { id: string; name: string } | null;
}

export interface OpenStatesCommittee {
  id: string;
  name: string;
  classification: string;
  chamber: string;
  jurisdiction: OpenStatesJurisdictionRef;
  parent: { name: string } | null;
  sources: Array<{ url: string; note: string }>;
  created_at: string;
  updated_at: string;
  memberships?: OpenStatesCommitteeMember[];
}

export interface OpenStatesCommitteesResponse {
  results: OpenStatesCommittee[];
  pagination: OpenStatesPagination;
}
