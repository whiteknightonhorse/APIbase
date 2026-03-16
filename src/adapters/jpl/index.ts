import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  CloseApproachResponse,
  FireballResponse,
  SmallBodyResponse,
  SentryResponse,
} from './types';

/**
 * NASA JPL Solar System Dynamics adapter (UC-035).
 *
 * Supported tools (Phase 1, read-only):
 *   jpl.close_approaches → GET /cad.api
 *   jpl.fireballs         → GET /fireball.api
 *   jpl.small_body        → GET /sbdb.api
 *   jpl.impact_risk       → GET /sentry.api
 *
 * Auth: None (open access).
 *
 * Note: CAD and Fireball APIs return flat {fields, data} format.
 * parseResponse zips fields+data into objects for agent consumption.
 */
export class JplAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'jpl',
      baseUrl: 'https://ssd-api.jpl.nasa.gov',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'jpl.close_approaches':
        return this.buildCadRequest(params, headers);
      case 'jpl.fireballs':
        return this.buildFireballRequest(params, headers);
      case 'jpl.small_body':
        return this.buildSbdbRequest(params, headers);
      case 'jpl.impact_risk':
        return this.buildSentryRequest(params, headers);
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
      case 'jpl.close_approaches':
      case 'jpl.fireballs': {
        // Flat format: { fields: string[], data: string[][] } → zip to objects
        const fields = body.fields as string[] | undefined;
        const rawData = body.data as unknown[][] | undefined;
        const zipped = (fields && rawData)
          ? rawData.map(row => {
              const obj: Record<string, unknown> = {};
              fields.forEach((f, i) => { obj[f] = row[i]; });
              return obj;
            })
          : [];
        return {
          signature: body.signature,
          count: body.count ?? String(zipped.length),
          data: zipped,
        } as CloseApproachResponse | FireballResponse;
      }
      case 'jpl.small_body': {
        const data = body as SmallBodyResponse;
        if (!data.object && !data.signature) {
          throw new Error('Invalid SBDB response — missing object or signature');
        }
        return data;
      }
      case 'jpl.impact_risk': {
        const data = body as unknown as SentryResponse;
        if (!data.signature) {
          throw new Error('Invalid Sentry response — missing signature');
        }
        // Sentry data array may be present or absent (no current risks)
        if (!data.data) {
          return { ...data, data: [], count: '0' };
        }
        return data;
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildCadRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (params.date_min) qs.set('date-min', String(params.date_min));
    if (params.date_max) qs.set('date-max', String(params.date_max));
    if (params.dist_max) qs.set('dist-max', String(params.dist_max));
    if (params.h_max) qs.set('h-max', String(params.h_max));
    if (params.sort) qs.set('sort', String(params.sort));
    if (params.limit) qs.set('limit', String(params.limit));
    else qs.set('limit', '20');

    return {
      url: `${this.baseUrl}/cad.api?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildFireballRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (params.date_min) qs.set('date-min', String(params.date_min));
    if (params.date_max) qs.set('date-max', String(params.date_max));
    if (params.energy_min) qs.set('energy-min', String(params.energy_min));
    if (params.sort) qs.set('sort', String(params.sort));
    if (params.limit) qs.set('limit', String(params.limit));
    else qs.set('limit', '20');

    return {
      url: `${this.baseUrl}/fireball.api?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildSbdbRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (params.sstr) qs.set('sstr', String(params.sstr));
    if (params.des) qs.set('des', String(params.des));
    if (params.phys_par !== undefined) qs.set('phys-par', String(params.phys_par));
    else qs.set('phys-par', 'true');

    return {
      url: `${this.baseUrl}/sbdb.api?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildSentryRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (params.des) qs.set('des', String(params.des));
    if (params.h_max) qs.set('h-max', String(params.h_max));
    if (params.ps_min) qs.set('ps-min', String(params.ps_min));
    if (params.ip_min) qs.set('ip-min', String(params.ip_min));

    return {
      url: `${this.baseUrl}/sentry.api?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }
}
