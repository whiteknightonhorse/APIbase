/**
 * Federal Register API response types (UC-605).
 *
 * API host: www.federalregister.gov
 * Auth: None (US Government open data, public domain — GPO/NARA).
 *
 * Endpoints:
 *   /api/v1/documents.json                       — full-text/parametric search
 *   /api/v1/documents/{document_number}.json      — single document detail
 *   /api/v1/agencies.json                         — full agency list
 *   /api/v1/public-inspection-documents/current.json — upcoming (not yet published) documents
 */

export interface FederalRegisterAgencyRef {
  raw_name: string;
  name: string;
  id: number;
  url: string;
  json_url: string;
  parent_id: number | null;
  slug: string;
}

export interface FederalRegisterDocumentSummary {
  title: string;
  type: string;
  abstract: string | null;
  document_number: string;
  html_url: string;
  pdf_url: string | null;
  publication_date: string;
  agencies: FederalRegisterAgencyRef[];
}

export interface FederalRegisterSearchResponse {
  count: number;
  description: string;
  total_pages: number;
  next_page_url: string | null;
  results: FederalRegisterDocumentSummary[];
}

export interface FederalRegisterCfrReference {
  title: number;
  part: string;
  chapter: string | null;
  citation_url: string | null;
}

export interface FederalRegisterDocumentDetail {
  document_number: string;
  title: string;
  type: string;
  abstract: string | null;
  action: string | null;
  agencies: FederalRegisterAgencyRef[];
  citation: string | null;
  comment_url: string | null;
  comments_close_on: string | null;
  dates: string | null;
  docket_ids: string[];
  effective_on: string | null;
  cfr_references: FederalRegisterCfrReference[];
  html_url: string;
  pdf_url: string | null;
  body_html_url: string | null;
  full_text_xml_url: string | null;
  publication_date: string;
  executive_order_number: number | null;
  significant: boolean | null;
  start_page: number;
  end_page: number;
}

export interface FederalRegisterAgency {
  id: number;
  name: string;
  short_name: string | null;
  slug: string;
  parent_id: number | null;
  agency_url: string | null;
  url: string;
  json_url: string;
}

export type FederalRegisterAgenciesResponse = FederalRegisterAgency[];

export interface FederalRegisterPublicInspectionDocument {
  document_number: string;
  title: string;
  type: string;
  filing_type: string;
  filed_at: string;
  publication_date: string;
  html_url: string;
  pdf_url: string | null;
  agencies: FederalRegisterAgencyRef[];
}

export interface FederalRegisterPublicInspectionResponse {
  count: number;
  results: FederalRegisterPublicInspectionDocument[];
}
