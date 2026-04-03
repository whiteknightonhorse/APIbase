// ---------------------------------------------------------------------------
// Raw OSV.dev API response shapes
// ---------------------------------------------------------------------------

export interface OsvSeverity {
  type: string;
  score: string;
}

export interface OsvAffectedRange {
  type: string;
  events: { introduced?: string; fixed?: string; last_affected?: string }[];
}

export interface OsvAffectedPackage {
  package: { name: string; ecosystem: string; purl?: string };
  ranges?: OsvAffectedRange[];
  versions?: string[];
  database_specific?: Record<string, unknown>;
}

export interface OsvVulnerability {
  id: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  modified: string;
  published?: string;
  severity?: OsvSeverity[];
  affected?: OsvAffectedPackage[];
  references?: { type: string; url: string }[];
  database_specific?: Record<string, unknown>;
}

export interface OsvQueryResponse {
  vulns?: OsvVulnerability[];
}

export interface OsvBatchResponse {
  results: { vulns?: OsvVulnerability[] }[];
}

// ---------------------------------------------------------------------------
// Normalized output types
// ---------------------------------------------------------------------------

export interface VulnSummary {
  id: string;
  summary: string;
  aliases: string[];
  severity_type: string;
  severity_score: string;
  published: string;
  modified: string;
  affected_packages: number;
}

export interface OsvQueryOutput {
  package: string;
  version: string;
  ecosystem: string;
  total_vulns: number;
  vulnerabilities: VulnSummary[];
}

export interface OsvVulnDetailOutput {
  id: string;
  summary: string;
  details: string;
  aliases: string[];
  severity: OsvSeverity[];
  published: string;
  modified: string;
  affected: {
    package: string;
    ecosystem: string;
    fixed_in: string | null;
  }[];
  references: { type: string; url: string }[];
}

export interface BatchQueryResult {
  package: string;
  version: string;
  ecosystem: string;
  vuln_count: number;
  vulns: VulnSummary[];
}

export interface OsvBatchOutput {
  total_queries: number;
  total_vulns: number;
  results: BatchQueryResult[];
}
