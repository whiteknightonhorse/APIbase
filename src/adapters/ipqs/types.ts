/**
 * IPQualityScore API response types (UC-217).
 */

export interface IpqsBaseResponse {
  success: boolean;
  message?: string;
  request_id?: string;
}

export interface IpqsIpResponse extends IpqsBaseResponse {
  fraud_score: number;
  country_code: string;
  region: string;
  city: string;
  ISP: string;
  ASN: number;
  organization: string;
  is_crawler: boolean;
  timezone: string;
  mobile: boolean;
  host: string;
  proxy: boolean;
  vpn: boolean;
  tor: boolean;
  active_vpn: boolean;
  active_tor: boolean;
  recent_abuse: boolean;
  bot_status: boolean;
  connection_type: string;
  abuse_velocity: string;
  latitude: number;
  longitude: number;
}

export interface IpqsEmailResponse extends IpqsBaseResponse {
  valid: boolean;
  disposable: boolean;
  smtp_score: number;
  overall_score: number;
  fraud_score: number;
  catch_all: boolean;
  generic: boolean;
  common: boolean;
  dns_valid: boolean;
  honeypot: boolean;
  deliverability: string;
  frequent_complainer: boolean;
  spam_trap_score: string;
  leaked: boolean;
  suspect: boolean;
  recent_abuse: boolean;
  suggested_domain: string;
  domain_age?: { human: string; timestamp: number; iso: string };
  first_seen?: { human: string; timestamp: number; iso: string };
}

export interface IpqsUrlResponse extends IpqsBaseResponse {
  unsafe: boolean;
  domain: string;
  ip_address: string;
  server: string;
  content_type: string;
  status_code: number;
  page_size: number;
  risk_score: number;
  malware: boolean;
  phishing: boolean;
  suspicious: boolean;
  adult: boolean;
  spamming: boolean;
  domain_rank: number;
  parking: boolean;
  redirected: boolean;
  category: string;
  domain_age?: { human: string; timestamp: number; iso: string };
}

export interface IpqsPhoneResponse extends IpqsBaseResponse {
  valid: boolean;
  fraud_score: number;
  recent_abuse: boolean;
  VOIP: boolean;
  prepaid: boolean;
  risky: boolean;
  active: boolean;
  carrier: string;
  line_type: string;
  country: string;
  city: string;
  zip_code: string;
  region: string;
  dialing_code: number;
  active_status: string;
  leaked: boolean;
  name: string;
}
