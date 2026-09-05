import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { DrugEnforcementResponse, NdcResponse, FoodEventResponse } from './types';

/**
 * OpenFDA (UC-684) — additional openFDA datasets not covered by the existing
 * `health` adapter (drug/event, drug/label, food/enforcement) or the
 * `openfda_devices` adapter (device/*).
 *
 * Supported tools (read-only):
 *   fda_openfda.drug_recalls        → GET /drug/enforcement.json
 *   fda_openfda.ndc_directory       → GET /drug/ndc.json
 *   fda_openfda.food_adverse_events → GET /food/event.json (CAERS)
 *
 * Auth: api_key query param (reuses PROVIDER_KEY_OPENFDA, shared with the
 * `health` and `openfda_devices` adapters — same upstream domain/key).
 * Without key: 1,000 req/day. With key: 120,000 req/day.
 * Source: US FDA public domain, no ToS restriction on redistribution.
 */
export class FdaOpenFdaAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'fda_openfda',
      baseUrl: 'https://api.fda.gov',
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
      case 'fda_openfda.drug_recalls':
        return this.buildListRequest('/drug/enforcement.json', params, headers);
      case 'fda_openfda.ndc_directory':
        return this.buildListRequest('/drug/ndc.json', params, headers);
      case 'fda_openfda.food_adverse_events':
        return this.buildListRequest('/food/event.json', params, headers);
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
      case 'fda_openfda.drug_recalls': {
        const data = body as unknown as DrugEnforcementResponse;
        if (!data.results) throw new Error('Missing results in OpenFDA drug enforcement response');
        return {
          total: data.meta?.results?.total ?? 0,
          skip: data.meta?.results?.skip ?? 0,
          limit: data.meta?.results?.limit ?? 0,
          results: data.results,
        };
      }
      case 'fda_openfda.ndc_directory': {
        const data = body as unknown as NdcResponse;
        if (!data.results) throw new Error('Missing results in OpenFDA NDC directory response');
        return {
          total: data.meta?.results?.total ?? 0,
          skip: data.meta?.results?.skip ?? 0,
          limit: data.meta?.results?.limit ?? 0,
          results: data.results,
        };
      }
      case 'fda_openfda.food_adverse_events': {
        const data = body as unknown as FoodEventResponse;
        if (!data.results) throw new Error('Missing results in OpenFDA food event response');
        return {
          total: data.meta?.results?.total ?? 0,
          skip: data.meta?.results?.skip ?? 0,
          limit: data.meta?.results?.limit ?? 0,
          results: data.results,
        };
      }
      default:
        return body;
    }
  }

  // ─── Request builder ────────────────────────────────────────────────────

  private buildListRequest(
    path: string,
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('api_key', this.apiKey);
    if (params.search) qs.set('search', String(params.search));
    if (params.limit) qs.set('limit', String(Math.min(Number(params.limit), 99)));
    else qs.set('limit', '10');
    if (params.skip) qs.set('skip', String(params.skip));
    return { url: `${this.baseUrl}${path}?${qs.toString()}`, method: 'GET', headers };
  }
}
