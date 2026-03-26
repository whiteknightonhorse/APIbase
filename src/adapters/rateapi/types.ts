/** RateAPI response types (UC-197). */

export interface RateApiAction {
  type: string;
  priority: number;
  score: number;
  why: string[];
  [key: string]: unknown;
}

export interface RateApiResponse {
  request_id: string;
  decision_type: string;
  as_of: string;
  summary: {
    recommended_action: string;
    confidence: number;
  };
  actions: RateApiAction[];
  disclosures: string[];
}
