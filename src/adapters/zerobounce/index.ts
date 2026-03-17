import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { ZeroBounceValidateResponse } from './types';

/**
 * ZeroBounce Email Validation adapter (UC-055).
 *
 * Supported tools:
 *   email.validate → GET /v2/validate?api_key=KEY&email={email}
 *
 * Auth: API key (query param).
 * Free tier: 100 validations/month.
 * Paid: $39/2K credits (never expire).
 */
export class ZeroBounceAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'zerobounce',
      baseUrl: 'https://api.zerobounce.net/v2',
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
      case 'email.validate': {
        const qs = new URLSearchParams();
        qs.set('api_key', this.apiKey);
        qs.set('email', String(params.email));
        if (params.ip_address) qs.set('ip_address', String(params.ip_address));
        return {
          url: `${this.baseUrl}/validate?${qs.toString()}`,
          method: 'GET',
          headers,
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
    const body = raw.body as Record<string, unknown>;

    switch (req.toolId) {
      case 'email.validate': {
        const d = body as unknown as ZeroBounceValidateResponse;
        if (d.error) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: `ZeroBounce error: ${d.error}`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return {
          email: d.address,
          status: d.status,
          sub_status: d.sub_status,
          free_email: d.free_email,
          did_you_mean: d.did_you_mean,
          domain: d.domain,
          domain_age_days: d.domain_age_days ? parseInt(d.domain_age_days, 10) : null,
          smtp_provider: d.smtp_provider,
          mx_found: d.mx_found === 'true',
          mx_record: d.mx_record,
          firstname: d.firstname,
          lastname: d.lastname,
          gender: d.gender,
          country: d.country,
          city: d.city,
          processed_at: d.processed_at,
        };
      }
      default:
        return body;
    }
  }
}
