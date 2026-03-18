import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { WalkScoreResponse } from './types';

/**
 * Walk Score adapter (UC-062).
 *
 * Supported tools (read-only):
 *   walkscore.score → GET /score?format=json&address=...&lat=...&lon=...&transit=1&bike=1
 *
 * Auth: API Key via query param (wsapikey).
 * Free tier: 5,000 calls/day.
 */
export class WalkScoreAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'walkscore',
      baseUrl: 'https://api.walkscore.com',
    });
    this.apiKey = apiKey;
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
      case 'walkscore.score':
        return this.buildScoreRequest(params, headers);
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
    const body = raw.body as unknown as WalkScoreResponse;

    switch (req.toolId) {
      case 'walkscore.score': {
        // Status codes: 1=success, 2=calculating, 40=invalid, 41=bad key, 42=IP block
        if (body.status !== 1) {
          const messages: Record<number, string> = {
            2: 'Score is being calculated, try again later',
            40: 'Invalid latitude, longitude, or address',
            41: 'Invalid API key',
            42: 'IP address not whitelisted',
          };
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: messages[body.status] ?? `Walk Score API returned status ${body.status}`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }

        return {
          walk_score: body.walkscore,
          walk_description: body.description,
          transit_score: body.transit?.score ?? null,
          transit_description: body.transit?.description ?? null,
          bike_score: body.bike?.score ?? null,
          bike_description: body.bike?.description ?? null,
          latitude: body.snapped_lat,
          longitude: body.snapped_lon,
          updated: body.updated,
          details_url: body.ws_link,
        };
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildScoreRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('format', 'json');
    qs.set('wsapikey', this.apiKey);
    qs.set('transit', '1');
    qs.set('bike', '1');

    if (params.address) qs.set('address', String(params.address));
    if (params.latitude !== undefined) qs.set('lat', String(params.latitude));
    if (params.longitude !== undefined) qs.set('lon', String(params.longitude));

    return {
      url: `${this.baseUrl}/score?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }
}
