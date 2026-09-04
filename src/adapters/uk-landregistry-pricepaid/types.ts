// ---------------------------------------------------------------------------
// Raw HM Land Registry Price Paid Data (Linked Data API) response shapes.
// landregistry.data.gov.uk/data/ppi — a Linked Data API (LDA) over an RDF
// triple store: every response wraps a "format/version/result" envelope and
// every non-literal field (estateType, propertyType, recordStatus,
// transactionCategory) is itself a labelled resource, not a plain string.
// ---------------------------------------------------------------------------

/** A labelled RDF resource, e.g. { "_about": "...", "prefLabel": [{ "_value": "Freehold" }] }. */
export interface LabelledResourceRaw {
  _about: string;
  prefLabel?: Array<{ _value: string }>;
}

export interface PropertyAddressRaw {
  _about: string;
  paon?: string;
  saon?: string;
  street?: string;
  locality?: string;
  town?: string;
  district?: string;
  county?: string;
  postcode?: string;
}

/** One item in a transaction-record.json list ("current" view of a transaction). */
export interface TransactionRecordRaw {
  _about: string;
  transactionId: string;
  pricePaid: number;
  /** RFC-2822-ish date string, e.g. "Fri, 17 May 1996". */
  transactionDate: string;
  newBuild: boolean;
  estateType?: LabelledResourceRaw;
  propertyType?: LabelledResourceRaw;
  recordStatus?: LabelledResourceRaw;
  transactionCategory?: LabelledResourceRaw;
  propertyAddress?: PropertyAddressRaw;
}

export interface TransactionRecordListResponse {
  result: {
    items: TransactionRecordRaw[];
    itemsPerPage: number;
    page: number;
    startIndex?: number;
    next?: string;
  };
}

/** GET /data/ppi/transaction/{id}.json returns [Transaction, TransactionRecord] as items. */
export interface TransactionDetailResponse {
  result: {
    items: Array<{ _about: string; transactionId?: string; pricePaid?: number }>;
  };
}

// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface PricePaidAddress {
  paon: string | null;
  saon: string | null;
  street: string | null;
  locality: string | null;
  town: string | null;
  district: string | null;
  county: string | null;
  postcode: string | null;
}

export interface PricePaidTransaction {
  transaction_id: string;
  price_paid: number;
  transaction_date: string;
  property_type: string | null;
  estate_type: string | null;
  new_build: boolean;
  address: PricePaidAddress;
}

export interface PricePaidSearchOutput {
  total_returned: number;
  page: number;
  page_size: number;
  has_more: boolean;
  results: PricePaidTransaction[];
}
