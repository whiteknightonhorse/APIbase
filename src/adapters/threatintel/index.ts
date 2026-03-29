import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  TIReputationResponse,
  TIMalwareResponse,
  TIInfrastructureRecord,
  ReputationOutput,
  MalwareOutput,
  InfrastructureOutput,
} from './types';

/**
 * Threat Intelligence Platform adapter (UC-227).
 *
 * Supported tools:
 *   threatintel.reputation      → GET /reputation (domain reputation score)
 *   threatintel.malware         → GET /malwareCheck (malware/phishing check)
 *   threatintel.infrastructure  → GET /infrastructureAnalysis (IPs, geolocation)
 *
 * Auth: apiKey query param. 100 free credits, pay-per-credit top-up.
 * WhoisXML Group product.
 */
export class ThreatIntelAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'threatintel',
      baseUrl: 'https://api.threatintelligenceplatform.com/v1',
    });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const domain = String(params.domain ?? params.domainName ?? '');

    const qp = new URLSearchParams();
    qp.set('apiKey', this.apiKey);
    qp.set('domainName', domain);
    qp.set('outputFormat', 'json');

    let endpoint: string;
    switch (req.toolId) {
      case 'threatintel.reputation':
        endpoint = '/reputation';
        break;
      case 'threatintel.malware':
        endpoint = '/malwareCheck';
        break;
      case 'threatintel.infrastructure':
        endpoint = '/infrastructureAnalysis';
        break;
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

    return {
      url: `${this.baseUrl}${endpoint}?${qp.toString()}`,
      method: 'GET',
      headers: {},
    };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body;
    const params = req.params as Record<string, unknown>;
    const domain = String(params.domain ?? params.domainName ?? '');

    switch (req.toolId) {
      case 'threatintel.reputation':
        return this.parseReputation(body as unknown as TIReputationResponse, domain);
      case 'threatintel.malware':
        return this.parseMalware(body as unknown as TIMalwareResponse, domain);
      case 'threatintel.infrastructure':
        return this.parseInfrastructure(body as unknown as TIInfrastructureRecord[], domain);
      default:
        return body;
    }
  }

  private parseReputation(body: TIReputationResponse, domain: string): ReputationOutput {
    const tests = body.testResults ?? [];
    return {
      domain,
      reputation_score: body.reputationScore ?? 0,
      warnings: tests
        .filter((t) => t.warnings && t.warnings.length > 0)
        .map((t) => ({
          test: t.test,
          warnings: t.warnings,
        })),
      tests_count: tests.length,
    };
  }

  private parseMalware(body: TIMalwareResponse, domain: string): MalwareOutput {
    const warnings = (body.warningDetails ?? []).map((w) => w.warningDescription);
    return {
      domain,
      safe_score: body.safeScore ?? 0,
      is_safe: (body.safeScore ?? 0) >= 80,
      warnings,
    };
  }

  private parseInfrastructure(body: TIInfrastructureRecord[], domain: string): InfrastructureOutput {
    const records = (body ?? []).map((r) => ({
      type: r.resourceType ?? '',
      ip: r.ipv4 ?? '',
      country: r.geolocation?.country ?? '',
      city: r.geolocation?.city ?? '',
      region: r.geolocation?.region ?? '',
      subnet: r.subnetwork ?? '',
    }));

    return {
      domain,
      records,
      total: records.length,
    };
  }
}
