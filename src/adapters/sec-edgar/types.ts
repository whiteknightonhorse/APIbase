// Raw response types for the SEC EDGAR company facts API (data.sec.gov, www.sec.gov).

export interface SecTickerEntryRaw {
  cik_str: number;
  ticker: string;
  title: string;
}

// company_tickers.json is a numerically-keyed object, not an array.
export type SecTickersFileRaw = Record<string, SecTickerEntryRaw>;

export interface SecAddressRaw {
  street1?: string;
  street2?: string;
  city?: string;
  stateOrCountry?: string;
  zipCode?: string;
  stateOrCountryDescription?: string;
}

export interface SecRecentFilingsRaw {
  accessionNumber: string[];
  filingDate: string[];
  reportDate: string[];
  form: string[];
  primaryDocument: string[];
  primaryDocDescription: string[];
  isXBRL: number[];
}

export interface SecSubmissionsApiResponse {
  cik: string;
  name: string;
  sic?: string;
  sicDescription?: string;
  ein?: string;
  description?: string;
  website?: string;
  category?: string;
  fiscalYearEnd?: string;
  stateOfIncorporation?: string;
  addresses?: { mailing?: SecAddressRaw; business?: SecAddressRaw };
  tickers?: string[];
  exchanges?: string[];
  filings: {
    recent: SecRecentFilingsRaw;
  };
}

export interface SecConceptUnitEntryRaw {
  end: string;
  val: number;
  accn: string;
  fy: number;
  fp: string;
  form: string;
  filed: string;
  start?: string;
  frame?: string;
}

export interface SecCompanyConceptApiResponse {
  cik: number;
  taxonomy: string;
  tag: string;
  label?: string;
  description?: string;
  entityName: string;
  units: Record<string, SecConceptUnitEntryRaw[]>;
}
