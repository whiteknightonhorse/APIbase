/**
 * UN Comtrade Public Preview API response types (UC-534).
 *
 * API host: comtradeapi.un.org (Azure API Management)
 * Auth: None (public endpoints, 500 calls/day limit)
 * Docs: https://uncomtrade.org/docs/un-comtrade-api/
 */

// ---------------------------------------------------------------------------
// Shared envelope returned by preview, availability, and metadata endpoints
// ---------------------------------------------------------------------------

export interface ComtradeEnvelope<T> {
  elapsedTime: string;
  count: number;
  data: T[];
  error: string;
}

// ---------------------------------------------------------------------------
// Trade data record (preview endpoint)
// ---------------------------------------------------------------------------

export interface ComtradeTradeRecord {
  typeCode: string;
  freqCode: string;
  refPeriodId: number;
  refYear: number;
  refMonth: number;
  period: string;
  reporterCode: number;
  reporterISO: string;
  reporterDesc: string;
  flowCode: string;
  flowDesc: string;
  partnerCode: number;
  partnerISO: string;
  partnerDesc: string;
  partner2Code?: number;
  partner2ISO?: string;
  partner2Desc?: string;
  classificationCode: string;
  classificationSearchCode: string;
  isOriginalClassification: boolean;
  cmdCode: string;
  cmdDesc: string;
  aggrLevel: number;
  isLeaf: boolean;
  customsCode: string;
  customsDesc: string;
  mosCode?: string;
  motCode?: number;
  motDesc?: string;
  qtyUnitCode: number;
  qtyUnitAbbr: string;
  qty: number;
  isQtyEstimated: boolean;
  altQtyUnitCode?: number;
  altQtyUnitAbbr?: string;
  altQty?: number;
  isAltQtyEstimated?: boolean;
  netWgt?: number;
  isNetWgtEstimated?: boolean;
  grossWgt?: number;
  isGrossWgtEstimated?: boolean;
  cifvalue?: number;
  fobvalue?: number;
  primaryValue?: number;
  legacyEstimationFlag?: number;
  isReported?: boolean;
  isAggrAbove?: boolean;
  isAggrBelow?: boolean;
}

export type ComtradeTradeResponse = ComtradeEnvelope<ComtradeTradeRecord>;

// ---------------------------------------------------------------------------
// Data availability record (getDA endpoint)
// ---------------------------------------------------------------------------

export interface ComtradeAvailabilityRecord {
  datasetCode: number;
  typeCode: string;
  freqCode: string;
  period: string | number;
  reporterCode: number;
  reporterISO: string;
  reporterDesc: string;
  classificationCode: string;
  classificationSearchCode: string;
  isOriginalClassification: boolean;
  isExtendedFlowCode: boolean;
  isExtendedPartnerCode: boolean;
  isExtendedPartner2Code: boolean;
  isExtendedCmdCode: boolean;
  isExtendedCustomsCode: boolean;
  isExtendedMotCode: boolean;
  totalRecords: number;
  datasetChecksum: number;
  firstReleased: string;
  lastReleased: string;
}

export type ComtradeAvailabilityResponse = ComtradeEnvelope<ComtradeAvailabilityRecord>;

// ---------------------------------------------------------------------------
// Dataset metadata record (getMetadata endpoint)
// ---------------------------------------------------------------------------

export interface ComtradeMetadataNote {
  datasetCode: number;
  typeCode: string;
  freqCode: string;
  period: string | number;
  reporterCode: number;
  reporterDescription: string;
  currency: string;
  importConvFactor: string;
  exportConvFactor: string;
  tradeSystem: string;
  classificationCode: string;
  importValuation: string;
  exportValuation: string;
  importPartnerCountry: string;
  exportPartnerCountry: string;
  importPartner2Country: string;
  exportPartner2Country: string;
  publicationNote: string;
  publicationDate: string;
}

export interface ComtradeMetadataRecord {
  reporterCode: number;
  period: string | number;
  typeCode: string;
  freqCode: string;
  datasetCode: number;
  notes: ComtradeMetadataNote[];
}

export type ComtradeMetadataResponse = ComtradeEnvelope<ComtradeMetadataRecord>;

// ---------------------------------------------------------------------------
// Reporter reference file
// ---------------------------------------------------------------------------

export interface ComtradeReporter {
  id: number;
  text: string;
  reporterCode: number;
  reporterDesc: string;
  reporterNote: string;
  reporterCodeIsoAlpha2: string;
  reporterCodeIsoAlpha3: string;
  entryEffectiveDate: string;
  isGroup: boolean;
}

export interface ComtradeReportersFile {
  results: ComtradeReporter[];
}
