/**
 * US Consumer Product Safety Commission (CPSC) SaferProducts.gov REST API types (UC-562).
 *
 * API host: www.saferproducts.gov
 * Auth: None (US Government open data, public domain — 15 USC §2051 et seq.)
 *
 * Endpoints:
 *   /RestWebServices/Recall?format=json  — search/retrieve recall notices
 *
 * Note: pager.count and pager.offset parameters are accepted but the API always
 * returns all matching records in a single response. Pagination is client-side only.
 */

export interface CpscProduct {
  Name: string;
  Description: string;
  Model: string;
  Type: string;
  CategoryID: string;
  NumberOfUnits: string;
}

export interface CpscImage {
  URL: string;
  Caption: string;
}

export interface CpscNameEntry {
  Name: string;
}

export interface CpscHazard {
  Name: string;
  HazardType: string;
  HazardTypeID: string;
}

export interface CpscRemedyOption {
  Option: string;
}

export interface CpscCompanyEntry {
  Name: string;
  CompanyID: string;
}

export interface CpscCountryEntry {
  Country: string;
}

export interface CpscUpc {
  UPC: string;
}

export interface CpscRecall {
  RecallID: number;
  RecallNumber: string;
  RecallDate: string;
  Description: string;
  URL: string;
  Title: string;
  ConsumerContact: string;
  LastPublishDate: string;
  Products: CpscProduct[];
  Inconjunctions: CpscNameEntry[];
  Images: CpscImage[];
  Injuries: CpscNameEntry[];
  Manufacturers: CpscCompanyEntry[];
  Retailers: CpscCompanyEntry[];
  Importers: CpscCompanyEntry[];
  Distributors: CpscCompanyEntry[];
  SoldAtLabel: string | null;
  ManufacturerCountries: CpscCountryEntry[];
  ProductUPCs: CpscUpc[];
  Hazards: CpscHazard[];
  Remedies: CpscNameEntry[];
  RemedyOptions: CpscRemedyOption[];
}

export type CpscRecallList = CpscRecall[];
