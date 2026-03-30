import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  PostcodeResult,
  NearestResult,
  LookupOutput,
  NearestOutput,
  ValidateOutput,
} from './types';

/**
 * Postcodes.io adapter (UC-249).
 *
 * Supported tools:
 *   ukpost.lookup   → GET /postcodes/{code}
 *   ukpost.nearest  → GET /postcodes?lon=&lat=&limit=
 *   ukpost.validate → GET /postcodes/{code}/validate
 *
 * Auth: None. Free, unlimited, open source. UK only.
 */
export class PostcodesIoAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'postcodes-io',
      baseUrl: 'https://api.postcodes.io',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'ukpost.lookup': {
        const code = encodeURIComponent(String(params.postcode ?? '').replace(/\s/g, ''));
        return {
          url: `${this.baseUrl}/postcodes/${code}`,
          method: 'GET',
          headers: {},
        };
      }

      case 'ukpost.nearest': {
        const lat = Number(params.lat ?? 0);
        const lon = Number(params.lon ?? 0);
        const limit = Math.min(Number(params.limit) || 5, 10);
        return {
          url: `${this.baseUrl}/postcodes?lat=${lat}&lon=${lon}&limit=${limit}`,
          method: 'GET',
          headers: {},
        };
      }

      case 'ukpost.validate': {
        const code = encodeURIComponent(String(params.postcode ?? '').replace(/\s/g, ''));
        return {
          url: `${this.baseUrl}/postcodes/${code}/validate`,
          method: 'GET',
          headers: {},
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
      case 'ukpost.lookup':
        return this.parseLookup(body.result as PostcodeResult);
      case 'ukpost.nearest':
        return this.parseNearest(body.result as NearestResult[]);
      case 'ukpost.validate':
        return this.parseValidate(req.params as Record<string, unknown>, body.result as boolean);
      default:
        return body;
    }
  }

  private parseLookup(r: PostcodeResult): LookupOutput {
    return {
      postcode: r?.postcode ?? '',
      district: r?.admin_district ?? '',
      county: r?.admin_county ?? '',
      region: r?.region ?? '',
      country: r?.country ?? '',
      ward: r?.admin_ward ?? '',
      parish: r?.parish ?? '',
      parliamentary_constituency: r?.parliamentary_constituency ?? '',
      lat: r?.latitude ?? 0,
      lon: r?.longitude ?? 0,
      outcode: r?.outcode ?? '',
    };
  }

  private parseNearest(results: NearestResult[]): NearestOutput {
    const items = Array.isArray(results) ? results : [];
    return {
      results: items.map((r) => ({
        postcode: r.postcode ?? '',
        district: r.admin_district ?? '',
        distance_m: Math.round(r.distance ?? 0),
        lat: r.latitude ?? 0,
        lon: r.longitude ?? 0,
      })),
      total: items.length,
    };
  }

  private parseValidate(params: Record<string, unknown>, valid: boolean): ValidateOutput {
    return {
      postcode: String(params.postcode ?? ''),
      valid: !!valid,
    };
  }
}
