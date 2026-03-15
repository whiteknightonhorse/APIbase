import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  WhoisLookupResponse,
  DnsLookupResponse,
  DomainAvailabilityResponse,
  ReverseWhoisResponse,
} from './types';

/**
 * WhoisXML API adapter (UC-028).
 *
 * Supported tools (Phase 1, read-only):
 *   whois.lookup       → GET /whoisserver/WhoisService?apiKey=&domainName=&outputFormat=JSON
 *   whois.dns_lookup   → GET /whoisserver/DNSService?apiKey=&domainName=&type=_all&outputFormat=JSON
 *   whois.availability → GET /api/v1 (domain-availability.whoisxmlapi.com)
 *   whois.reverse      → POST /api/v2 (reverse-whois.whoisxmlapi.com)
 *
 * Auth: query param apiKey=API_KEY.
 * Free tier: 500 queries.
 */
export class WhoisXmlAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'whoisxml',
      baseUrl: 'https://www.whoisxmlapi.com',
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
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'whois.lookup':
        return this.buildWhoisRequest(params, headers);
      case 'whois.dns_lookup':
        return this.buildDnsRequest(params, headers);
      case 'whois.availability':
        return this.buildAvailabilityRequest(params, headers);
      case 'whois.reverse':
        return this.buildReverseRequest(params, headers);
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
    const body = raw.body;

    switch (req.toolId) {
      case 'whois.lookup': {
        const data = body as WhoisLookupResponse;
        if (!data.WhoisRecord) {
          throw new Error('Missing WhoisRecord in response');
        }
        return data;
      }
      case 'whois.dns_lookup': {
        const data = body as DnsLookupResponse;
        if (!data.DNSData) {
          throw new Error('Missing DNSData in response');
        }
        return data;
      }
      case 'whois.availability': {
        const data = body as DomainAvailabilityResponse;
        if (!data.DomainInfo) {
          throw new Error('Missing DomainInfo in response');
        }
        return data;
      }
      case 'whois.reverse': {
        const data = body as ReverseWhoisResponse;
        return data;
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildWhoisRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('apiKey', this.apiKey);
    qs.set('domainName', String(params.domain));
    qs.set('outputFormat', 'JSON');
    if (params.prefer_fresh) qs.set('preferFresh', '1');
    if (params.include_ips) qs.set('ip', '1');
    if (params.check_availability) qs.set('da', '2');

    return {
      url: `${this.baseUrl}/whoisserver/WhoisService?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildDnsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('apiKey', this.apiKey);
    qs.set('domainName', String(params.domain));
    qs.set('type', params.record_type ? String(params.record_type) : '_all');
    qs.set('outputFormat', 'JSON');

    return {
      url: `${this.baseUrl}/whoisserver/DNSService?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildAvailabilityRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('apiKey', this.apiKey);
    qs.set('domainName', String(params.domain));
    qs.set('outputFormat', 'JSON');
    if (params.mode) qs.set('mode', String(params.mode));

    return {
      url: `https://domain-availability.whoisxmlapi.com/api/v1?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildReverseRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string>; body: string } {
    const body = {
      apiKey: this.apiKey,
      searchType: 'current',
      mode: 'purchase',
      basicSearchTerms: {
        include: [String(params.keyword)],
      },
    };

    return {
      url: 'https://reverse-whois.whoisxmlapi.com/api/v2',
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    };
  }
}
