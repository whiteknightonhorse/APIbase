/**
 * USDA AMS MARS (MyMarketNews) API types (UC-528).
 * Source: https://marsapi.ams.usda.gov/services/v3.1/public
 * License: Public domain (US Government data)
 */

export interface MarsReport {
  id: number;
  fileName: string;
  fileExtension: string;
  publishedDate: string;
  publishedDateMilliseconds: number;
  reportBeginDate: string;
  reportEndDate: string;
  reportTitle: string;
  correction: boolean;
  final: boolean;
}

export interface MarsReportsResponse {
  createdDate: string;
  numberOfReports: number;
  reports: MarsReport[];
}
