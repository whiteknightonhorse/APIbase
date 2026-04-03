import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  SslCheckResponse,
  SubdomainsResponse,
  SslCheckOutput,
  SubdomainsOutput,
} from './types';

const BASE_URL = 'https://whoisjson.com/api/v1';

/**
 * WhoisJSON adapter (UC-326).
 *
 * Supported tools:
 *   whoisjson.ssl_check  → SSL certificate validation + chain details
 *   whoisjson.subdomains → Subdomain discovery via DNS brute-force
 *
 * Auth: TOKEN header. Free tier: 1,000 req/month, 20 req/min.
 */
export class WhoisJsonAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ provider: 'whoisjson', baseUrl: BASE_URL });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const domain = encodeURIComponent(String(params.domain));
    const headers: Record<string, string> = {
      Authorization: `TOKEN=${this.apiKey}`,
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'whoisjson.ssl_check':
        return {
          url: `${BASE_URL}/ssl-cert-check?domain=${domain}`,
          method: 'GET',
          headers,
        };

      case 'whoisjson.subdomains':
        return {
          url: `${BASE_URL}/subdomains?domain=${domain}`,
          method: 'GET',
          headers,
        };

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
      case 'whoisjson.ssl_check':
        return this.parseSslCheck(raw.body as SslCheckResponse);
      case 'whoisjson.subdomains':
        return this.parseSubdomains(raw.body as SubdomainsResponse);
      default:
        return raw.body;
    }
  }

  private parseSslCheck(data: SslCheckResponse): SslCheckOutput {
    const sanStr = data.details?.subjectaltname ?? '';
    const sanDomains = sanStr
      .split(',')
      .map((s) => s.replace(/^\s*DNS:/, '').trim())
      .filter(Boolean)
      .slice(0, 50);

    return {
      domain: data.domain,
      valid: data.valid,
      issuer_org: data.issuer?.O ?? '',
      issuer_cn: data.issuer?.CN ?? '',
      subject_cn: data.details?.subject?.CN ?? '',
      valid_from: data.valid_from,
      valid_to: data.valid_to,
      is_wildcard: (data.details?.subject?.CN ?? '').startsWith('*.'),
      is_ca: data.details?.ca ?? false,
      key_bits: data.details?.bits ?? null,
      san_count: sanDomains.length,
      san_domains: sanDomains,
    };
  }

  private parseSubdomains(data: SubdomainsResponse): SubdomainsOutput {
    return {
      domain: data.domain,
      total_found: data.total_found,
      wildcard_detected: data.wildcard_detected,
      scan_time_ms: data.scan_time_ms,
      subdomains: (data.subdomains ?? []).slice(0, 100).map((s) => ({
        subdomain: s.subdomain,
        record_type: s.type,
        ips: s.ips ?? [],
        status: s.status,
      })),
    };
  }
}
