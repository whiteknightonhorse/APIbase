/**
 * Threat Intelligence Platform types (UC-227).
 * Domain/IP reputation, malware check, infrastructure analysis.
 */

export interface TITestResult {
  test: string;
  testCode: number;
  warnings: string[];
  warningCodes: number[];
}

export interface TIReputationResponse {
  mode: string;
  reputationScore: number;
  testResults: TITestResult[];
}

export interface TIMalwareResponse {
  safeScore: number;
  warningDetails: Array<{
    warningDescription: string;
    warningCode: number;
  }>;
}

export interface TIInfrastructureRecord {
  domainName: string;
  resourceType: string;
  ipv4: string;
  geolocation: {
    city: string;
    country: string;
    latitude: string;
    longitude: string;
    region: string;
    timezone: string;
  };
  subnetwork: string;
}

// Normalized outputs

export interface ReputationOutput {
  domain: string;
  reputation_score: number;
  warnings: Array<{
    test: string;
    warnings: string[];
  }>;
  tests_count: number;
}

export interface MalwareOutput {
  domain: string;
  safe_score: number;
  is_safe: boolean;
  warnings: string[];
}

export interface InfrastructureOutput {
  domain: string;
  records: Array<{
    type: string;
    ip: string;
    country: string;
    city: string;
    region: string;
    subnet: string;
  }>;
  total: number;
}
