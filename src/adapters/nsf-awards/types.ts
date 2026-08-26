// Raw response types for the NSF Awards Search API (api.nsf.gov/services/v1/awards.json).

export interface NsfAwardRaw {
  id: string;
  title: string;
  abstractText?: string;
  agency?: string;
  awardee?: string;
  awardeeName?: string;
  awardeeCity?: string;
  awardeeStateCode?: string;
  awardeeCountryCode?: string;
  awardeeZipCode?: string;
  cfdaNumber?: string;
  date?: string;
  startDate?: string;
  expDate?: string;
  initAmendmentDate?: string;
  latestAmendmentDate?: string;
  estimatedTotalAmt?: string;
  fundsObligatedAmt?: string;
  fundsObligated?: string[];
  fundProgramName?: string;
  program?: string;
  progRefCode?: string;
  progEleCode?: string;
  dirAbbr?: string;
  divAbbr?: string;
  orgLongName?: string;
  orgLongName2?: string;
  orgUrl?: string;
  transType?: string;
  activeAwd?: string;
  histAwd?: string;
  publicAccessMandate?: string;
  ueiNumber?: string;
  pi?: string[];
  piFirstName?: string;
  piLastName?: string;
  piEmail?: string;
  coPDPI?: string[];
  poName?: string;
  poEmail?: string;
  poPhone?: string;
  perfCity?: string;
  perfStateCode?: string;
  perfCountryCode?: string;
}

export interface NsfAwardsApiResponse {
  response: {
    award?: NsfAwardRaw[];
    metadata?: {
      offset: number;
      rpp: number;
      totalCount: number;
    };
    serviceNotification?: Array<{
      notificationCode: string;
      notificationMessage: string;
      notificationType: string;
    }>;
  };
}
