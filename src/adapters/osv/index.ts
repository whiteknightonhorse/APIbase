import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  OsvVulnerability,
  OsvQueryResponse,
  OsvBatchResponse,
  OsvQueryOutput,
  OsvVulnDetailOutput,
  OsvBatchOutput,
  VulnSummary,
} from './types';

const OSV_BASE = 'https://api.osv.dev/v1';

/**
 * OSV.dev adapter (UC-345).
 *
 * Google Open Source Security — cross-ecosystem vulnerability database.
 * Covers npm, PyPI, Go, Maven, Rust, NuGet, and 14+ ecosystems.
 *
 * Auth: None. Apache 2.0. Unlimited.
 * POST-based for query/batch, GET for vuln details.
 */
export class OsvAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'osv', baseUrl: OSV_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    switch (req.toolId) {
      case 'osv.query': {
        return {
          url: `${OSV_BASE}/query`,
          method: 'POST',
          headers,
          body: JSON.stringify({
            package: {
              name: String(params.package),
              ecosystem: String(params.ecosystem),
            },
            version: String(params.version),
          }),
        };
      }

      case 'osv.get': {
        const vulnId = encodeURIComponent(String(params.vuln_id));
        return {
          url: `${OSV_BASE}/vulns/${vulnId}`,
          method: 'GET',
          headers: { Accept: 'application/json' },
        };
      }

      case 'osv.batch_query': {
        const queries = params.queries as {
          package: string;
          version: string;
          ecosystem: string;
        }[];
        return {
          url: `${OSV_BASE}/querybatch`,
          method: 'POST',
          headers,
          body: JSON.stringify({
            queries: queries.slice(0, 100).map((q) => ({
              package: { name: q.package, ecosystem: q.ecosystem },
              version: q.version,
            })),
          }),
        };
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
      case 'osv.query':
        return this.parseQuery(raw.body as OsvQueryResponse, req.params as Record<string, unknown>);
      case 'osv.get':
        return this.parseVulnDetail(raw.body as OsvVulnerability);
      case 'osv.batch_query':
        return this.parseBatch(raw.body as OsvBatchResponse, req.params as Record<string, unknown>);
      default:
        return raw.body;
    }
  }

  private parseQuery(data: OsvQueryResponse, params: Record<string, unknown>): OsvQueryOutput {
    const vulns = (data.vulns ?? []).slice(0, 20);
    return {
      package: String(params.package),
      version: String(params.version),
      ecosystem: String(params.ecosystem),
      total_vulns: vulns.length,
      vulnerabilities: vulns.map((v) => this.toVulnSummary(v)),
    };
  }

  private parseVulnDetail(v: OsvVulnerability): OsvVulnDetailOutput {
    return {
      id: v.id,
      summary: v.summary ?? '',
      details: (v.details ?? '').slice(0, 2000),
      aliases: v.aliases ?? [],
      severity: v.severity ?? [],
      published: v.published ?? '',
      modified: v.modified,
      affected: (v.affected ?? []).slice(0, 20).map((a) => {
        const fixedEvent = a.ranges?.flatMap((r) => r.events).find((e) => e.fixed);
        return {
          package: a.package.name,
          ecosystem: a.package.ecosystem,
          fixed_in: fixedEvent?.fixed ?? null,
        };
      }),
      references: (v.references ?? []).slice(0, 10),
    };
  }

  private parseBatch(data: OsvBatchResponse, params: Record<string, unknown>): OsvBatchOutput {
    const queries = params.queries as {
      package: string;
      version: string;
      ecosystem: string;
    }[];
    let totalVulns = 0;

    const results = data.results.map((r, i) => {
      const vulns = (r.vulns ?? []).slice(0, 10);
      totalVulns += vulns.length;
      const q = queries[i] ?? { package: '?', version: '?', ecosystem: '?' };
      return {
        package: q.package,
        version: q.version,
        ecosystem: q.ecosystem,
        vuln_count: vulns.length,
        vulns: vulns.map((v) => this.toVulnSummary(v)),
      };
    });

    return {
      total_queries: results.length,
      total_vulns: totalVulns,
      results,
    };
  }

  private toVulnSummary(v: OsvVulnerability): VulnSummary {
    const sev = v.severity?.[0];
    const dbSev = v.database_specific?.severity as string | undefined;
    return {
      id: v.id,
      summary: v.summary ?? '',
      aliases: v.aliases ?? [],
      severity_type: sev?.type ?? (dbSev ? 'DATABASE' : ''),
      severity_score: sev?.score ?? dbSev ?? '',
      published: v.published ?? '',
      modified: v.modified,
      affected_packages: v.affected?.length ?? 0,
    };
  }
}
