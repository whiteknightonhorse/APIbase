import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  type ProviderError,
  ProviderErrorCode,
} from '../../types/provider';
import type { EpqsRawResponse } from './types';

const EPQS_BASE = 'https://epqs.nationalmap.gov/v1';

/**
 * USGS Elevation Point Query Service (EPQS) adapter (UC-613).
 *
 * Supported tools (read-only):
 *   usgs-epqs.elevation → GET /v1/json (single-point elevation, 3DEP dataset)
 *
 * Auth: None (US Government open data, public domain — USGS 3D Elevation
 * Program). Coverage is continental US + territories only; the 3DEP raster
 * mosaic has no data outside that extent (open ocean, most of the rest of
 * the world).
 *
 * Upstream quirk: coordinates with no DEM coverage return HTTP 200 with a
 * PLAIN-TEXT (non-JSON) failure body, e.g.
 * "Call failed.  [Failed cloud operation: Open, Path: /vsimem/...]" — not a
 * JSON error object. BaseAdapter's JSON.parse fails before parseResponse
 * ever runs, surfacing as a generic INVALID_RESPONSE (502). Since this tool
 * has exactly one upstream call shape, any INVALID_RESPONSE from this
 * adapter is this known coverage-gap quirk, not a genuine provider outage —
 * call() below reclassifies it to INPUT_REJECTED (422) with an actionable
 * message, same intent as the National Map `errorMessage`-in-200-body
 * quirk (which parseResponse's own numeric-value check also guards, in
 * case upstream ever returns valid JSON with a non-numeric value).
 */
export class UsgsEpqsAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'usgs-epqs',
      baseUrl: EPQS_BASE,
      timeoutMs: 10_000,
    });
  }

  async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    try {
      return await super.call(req);
    } catch (error) {
      const err = error as ProviderError;
      if (err.code === ProviderErrorCode.INVALID_RESPONSE) {
        throw {
          ...err,
          code: ProviderErrorCode.INPUT_REJECTED,
          httpStatus: 422,
          message:
            'No elevation data available at this location — it is outside the USGS 3DEP ' +
            'coverage extent (continental US + territories only, no ocean/international data).',
        };
      }
      throw error;
    }
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'usgs-epqs.elevation': {
        const qs = new URLSearchParams();
        qs.set('x', String(params.longitude));
        qs.set('y', String(params.latitude));
        qs.set('units', params.units === 'Feet' ? 'Feet' : 'Meters');
        qs.set('wkid', '4326');
        qs.set('includeDate', params.include_date ? 'true' : 'false');
        return { url: `${this.baseUrl}/json?${qs.toString()}`, method: 'GET', headers };
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
    switch (req.toolId) {
      case 'usgs-epqs.elevation': {
        const data = raw.body as unknown as EpqsRawResponse;
        const elevation = typeof data.value === 'number' ? data.value : Number(data.value);
        if (!Number.isFinite(elevation)) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message:
              'No elevation data available at this location — it is outside the USGS 3DEP ' +
              'coverage extent (continental US + territories only, no ocean/international data).',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        const params = req.params as Record<string, unknown>;
        return {
          latitude: data.location.y,
          longitude: data.location.x,
          elevation,
          units: params.units === 'Feet' ? 'Feet' : 'Meters',
          resolution_m: data.resolution,
          acquisition_date: data.attributes?.AcquisitionDate,
        };
      }
      default:
        return raw.body;
    }
  }
}
