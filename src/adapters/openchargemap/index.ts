import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { OcmPoiListResponse } from './types';

/**
 * Open Charge Map adapter (UC-214).
 *
 * Supported tools:
 *   evcharge.search   → GET /v3/poi/ (search by location, country, operator)
 *   evcharge.details  → GET /v3/poi/?chargepointid={id}
 *   evcharge.nearby   → GET /v3/poi/ (by lat/lng + radius)
 *
 * Auth: API key as query param (key=).
 * Free tier: unlimited with registered API key.
 */
export class OpenChargeMapAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'openchargemap',
      baseUrl: 'https://api.openchargemap.io/v3',
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
      case 'evcharge.search':
        return this.buildSearch(params, headers);
      case 'evcharge.details':
        return this.buildDetails(params, headers);
      case 'evcharge.nearby':
        return this.buildNearby(params, headers);
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
    const body = raw.body as OcmPoiListResponse;

    if (!Array.isArray(body)) {
      throw new Error('Expected array response from Open Charge Map');
    }

    switch (req.toolId) {
      case 'evcharge.details': {
        if (body.length === 0) {
          throw new Error('Charging station not found');
        }
        return body[0];
      }
      default:
        return {
          results: body,
          count: body.length,
        };
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildSearch(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ) {
    const qs = new URLSearchParams();
    qs.set('key', this.apiKey);
    qs.set('compact', 'true');
    qs.set('maxresults', String(params.limit || 20));

    if (params.country_code) qs.set('countrycode', String(params.country_code));
    if (params.latitude && params.longitude) {
      qs.set('latitude', String(params.latitude));
      qs.set('longitude', String(params.longitude));
    }
    if (params.distance) qs.set('distance', String(params.distance));
    if (params.distance_unit) qs.set('distanceunit', String(params.distance_unit));
    if (params.operator_id) qs.set('operatorid', String(params.operator_id));
    if (params.connection_type_id) qs.set('connectiontypeid', String(params.connection_type_id));
    if (params.min_power_kw) qs.set('minpowerkw', String(params.min_power_kw));
    if (params.status_type_id) qs.set('statustypeid', String(params.status_type_id));

    return {
      url: `${this.baseUrl}/poi/?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildDetails(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ) {
    const qs = new URLSearchParams();
    qs.set('key', this.apiKey);
    qs.set('chargepointid', String(params.id));

    return {
      url: `${this.baseUrl}/poi/?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildNearby(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ) {
    const qs = new URLSearchParams();
    qs.set('key', this.apiKey);
    qs.set('compact', 'true');
    qs.set('latitude', String(params.latitude));
    qs.set('longitude', String(params.longitude));
    qs.set('distance', String(params.radius || 5));
    qs.set('distanceunit', 'KM');
    qs.set('maxresults', String(params.limit || 10));

    if (params.min_power_kw) qs.set('minpowerkw', String(params.min_power_kw));
    if (params.connection_type_id) qs.set('connectiontypeid', String(params.connection_type_id));

    return {
      url: `${this.baseUrl}/poi/?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }
}
