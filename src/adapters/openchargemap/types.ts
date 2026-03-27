/**
 * Open Charge Map API response types (UC-214).
 */

export interface OcmAddressInfo {
  Title: string;
  AddressLine1?: string;
  Town?: string;
  StateOrProvince?: string;
  Postcode?: string;
  Country?: { ISOCode: string; Title: string };
  Latitude: number;
  Longitude: number;
  DistanceUnit?: number;
  Distance?: number;
}

export interface OcmConnection {
  ConnectionTypeID?: number;
  ConnectionType?: { Title: string };
  StatusTypeID?: number;
  StatusType?: { Title: string };
  LevelID?: number;
  Level?: { Title: string };
  PowerKW?: number;
  CurrentTypeID?: number;
  CurrentType?: { Title: string };
  Quantity?: number;
}

export interface OcmOperatorInfo {
  ID: number;
  Title: string;
  WebsiteURL?: string;
  IsPrivateIndividual?: boolean;
}

export interface OcmPoi {
  ID: number;
  UUID?: string;
  AddressInfo: OcmAddressInfo;
  Connections?: OcmConnection[];
  OperatorInfo?: OcmOperatorInfo;
  UsageCost?: string;
  NumberOfPoints?: number;
  StatusTypeID?: number;
  StatusType?: { Title: string };
  DateLastStatusUpdate?: string;
  DataProviderID?: number;
  IsRecentlyVerified?: boolean;
  DateLastVerified?: string;
}

export type OcmPoiListResponse = OcmPoi[];
