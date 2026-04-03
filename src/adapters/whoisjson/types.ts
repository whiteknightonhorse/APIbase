// ---------------------------------------------------------------------------
// Raw WhoisJSON API response shapes
// ---------------------------------------------------------------------------

export interface SslIssuer {
  C?: string;
  O?: string;
  CN?: string;
}

export interface SslDetails {
  subject?: { CN?: string };
  issuer?: SslIssuer;
  subjectaltname?: string;
  ca?: boolean;
  bits?: number;
}

export interface SslCheckResponse {
  domain: string;
  issuer: SslIssuer;
  valid_from: string;
  valid_to: string;
  valid: boolean;
  details: SslDetails;
}

export interface SubdomainEntry {
  subdomain: string;
  type: string;
  ips: string[];
  status: string;
}

export interface SubdomainsResponse {
  domain: string;
  wildcard_detected: boolean;
  total_found: number;
  scan_time_ms: number;
  subdomains: SubdomainEntry[];
}

// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface SslCheckOutput {
  domain: string;
  valid: boolean;
  issuer_org: string;
  issuer_cn: string;
  subject_cn: string;
  valid_from: string;
  valid_to: string;
  is_wildcard: boolean;
  is_ca: boolean;
  key_bits: number | null;
  san_count: number;
  san_domains: string[];
}

export interface SubdomainItem {
  subdomain: string;
  record_type: string;
  ips: string[];
  status: string;
}

export interface SubdomainsOutput {
  domain: string;
  total_found: number;
  wildcard_detected: boolean;
  scan_time_ms: number;
  subdomains: SubdomainItem[];
}
