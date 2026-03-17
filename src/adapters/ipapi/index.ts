import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { IpLookupResponse } from './types';

/**
 * ipapi.is adapter (UC-045).
 *
 * Supported tools (Phase 1, read-only):
 *   ip.lookup      → GET /?q={ip}
 *   ip.bulk_lookup → POST / (up to 100 IPs)
 *
 * Auth: None (free tier, 1K req/day).
 */
export class IpApiAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'ipapi',
      baseUrl: 'https://api.ipapi.is',
    });
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
      case 'ip.lookup':
        return this.buildLookupRequest(params, headers);
      case 'ip.bulk_lookup':
        return this.buildBulkRequest(params, headers);
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
    const body = raw.body as Record<string, unknown>;

    switch (req.toolId) {
      case 'ip.lookup': {
        const data = body as unknown as IpLookupResponse;
        return {
          ip: data.ip,
          rir: data.rir,
          security: {
            is_vpn: data.is_vpn,
            is_tor: data.is_tor,
            is_proxy: data.is_proxy,
            is_datacenter: data.is_datacenter,
            is_abuser: data.is_abuser,
            is_crawler: data.is_crawler,
            is_bogon: data.is_bogon,
            is_mobile: data.is_mobile,
            is_satellite: data.is_satellite,
          },
          location: data.location ? {
            continent: data.location.continent,
            country: data.location.country,
            country_code: data.location.country_code,
            state: data.location.state,
            city: data.location.city,
            latitude: data.location.latitude,
            longitude: data.location.longitude,
            zip: data.location.zip,
            timezone: data.location.timezone,
          } : null,
          asn: data.asn ? {
            asn: data.asn.asn,
            org: data.asn.org,
            route: data.asn.route,
            type: data.asn.type,
            country: data.asn.country,
            domain: data.asn.domain,
          } : null,
          company: data.company ? {
            name: data.company.name,
            domain: data.company.domain,
            type: data.company.type,
            abuser_score: data.company.abuser_score,
          } : null,
          vpn: data.vpn ? {
            service: data.vpn.service,
            type: data.vpn.type,
            last_seen: data.vpn.last_seen_str,
          } : null,
          datacenter: data.datacenter ? {
            name: data.datacenter.datacenter,
            domain: data.datacenter.domain,
            network: data.datacenter.network,
          } : null,
          abuse: data.abuse ? {
            email: data.abuse.email,
            phone: data.abuse.phone,
          } : null,
        };
      }
      case 'ip.bulk_lookup': {
        // API returns { "ip1": {...}, "ip2": {...}, "total_elapsed_ms": N }
        const entries = Object.entries(body)
          .filter(([key]) => key !== 'total_elapsed_ms')
          .map(([, value]) => value as IpLookupResponse);
        return {
          count: entries.length,
          results: entries.map(item => ({
            ip: item.ip,
            country_code: item.location?.country_code,
            city: item.location?.city,
            is_vpn: item.is_vpn,
            is_tor: item.is_tor,
            is_proxy: item.is_proxy,
            is_datacenter: item.is_datacenter,
            is_abuser: item.is_abuser,
            asn: item.asn?.asn,
            org: item.asn?.org,
          })),
        };
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildLookupRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('q', String(params.ip));

    return {
      url: `${this.baseUrl}/?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildBulkRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string>; body: string } {
    const ips = params.ips as string[];
    return {
      url: this.baseUrl,
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ips: ips.slice(0, 100) }),
    };
  }
}
