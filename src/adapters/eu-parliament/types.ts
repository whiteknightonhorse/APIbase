export interface EpMepListItem {
  id: string;
  type: string;
  identifier: string;
  label?: string;
  familyName?: string;
  givenName?: string;
  sortLabel?: string;
  'api:country-of-representation'?: string;
  'api:political-group'?: string;
}

export interface EpMepListResponse {
  data: EpMepListItem[];
  '@context': unknown;
}

export interface EpMembershipPeriod {
  id?: string;
  type?: string;
  endDate?: string;
  startDate?: string;
}

export interface EpMembership {
  id: string;
  type: string;
  identifier?: string;
  notation_codictFunctionId?: string;
  memberDuring?: EpMembershipPeriod;
  organization?: string;
  role?: string;
  membershipClassification?: string;
  contactPoint?: unknown[];
}

export interface EpMepDetail {
  id: string;
  type: string;
  identifier?: string;
  label?: string;
  familyName?: string;
  givenName?: string;
  sortLabel?: string;
  bday?: string;
  hasGender?: string;
  hasHonorificPrefix?: string;
  notation_codictPersonId?: string;
  hasMembership?: EpMembership[];
}

export interface EpMepDetailResponse {
  data: EpMepDetail[];
  '@context': unknown;
}

export interface EpAdoptedTextItem {
  id: string;
  type: string;
  adopts?: string[];
  parliamentary_term?: string;
  document_date?: string;
  is_about?: string[];
  is_realized_by?: unknown[];
}

export interface EpAdoptedTextsResponse {
  data: EpAdoptedTextItem[];
  '@context': unknown;
}

export interface EpProcedureItem {
  id: string;
  type: string;
  process_id?: string;
  process_type?: string;
  label?: string;
}

export interface EpProceduresResponse {
  data: EpProcedureItem[];
  '@context': unknown;
}
