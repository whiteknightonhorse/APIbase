export interface TreasurySecurityRecord {
  cusip: string;
  issueDate: string;
  securityType: string;
  securityTerm: string;
  maturityDate: string;
  interestRate: string;
  refCpiOnIssueDate: string;
  announcementDate: string;
  auctionDate: string;
  highYield: string;
  highDiscountRate: string;
  highInvestmentRate: string;
  highPrice: string;
  bidToCoverRatio: string;
  totalAccepted: string;
  totalTendered: string;
  cashManagementBillCMB: string;
  auctionFormat: string;
  closingTimeCompetitive: string;
  indexRatioOnIssueDate: string;
  pricePer100: string;
  floatingRate: string;
  spread: string;
  [key: string]: string;
}

export interface AuctionResultsOutput {
  type: string;
  days: number;
  count: number;
  securities: TreasurySecurityRecord[];
}

export interface UpcomingAuctionsOutput {
  count: number;
  upcoming: TreasurySecurityRecord[];
}

export interface CusipSearchOutput {
  cusip: string;
  count: number;
  securities: TreasurySecurityRecord[];
}

export interface TipsRatesOutput {
  days: number;
  count: number;
  tips: Array<{
    cusip: string;
    securityTerm: string;
    auctionDate: string;
    issueDate: string;
    maturityDate: string;
    interestRate: string;
    highYield: string;
    refCpiOnIssueDate: string;
    indexRatioOnIssueDate: string;
    bidToCoverRatio: string;
    totalAccepted: string;
  }>;
}
