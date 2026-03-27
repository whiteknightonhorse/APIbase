import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  IpqsBaseResponse,
  IpqsIpResponse,
  IpqsEmailResponse,
  IpqsUrlResponse,
  IpqsPhoneResponse,
} from './types';

/**
 * IPQualityScore adapter (UC-217).
 *
 * Supported tools:
 *   ipqs.ip_check    → GET /api/json/ip/{key}/{ip}
 *   ipqs.email_check → GET /api/json/email/{key}/{email}
 *   ipqs.url_check   → GET /api/json/url/{key}/{url}
 *   ipqs.phone_check → GET /api/json/phone/{key}/{phone}
 *
 * Auth: API key embedded in URL path.
 * Free tier: 1,000 lookups/month (35/day).
 */
export class IpqsAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'ipqs',
      baseUrl: 'https://ipqualityscore.com/api/json',
    });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'ipqs.ip_check':
        return this.buildIpCheck(params, headers);
      case 'ipqs.email_check':
        return this.buildEmailCheck(params, headers);
      case 'ipqs.url_check':
        return this.buildUrlCheck(params, headers);
      case 'ipqs.phone_check':
        return this.buildPhoneCheck(params, headers);
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
    const body = raw.body as IpqsBaseResponse;

    if (!body.success) {
      throw new Error(body.message || 'IPQS API error');
    }

    switch (req.toolId) {
      case 'ipqs.ip_check': {
        const data = body as IpqsIpResponse;
        return {
          fraud_score: data.fraud_score,
          country_code: data.country_code,
          city: data.city,
          region: data.region,
          isp: data.ISP,
          asn: data.ASN,
          organization: data.organization,
          proxy: data.proxy,
          vpn: data.vpn,
          tor: data.tor,
          bot: data.bot_status,
          crawler: data.is_crawler,
          mobile: data.mobile,
          recent_abuse: data.recent_abuse,
          abuse_velocity: data.abuse_velocity,
          connection_type: data.connection_type,
          latitude: data.latitude,
          longitude: data.longitude,
        };
      }
      case 'ipqs.email_check': {
        const data = body as IpqsEmailResponse;
        return {
          valid: data.valid,
          fraud_score: data.fraud_score,
          disposable: data.disposable,
          honeypot: data.honeypot,
          spam_trap: data.spam_trap_score,
          catch_all: data.catch_all,
          deliverability: data.deliverability,
          leaked: data.leaked,
          recent_abuse: data.recent_abuse,
          suspect: data.suspect,
          dns_valid: data.dns_valid,
          smtp_score: data.smtp_score,
          domain_age: data.domain_age?.human,
          first_seen: data.first_seen?.human,
          suggested_domain: data.suggested_domain || null,
        };
      }
      case 'ipqs.url_check': {
        const data = body as IpqsUrlResponse;
        return {
          unsafe: data.unsafe,
          risk_score: data.risk_score,
          domain: data.domain,
          malware: data.malware,
          phishing: data.phishing,
          suspicious: data.suspicious,
          adult: data.adult,
          spamming: data.spamming,
          parking: data.parking,
          category: data.category,
          domain_rank: data.domain_rank,
          ip_address: data.ip_address,
          status_code: data.status_code,
          domain_age: data.domain_age?.human,
        };
      }
      case 'ipqs.phone_check': {
        const data = body as IpqsPhoneResponse;
        return {
          valid: data.valid,
          fraud_score: data.fraud_score,
          carrier: data.carrier,
          line_type: data.line_type,
          voip: data.VOIP,
          prepaid: data.prepaid,
          risky: data.risky,
          active: data.active,
          recent_abuse: data.recent_abuse,
          leaked: data.leaked,
          country: data.country,
          city: data.city,
          region: data.region,
          zip_code: data.zip_code,
          name: data.name || null,
        };
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildIpCheck(params: Record<string, unknown>, headers: Record<string, string>) {
    const ip = encodeURIComponent(String(params.ip || ''));
    const qs = new URLSearchParams();
    if (params.strictness !== undefined) qs.set('strictness', String(params.strictness));
    if (params.allow_public_access_points !== undefined) qs.set('allow_public_access_points', String(params.allow_public_access_points));
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return { url: `${this.baseUrl}/ip/${this.apiKey}/${ip}${query}`, method: 'GET', headers };
  }

  private buildEmailCheck(params: Record<string, unknown>, headers: Record<string, string>) {
    const email = encodeURIComponent(String(params.email || ''));
    const qs = new URLSearchParams();
    if (params.fast !== undefined) qs.set('fast', String(params.fast));
    if (params.abuse_strictness !== undefined) qs.set('abuse_strictness', String(params.abuse_strictness));
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return { url: `${this.baseUrl}/email/${this.apiKey}/${email}${query}`, method: 'GET', headers };
  }

  private buildUrlCheck(params: Record<string, unknown>, headers: Record<string, string>) {
    const url = encodeURIComponent(String(params.url || ''));
    const qs = new URLSearchParams();
    if (params.strictness !== undefined) qs.set('strictness', String(params.strictness));
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return { url: `${this.baseUrl}/url/${this.apiKey}/${url}${query}`, method: 'GET', headers };
  }

  private buildPhoneCheck(params: Record<string, unknown>, headers: Record<string, string>) {
    const phone = encodeURIComponent(String(params.phone || ''));
    const qs = new URLSearchParams();
    if (params.country) qs.set('country[]', String(params.country));
    if (params.strictness !== undefined) qs.set('strictness', String(params.strictness));
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return { url: `${this.baseUrl}/phone/${this.apiKey}/${phone}${query}`, method: 'GET', headers };
  }
}
