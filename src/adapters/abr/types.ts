/** Raw ABN/ACN details from abr.business.gov.au/json/AbnDetails.aspx or AcnDetails.aspx */
export interface AbrEntityResponse {
  Abn: string;
  AbnStatus: string;
  AbnStatusEffectiveFrom: string;
  Acn: string;
  AddressDate: string | null;
  AddressPostcode: string;
  AddressState: string;
  BusinessName: string[];
  EntityName: string;
  EntityTypeCode: string;
  EntityTypeName: string;
  Gst: string | null;
  Message: string;
}

/** One entry in a name-search results list */
export interface AbrNameEntry {
  Abn: string;
  AbnStatus: string;
  IsCurrent: boolean;
  Name: string;
  NameType: string;
  Postcode: string;
  Score: number;
  State: string;
}

/** Raw name-search response from abr.business.gov.au/json/MatchingNames.aspx */
export interface AbrNameSearchResponse {
  Message: string;
  Names: AbrNameEntry[];
}
