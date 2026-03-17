/**
 * ZeroBounce Email Validation API response types (UC-055).
 *
 * API host: api.zerobounce.net/v2
 * Auth: API key (query param ?api_key=)
 */

export interface ZeroBounceValidateResponse {
  address: string;
  status: string;
  sub_status: string;
  free_email: boolean;
  did_you_mean: string | null;
  account: string | null;
  domain: string | null;
  domain_age_days: string | null;
  smtp_provider: string | null;
  mx_found: string;
  mx_record: string | null;
  firstname: string | null;
  lastname: string | null;
  gender: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  zipcode: string | null;
  processed_at: string;
  error?: string;
}

export interface ZeroBounceCreditsResponse {
  Credits: string;
}
