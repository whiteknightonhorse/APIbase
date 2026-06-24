// SA National Treasury Municipal Finance API (UC-519) — raw response types

export interface MuniMunicipality {
  'municipality.demarcation_code': string;
  'municipality.name': string;
  'municipality.long_name': string;
  'municipality.parent_code': string;
  'municipality.province_name': string;
  'municipality.province_code': string;
  'municipality.category': string;
  'municipality.miif_category': string;
  'municipality.postal_address_1'?: string;
  'municipality.postal_address_2'?: string;
  'municipality.postal_address_3'?: string;
  'municipality.phone_number'?: string;
  'municipality.url'?: string;
  area?: number;
}

export interface MuniAuditOpinion {
  'demarcation.code': string;
  'demarcation.label': string;
  'financial_year_end.year': number;
  'opinion.code': string;
  'opinion.label': string;
  'opinion.report_url'?: string;
}

export interface MuniIncExp {
  'demarcation.code': string;
  'demarcation.label': string;
  'item.code': string;
  'item.label': string;
  'item.return_form_structure'?: string;
  'financial_year_end.year': number;
  'period_length.length': string;
  'amount_type.code': string;
  'amount_type.label': string;
  amount: number | null;
}

export interface MuniOfficial {
  'municipality.demarcation_code': string;
  'role.role': string;
  'contact_details.name': string;
  'contact_details.title'?: string;
  'contact_details.email_address'?: string;
  'contact_details.phone_number'?: string;
}

export interface MuniApiResponse<T> {
  status?: string;
  total_fact_count: number;
  data: T[];
}

// Normalised output types

export interface MunicipalityRecord {
  demarcation_code: string;
  name: string;
  long_name: string;
  province_name: string;
  province_code: string;
  category: string;
  phone?: string;
  url?: string;
}

export interface MunicipalitiesOutput {
  total: number;
  municipalities: MunicipalityRecord[];
}

export interface AuditOpinionRecord {
  demarcation_code: string;
  municipality_name: string;
  year: number;
  opinion_code: string;
  opinion_label: string;
  report_url?: string;
}

export interface AuditOpinionsOutput {
  total: number;
  opinions: AuditOpinionRecord[];
}

export interface IncExpRecord {
  item_code: string;
  item_label: string;
  year: number;
  amount_type: string;
  amount_type_label: string;
  amount: number | null;
}

export interface IncExpOutput {
  demarcation_code: string;
  municipality_name: string;
  total_records: number;
  items: IncExpRecord[];
}

export interface OfficialRecord {
  role: string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
}

export interface OfficialsOutput {
  demarcation_code: string;
  total: number;
  officials: OfficialRecord[];
}
