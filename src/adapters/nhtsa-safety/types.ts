/**
 * NHTSA Safety API response types (UC-219).
 * Covers recalls, complaints, safety ratings, and investigations.
 * Distinct from vPIC (VIN decoder) — different API domain.
 */

export interface NhtsaRecallResult {
  NHTSACampaignNumber: string;
  Manufacturer: string;
  Summary: string;
  Consequence: string;
  Remedy: string;
  ModelYear: string;
  Make: string;
  Model: string;
  ReportReceivedDate: string;
  Component: string;
  PotentialNumberOfUnitsAffected?: string;
}

export interface NhtsaRecallsResponse {
  Count: number;
  Message: string;
  results: NhtsaRecallResult[];
}

export interface NhtsaComplaintResult {
  odiNumber: number;
  manufacturer: string;
  crash: boolean;
  fire: boolean;
  numberOfInjuries: number;
  numberOfDeaths: number;
  dateOfIncident: string;
  dateComplaintFiled: string;
  components: string;
  summary: string;
  vin?: string;
}

export interface NhtsaComplaintsResponse {
  count: number;
  message: string;
  results: NhtsaComplaintResult[];
}

export interface NhtsaSafetyRatingResult {
  VehicleId: number;
  VehicleDescription: string;
  OverallRating?: string;
  OverallFrontCrashRating?: string;
  OverallSideCrashRating?: string;
  RolloverRating?: string;
  ComplaintsCount?: number;
  RecallsCount?: number;
  InvestigationCount?: number;
}

export interface NhtsaRatingsResponse {
  Count: number;
  Message: string;
  Results: NhtsaSafetyRatingResult[];
}

export interface NhtsaInvestigationResult {
  id: number;
  investigationNumber: string;
  investigationType: string;
  description: string;
  nhtsaId: string;
  latestActivityDate: string;
  issueYear: number;
}

export interface NhtsaInvestigationsResponse {
  meta?: Record<string, unknown>;
  results: NhtsaInvestigationResult[];
}
