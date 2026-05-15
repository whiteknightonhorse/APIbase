/**
 * TypeScript interfaces for NIST NVD API responses (UC-413).
 *
 * CVE 2.0 API: vulnerabilities[] wraps CVE records.
 * CPE 2.0 API: products[] wraps CPE records.
 * Both envelopes preserve totalResults/resultsPerPage/startIndex for pagination.
 */

// ---------------------------------------------------------------------------
// CVE Endpoint Types
// ---------------------------------------------------------------------------

export interface NvdCvssMetricV31 {
  source: string;
  type: string;
  cvssData: {
    version: string;
    vectorString: string;
    baseScore: number;
    baseSeverity: string;
    attackVector?: string;
    attackComplexity?: string;
    privilegesRequired?: string;
    userInteraction?: string;
    scope?: string;
    confidentialityImpact?: string;
    integrityImpact?: string;
    availabilityImpact?: string;
  };
  exploitabilityScore?: number;
  impactScore?: number;
}

export interface NvdCvssMetricV2 {
  source: string;
  type: string;
  cvssData: {
    version: string;
    vectorString: string;
    baseScore: number;
    accessVector?: string;
    accessComplexity?: string;
    authentication?: string;
    confidentialityImpact?: string;
    integrityImpact?: string;
    availabilityImpact?: string;
  };
  baseSeverity?: string;
  exploitabilityScore?: number;
  impactScore?: number;
}

export interface NvdWeakness {
  source: string;
  type: string;
  description: { lang: string; value: string }[];
}

export interface NvdConfiguration {
  nodes: {
    operator: string;
    negate: boolean;
    cpeMatch: {
      vulnerable: boolean;
      criteria: string;
      matchCriteriaId: string;
      versionStartIncluding?: string;
      versionEndExcluding?: string;
      versionEndIncluding?: string;
    }[];
  }[];
}

export interface NvdReference {
  url: string;
  source: string;
  tags?: string[];
}

export interface NvdCveRecord {
  id: string;
  sourceIdentifier?: string;
  published: string;
  lastModified: string;
  vulnStatus: string;
  descriptions: { lang: string; value: string }[];
  metrics?: {
    cvssMetricV31?: NvdCvssMetricV31[];
    cvssMetricV30?: NvdCvssMetricV31[];
    cvssMetricV2?: NvdCvssMetricV2[];
  };
  weaknesses?: NvdWeakness[];
  configurations?: NvdConfiguration[];
  references: NvdReference[];
}

export interface NvdCveEnvelope {
  resultsPerPage: number;
  startIndex: number;
  totalResults: number;
  format: string;
  version: string;
  timestamp: string;
  vulnerabilities: { cve: NvdCveRecord }[];
}

// ---------------------------------------------------------------------------
// CPE Endpoint Types
// ---------------------------------------------------------------------------

export interface NvdCpeTitle {
  title: string;
  lang: string;
}

export interface NvdCpeRecord {
  cpeName: string;
  cpeNameId: string;
  lastModified: string;
  created: string;
  titles: NvdCpeTitle[];
  deprecated: boolean;
  deprecatedBy?: { cpeName: string; cpeNameId: string }[];
}

export interface NvdCpeEnvelope {
  resultsPerPage: number;
  startIndex: number;
  totalResults: number;
  format: string;
  version: string;
  timestamp: string;
  products: { cpe: NvdCpeRecord }[];
}
