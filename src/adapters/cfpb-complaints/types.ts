/**
 * CFPB Consumer Complaint Database API response types (UC-614).
 *
 * API host: www.consumerfinance.gov
 * Auth: None (US Government open data, public domain — Consumer Financial Protection Bureau).
 *
 * Endpoints:
 *   /data-research/consumer-complaints/search/api/v1/         — full-text/parametric complaint search
 *   /data-research/consumer-complaints/search/api/v1/trends   — complaint volume trend over time
 *   /data-research/consumer-complaints/search/api/v1/geo/states — per-state complaint aggregation
 */

export interface CfpbComplaintSource {
  complaint_id: string;
  product: string;
  sub_product: string | null;
  issue: string;
  sub_issue: string | null;
  complaint_what_happened: string;
  date_received: string;
  date_sent_to_company: string;
  company: string;
  state: string | null;
  zip_code: string | null;
  company_response: string;
  company_public_response: string | null;
  timely: string;
  consumer_disputed?: string | null;
  tags: string | null;
  submitted_via: string;
  has_narrative: boolean;
}

export interface CfpbComplaintHit {
  _id: string;
  _score: number | null;
  _source: CfpbComplaintSource;
}

export interface CfpbSearchResponse {
  hits: {
    total: { value: number; relation: string };
    hits: CfpbComplaintHit[];
  };
}

export interface CfpbAggBucket {
  key: string;
  doc_count: number;
}

export interface CfpbTrendBucket {
  key: number;
  key_as_string: string;
  doc_count: number;
  [nestedAgg: string]: unknown;
}

export interface CfpbTrendsResponse {
  hits: {
    total: { value: number; relation: string };
  };
  aggregations: {
    dateRangeBrush?: {
      dateRangeBrush: { buckets: CfpbTrendBucket[] };
    };
    [otherAgg: string]: unknown;
  };
}

export interface CfpbGeoStateBucket {
  key: string;
  doc_count: number;
  product?: { buckets: CfpbAggBucket[] };
  issue?: { buckets: CfpbAggBucket[] };
}

export interface CfpbGeoStatesResponse {
  hits: {
    total: { value: number; relation: string };
  };
  aggregations: {
    state: {
      state: { buckets: CfpbGeoStateBucket[] };
    };
  };
}
