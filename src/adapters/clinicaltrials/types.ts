/**
 * ClinicalTrials.gov v2 API response types (UC-531).
 */

export interface CtStudyIdentification {
  nctId: string;
  briefTitle?: string;
  officialTitle?: string;
  organization?: {
    fullName?: string;
    class?: string;
  };
}

export interface CtStatusModule {
  overallStatus?: string;
  startDateStruct?: { date?: string; type?: string };
  primaryCompletionDateStruct?: { date?: string; type?: string };
  completionDateStruct?: { date?: string; type?: string };
  studyFirstPostDateStruct?: { date?: string };
  lastUpdatePostDateStruct?: { date?: string };
  statusVerifiedDate?: string;
}

export interface CtSponsorModule {
  leadSponsor?: { name?: string; class?: string };
  collaborators?: Array<{ name?: string; class?: string }>;
  responsibleParty?: { type?: string; investigatorFullName?: string };
}

export interface CtDescriptionModule {
  briefSummary?: string;
  detailedDescription?: string;
}

export interface CtConditionsModule {
  conditions?: string[];
  keywords?: string[];
}

export interface CtDesignModule {
  studyType?: string;
  phases?: string[];
  designInfo?: {
    allocation?: string;
    interventionModel?: string;
    primaryPurpose?: string;
    maskingInfo?: { masking?: string };
  };
  enrollmentInfo?: { count?: number; type?: string };
}

export interface CtArmGroup {
  label?: string;
  type?: string;
  description?: string;
  interventionNames?: string[];
}

export interface CtIntervention {
  type?: string;
  name?: string;
  description?: string;
  armGroupLabels?: string[];
}

export interface CtOutcome {
  measure?: string;
  description?: string;
  timeFrame?: string;
}

export interface CtEligibilityModule {
  eligibilityCriteria?: string;
  healthyVolunteers?: boolean;
  sex?: string;
  minimumAge?: string;
  maximumAge?: string;
  stdAges?: string[];
}

export interface CtContactsModule {
  centralContacts?: Array<{ name?: string; role?: string; phone?: string; email?: string }>;
  overallOfficials?: Array<{ name?: string; role?: string; affiliation?: string }>;
}

export interface CtLocationsModule {
  locations?: Array<{
    facility?: string;
    city?: string;
    state?: string;
    country?: string;
    geoPoint?: { lat?: number; lon?: number };
  }>;
}

export interface CtProtocolSection {
  identificationModule?: CtStudyIdentification;
  statusModule?: CtStatusModule;
  sponsorCollaboratorsModule?: CtSponsorModule;
  descriptionModule?: CtDescriptionModule;
  conditionsModule?: CtConditionsModule;
  designModule?: CtDesignModule;
  armsInterventionsModule?: {
    armGroups?: CtArmGroup[];
    interventions?: CtIntervention[];
  };
  outcomesModule?: {
    primaryOutcomes?: CtOutcome[];
    secondaryOutcomes?: CtOutcome[];
  };
  eligibilityModule?: CtEligibilityModule;
  contactsLocationsModule?: CtContactsModule & CtLocationsModule;
}

export interface CtStudy {
  protocolSection?: CtProtocolSection;
  hasResults?: boolean;
}

export interface CtSearchResponse {
  studies?: CtStudy[];
  nextPageToken?: string;
  totalCount?: number;
}

export interface CtStatsResponse {
  totalStudies?: number;
  averageSizeBytes?: number;
}
