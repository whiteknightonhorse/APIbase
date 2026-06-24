import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { ElevationResponse } from './types';

const OTD_BASE = 'https://api.opentopodata.org/v1';

/**
 * Open Topo Data adapter (UC-514).
 *
 * Global elevation API — SRTM 90m/30m, NED 10m (US), EU-DEM 25m, ASTER 30m,
 * GEBCO 2020 bathymetry. MIT licence, no auth, batch queries supported.
 *
 * Supported tools:
 *   opentopodata.point    → single point, global datasets (srtm90m/srtm30m/aster30m)
 *   opentopodata.batch    → up to 100 points, global datasets
 *   opentopodata.high_res → single point, regional high-res (ned10m / eudem25m)
 *   opentopodata.ocean    → single point, bathymetry (gebco2020)
 */
export class OpenTopoDataAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'opentopodata', baseUrl: OTD_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'opentopodata.point': {
        const lat = Number(params.lat);
        const lon = Number(params.lon);
        const dataset = String(params.dataset ?? 'srtm90m');
        const interpolation = String(params.interpolation ?? 'bilinear');
        const qs = new URLSearchParams({
          locations: `${lat},${lon}`,
          interpolation,
        });
        return { url: `${OTD_BASE}/${dataset}?${qs.toString()}`, method: 'GET', headers };
      }

      case 'opentopodata.batch': {
        const rawLocations = params.locations as Array<{ lat: number; lon: number }>;
        const locationStr = rawLocations
          .slice(0, 100)
          .map((l) => `${Number(l.lat)},${Number(l.lon)}`)
          .join('|');
        const dataset = String(params.dataset ?? 'srtm90m');
        const interpolation = String(params.interpolation ?? 'bilinear');
        const qs = new URLSearchParams({ locations: locationStr, interpolation });
        return { url: `${OTD_BASE}/${dataset}?${qs.toString()}`, method: 'GET', headers };
      }

      case 'opentopodata.high_res': {
        const lat = Number(params.lat);
        const lon = Number(params.lon);
        const dataset = String(params.dataset ?? 'ned10m');
        const interpolation = String(params.interpolation ?? 'bilinear');
        const qs = new URLSearchParams({ locations: `${lat},${lon}`, interpolation });
        return { url: `${OTD_BASE}/${dataset}?${qs.toString()}`, method: 'GET', headers };
      }

      case 'opentopodata.ocean': {
        const lat = Number(params.lat);
        const lon = Number(params.lon);
        const interpolation = String(params.interpolation ?? 'bilinear');
        const qs = new URLSearchParams({ locations: `${lat},${lon}`, interpolation });
        return { url: `${OTD_BASE}/gebco2020?${qs.toString()}`, method: 'GET', headers };
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

  protected parseResponse(raw: ProviderRawResponse, _req: ProviderRequest): unknown {
    const body = raw.body as ElevationResponse;
    if (body.status !== 'OK' || !body.results) {
      throw new Error(body.error ?? 'Open Topo Data returned non-OK status');
    }
    return {
      count: body.results.length,
      results: body.results.map((r) => ({
        dataset: r.dataset,
        elevation_m: r.elevation,
        lat: r.location.lat,
        lon: r.location.lng,
      })),
    };
  }
}
