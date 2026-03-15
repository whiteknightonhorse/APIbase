/**
 * WhoisXML API response types (UC-028).
 *
 * API host: www.whoisxmlapi.com
 * Auth: query param apiKey=API_KEY
 * Free tier: 500 queries
 */

// ---------------------------------------------------------------------------
// WHOIS Lookup
// ---------------------------------------------------------------------------

export interface WhoisRecord {
  domainName?: string;
  registrarName?: string;
  registrarIANAID?: string;
  whoisServer?: string;
  createdDate?: string;
  updatedDate?: string;
  expiresDate?: string;
  status?: string;
  nameServers?: { hostNames?: string[]; ips?: string[] };
  registrant?: WhoisContact;
  administrativeContact?: WhoisContact;
  technicalContact?: WhoisContact;
  domainAvailability?: string;
  contactEmail?: string;
  estimatedDomainAge?: number;
  ips?: string[];
}

export interface WhoisContact {
  name?: string;
  organization?: string;
  street1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  countryCode?: string;
  email?: string;
  telephone?: string;
}

export interface WhoisLookupResponse {
  WhoisRecord: WhoisRecord;
}

// ---------------------------------------------------------------------------
// DNS Lookup
// ---------------------------------------------------------------------------

export interface DnsRecord {
  name?: string;
  type?: number;
  dnsType?: string;
  ttl?: number;
  rRsetType?: number;
  rawText?: string;
  address?: string;
  strings?: string[];
  admin?: string;
  host?: string;
  expire?: number;
  minimum?: number;
  refresh?: number;
  retry?: number;
  serial?: number;
  target?: string;
  priority?: number;
}

export interface DnsLookupResponse {
  DNSData: {
    domainName?: string;
    dnsRecords?: DnsRecord[];
    audit?: { createdDate?: string; updatedDate?: string };
  };
}

// ---------------------------------------------------------------------------
// Domain Availability
// ---------------------------------------------------------------------------

export interface DomainAvailabilityResponse {
  DomainInfo: {
    domainName?: string;
    domainAvailability?: string;
  };
}

// ---------------------------------------------------------------------------
// Reverse WHOIS
// ---------------------------------------------------------------------------

export interface ReverseWhoisResult {
  domainName?: string;
  [key: string]: unknown;
}

export interface ReverseWhoisResponse {
  result?: {
    count?: number;
    records?: ReverseWhoisResult[];
  };
  recordsCount?: number;
  domainsList?: string[];
}
