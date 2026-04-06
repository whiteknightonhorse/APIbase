// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface BillSummary {
  congress: number;
  type: string;
  number: number;
  title: string;
  sponsor: string;
  party: string;
  introduced_date: string;
  latest_action: string;
  latest_action_date: string;
  policy_area: string;
  url: string;
}

export interface CongressBillsOutput {
  total: number;
  results: BillSummary[];
}

export interface BillAction {
  date: string;
  text: string;
  type: string;
}

export interface CongressBillDetailOutput {
  congress: number;
  type: string;
  number: number;
  title: string;
  introduced_date: string;
  sponsor: string;
  sponsor_party: string;
  sponsor_state: string;
  cosponsors_count: number;
  latest_action: string;
  latest_action_date: string;
  policy_area: string;
  subjects: string[];
  actions: BillAction[];
  committees: string[];
  url: string;
}

export interface MemberSummary {
  bioguide_id: string;
  name: string;
  party: string;
  state: string;
  district: string | null;
  chamber: string;
  served: string;
  url: string;
}

export interface CongressMembersOutput {
  total: number;
  results: MemberSummary[];
}
