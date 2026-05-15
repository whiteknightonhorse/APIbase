import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { NvdCveEnvelope, NvdCpeEnvelope } from './types';

const NVD_BASE = 'https://services.nvd.nist.gov/rest/json';

/**
 * NIST National Vulnerability Database (NVD) adapter (UC-413).
 *
 * Supported tools:
 *   nvd.cve_search  → GET /cves/2.0?keywordSearch=...
 *   nvd.cve_detail  → GET /cves/2.0?cveId=CVE-YYYY-NNNNN
 *   nvd.cpe_search  → GET /cpes/2.0?keywordSearch=...
 *
 * Auth: apiKey header. With key: 50 req/30s. Without: 5 req/30s.
 * License: US public domain. Global CVE+CPE catalog.
 * URL-encode all string query params per flywheel [2026-04-05].
 */
export class NvdAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'nvd',
      baseUrl: NVD_BASE,
    });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      apiKey: this.apiKey,
      Accept: 'application/json',
      'User-Agent': 'APIbase-Gateway/1.0',
    };

    switch (req.toolId) {
      case 'nvd.cve_search': {
        const qp = new URLSearchParams();
        // URLSearchParams.set() encodes values automatically — do NOT double-encode.
        if (params.keyword) {
          qp.set('keywordSearch', String(params.keyword));
        }
        if (params.cvss_v3_severity) {
          qp.set('cvssV3Severity', String(params.cvss_v3_severity));
        }
        if (params.pub_start_date) {
          qp.set('pubStartDate', String(params.pub_start_date));
        }
        if (params.pub_end_date) {
          qp.set('pubEndDate', String(params.pub_end_date));
        }
        const n = params.results_per_page != null ? Number(params.results_per_page) : 20;
        qp.set('resultsPerPage', String(Math.min(Math.max(1, n), 2000)));
        const i = params.start_index != null ? Number(params.start_index) : 0;
        qp.set('startIndex', String(Math.max(0, i)));
        return { url: `${NVD_BASE}/cves/2.0?${qp.toString()}`, method: 'GET', headers };
      }

      case 'nvd.cve_detail': {
        const qp = new URLSearchParams();
        // cveId is a canonical identifier (CVE-YYYY-NNNN) — safe to pass directly.
        qp.set('cveId', String(params.cve_id));
        return { url: `${NVD_BASE}/cves/2.0?${qp.toString()}`, method: 'GET', headers };
      }

      case 'nvd.cpe_search': {
        const qp = new URLSearchParams();
        qp.set('keywordSearch', String(params.keyword));
        const n = params.results_per_page != null ? Number(params.results_per_page) : 20;
        qp.set('resultsPerPage', String(Math.min(Math.max(1, n), 1000)));
        const i = params.start_index != null ? Number(params.start_index) : 0;
        qp.set('startIndex', String(Math.max(0, i)));
        return { url: `${NVD_BASE}/cpes/2.0?${qp.toString()}`, method: 'GET', headers };
      }

      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported tool: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    switch (req.toolId) {
      case 'nvd.cve_search':
        return this.parseCveSearch(raw.body as NvdCveEnvelope);
      case 'nvd.cve_detail':
        return this.parseCveDetail(raw.body as NvdCveEnvelope);
      case 'nvd.cpe_search':
        return this.parseCpeSearch(raw.body as NvdCpeEnvelope);
      default:
        return raw.body;
    }
  }

  private parseCveSearch(envelope: NvdCveEnvelope) {
    return {
      total_results: envelope.totalResults,
      results_per_page: envelope.resultsPerPage,
      start_index: envelope.startIndex,
      timestamp: envelope.timestamp,
      vulnerabilities: (envelope.vulnerabilities ?? []).map(({ cve }) => {
        const desc = (cve.descriptions ?? []).find((d) => d.lang === 'en')?.value ?? '';
        const v31 = (cve.metrics?.cvssMetricV31 ?? cve.metrics?.cvssMetricV30 ?? [])[0];
        const score = v31?.cvssData?.baseScore ?? null;
        const severity = v31?.cvssData?.baseSeverity ?? null;
        const cwes = (cve.weaknesses ?? [])
          .flatMap((w) => w.description)
          .filter((d) => d.lang === 'en')
          .map((d) => d.value)
          .slice(0, 5);
        const cpes = (cve.configurations ?? [])
          .flatMap((c) => c.nodes)
          .flatMap((n) => n.cpeMatch)
          .filter((m) => m.vulnerable)
          .map((m) => m.criteria)
          .slice(0, 10);
        return {
          cve_id: cve.id,
          published: cve.published,
          last_modified: cve.lastModified,
          vuln_status: cve.vulnStatus,
          description: desc,
          cvss_v3_score: score,
          cvss_v3_severity: severity,
          cwe: cwes,
          affected_cpe: cpes,
          references: (cve.references ?? []).slice(0, 5).map((r) => ({
            url: r.url,
            source: r.source,
            tags: r.tags ?? [],
          })),
        };
      }),
    };
  }

  private parseCveDetail(envelope: NvdCveEnvelope) {
    const first = (envelope.vulnerabilities ?? [])[0];
    if (!first) {
      return { total_results: 0, vulnerabilities: [] };
    }
    const cve = first.cve;
    const desc = (cve.descriptions ?? []).find((d) => d.lang === 'en')?.value ?? '';
    const v31 = (cve.metrics?.cvssMetricV31 ?? cve.metrics?.cvssMetricV30 ?? [])[0];
    const v2 = (cve.metrics?.cvssMetricV2 ?? [])[0];
    const cwes = (cve.weaknesses ?? [])
      .flatMap((w) => w.description)
      .filter((d) => d.lang === 'en')
      .map((d) => d.value);
    const cpes = (cve.configurations ?? [])
      .flatMap((c) => c.nodes)
      .flatMap((n) => n.cpeMatch)
      .filter((m) => m.vulnerable)
      .map((m) => ({
        criteria: m.criteria,
        vulnerable: m.vulnerable,
        version_start_including: m.versionStartIncluding,
        version_end_excluding: m.versionEndExcluding,
        version_end_including: m.versionEndIncluding,
      }));

    return {
      cve_id: cve.id,
      published: cve.published,
      last_modified: cve.lastModified,
      vuln_status: cve.vulnStatus,
      source_identifier: cve.sourceIdentifier,
      description: desc,
      cvss_v3: v31
        ? {
            vector: v31.cvssData.vectorString,
            score: v31.cvssData.baseScore,
            severity: v31.cvssData.baseSeverity,
            exploitability_score: v31.exploitabilityScore,
            impact_score: v31.impactScore,
          }
        : null,
      cvss_v2: v2
        ? {
            vector: v2.cvssData.vectorString,
            score: v2.cvssData.baseScore,
            severity: v2.baseSeverity,
          }
        : null,
      cwe: cwes,
      affected_cpe: cpes.slice(0, 20),
      references: (cve.references ?? []).slice(0, 20).map((r) => ({
        url: r.url,
        source: r.source,
        tags: r.tags ?? [],
      })),
    };
  }

  private parseCpeSearch(envelope: NvdCpeEnvelope) {
    return {
      total_results: envelope.totalResults,
      results_per_page: envelope.resultsPerPage,
      start_index: envelope.startIndex,
      timestamp: envelope.timestamp,
      products: (envelope.products ?? []).map(({ cpe }) => {
        const title = (cpe.titles ?? []).find((t) => t.lang === 'en')?.title ?? cpe.cpeName;
        return {
          cpe_name: cpe.cpeName,
          cpe_name_id: cpe.cpeNameId,
          title,
          deprecated: cpe.deprecated,
          last_modified: cpe.lastModified,
          created: cpe.created,
        };
      }),
    };
  }
}
