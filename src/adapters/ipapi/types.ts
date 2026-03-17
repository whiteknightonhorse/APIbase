/**
 * ipapi.is API response types (UC-045).
 *
 * API host: api.ipapi.is
 * Auth: None (free tier, 1K req/day, no API key)
 *
 * Endpoints:
 *   GET /?q={ip}  — single IP lookup
 *   POST /        — bulk lookup (up to 100 IPs)
 */

// ---------------------------------------------------------------------------
// Single IP Lookup (GET /?q={ip})
// ---------------------------------------------------------------------------

export interface IpLookupResponse {
  ip: string;
  rir: string;
  is_bogon: boolean;
  is_mobile: boolean;
  is_satellite: boolean;
  is_crawler: boolean;
  is_datacenter: boolean;
  is_tor: boolean;
  is_proxy: boolean;
  is_vpn: boolean;
  is_abuser: boolean;
  company?: {
    name: string;
    abuser_score: string;
    domain: string;
    type: string;
    network: string;
  };
  datacenter?: {
    datacenter: string;
    domain: string;
    network: string;
  };
  asn?: {
    asn: number;
    abuser_score: string;
    route: string;
    descr: string;
    country: string;
    active: boolean;
    domain: string;
    org: string;
    type: string;
    created: string;
    updated: string;
    rir: string;
  };
  location?: {
    continent: string;
    country: string;
    country_code: string;
    state: string;
    city: string;
    latitude: number;
    longitude: number;
    zip: string;
    timezone: string;
    local_time: string;
    local_time_unix: number;
  };
  abuse?: {
    name: string;
    address: string;
    email: string;
    phone: string;
  };
  vpn?: {
    ip: string;
    service: string;
    type: string;
    last_seen: number;
    last_seen_str: string;
  };
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Bulk Lookup (POST /)
// ---------------------------------------------------------------------------

export type IpBulkLookupResponse = IpLookupResponse[];
