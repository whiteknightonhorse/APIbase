/**
 * TypeScript interfaces for USAJOBS API responses (UC-415).
 *
 * Search endpoint wraps all results in a SearchResult envelope.
 * Codelist endpoint returns a CodeList envelope with Items array.
 */

// ---------------------------------------------------------------------------
// Search Endpoint Types
// ---------------------------------------------------------------------------

export interface UsajobsPositionLocation {
  LocationName: string;
  CountryCode: string;
  CountrySubDivisionCode: string;
  CityName: string;
  Longitude: number;
  Latitude: number;
}

export interface UsajobsRemuneration {
  MinimumRange: string;
  MaximumRange: string;
  Description: string;
  CurrencyCode: string;
}

export interface UsajobsMatchedObjectDescriptor {
  PositionID: string;
  PositionTitle: string;
  PositionURI: string;
  ApplyURI: string[];
  PositionLocationDisplay: string;
  PositionLocation: UsajobsPositionLocation[];
  OrganizationName: string;
  DepartmentName: string;
  JobCategory: { Name: string; Code: string }[];
  JobGrade: { Code: string }[];
  PositionSchedule: { Name: string; Code: string }[];
  PositionOfferingType: { Name: string; Code: string }[];
  QualificationSummary: string;
  PositionRemuneration: UsajobsRemuneration[];
  PositionStartDate: string;
  PositionEndDate: string;
  PublicationStartDate: string;
  ApplicationCloseDate: string;
  PositionFormattedDescription: { Content: string; IsRaw: boolean }[];
  UserArea?: {
    Details?: {
      JobSummary?: string;
      WhoMayApply?: { Name: string; Code: string };
      LowGrade?: string;
      HighGrade?: string;
      PromotionPotential?: string;
      SubAgencyName?: string;
      SecurityClearance?: string;
      DrugTestRequired?: string;
      TeleworkEligible?: boolean;
      RemoteIndicator?: boolean;
      Relocation?: string;
      TotalOpenings?: string;
      HiringPath?: string[];
    };
  };
}

export interface UsajobsSearchItem {
  MatchedObjectId: string;
  MatchedObjectDescriptor: UsajobsMatchedObjectDescriptor;
  RelevanceRank: number;
}

export interface UsajobsSearchResult {
  SearchParameters: Record<string, unknown>;
  SearchResultCount: number;
  SearchResultCountAll: number;
  SearchResultItems: UsajobsSearchItem[];
}

export interface UsajobsSearchEnvelope {
  LanguageCode: string;
  SearchParameters: Record<string, unknown>;
  SearchResult: UsajobsSearchResult;
}

// ---------------------------------------------------------------------------
// Codelist Endpoint Types
// ---------------------------------------------------------------------------

export interface UsajobsCodeItem {
  Code: string;
  Value: string;
  ParentCode?: string;
}

export interface UsajobsCodeList {
  CodeList: {
    ValidValue: UsajobsCodeItem[];
    id: string;
  }[];
  DateGenerated: string;
  Status: string;
}
