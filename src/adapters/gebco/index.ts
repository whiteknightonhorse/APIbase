import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
  PROVIDER_BACKOFF_BASE_MS,
} from '../../types/provider';
import type { GebcoElevationPoint } from './types';

const GEBCO_WMS_BASE = 'https://wms.gebco.net/mapserv';
const GEBCO_HEADERS = {
  Accept: 'text/plain',
  'User-Agent': 'APIbase/1.0 (https://apibase.pro)',
};

const LAYER_BY_SURFACE: Record<string, string> = {
  standard: 'GEBCO_LATEST_2',
  sub_ice_topo: 'GEBCO_LATEST_2_sub_ice_topo',
};

/** Half-width in degrees of the bbox drawn around a query point (§ verified live against wms.gebco.net). */
const BBOX_HALF_DEGREE = 0.5;
const PROFILE_MAX_POINTS = 15;

const ELEVATION_NOTE =
  'Elevation in meters relative to sea level: negative = underwater depth (bathymetry), ' +
  'positive = above sea level (topography). A null value means GEBCO returned no data for ' +
  'that exact coordinate (e.g. a grid edge) or the upstream query failed after retries.';

/**
 * GEBCO (General Bathymetric Chart of the Oceans) WMS adapter (UC-623).
 *
 * Supported tools (read-only):
 *   gebco.elevation_point   → single-point bathymetry/topography lookup
 *   gebco.elevation_profile → up to 15 points in one call
 *
 * Both wrap WMS 1.1.1 GetFeatureInfo against wms.gebco.net/mapserv (confirmed live:
 * layer GEBCO_LATEST_2 for surface elevation including ice-sheet surface where present,
 * GEBCO_LATEST_2_sub_ice_topo for bedrock topography beneath ice sheets — verified these
 * return genuinely different values at the same Antarctic point).
 *
 * The service returns text/plain (`value_list = '<meters>'`), never JSON, so call() is
 * overridden to bypass BaseAdapter's JSON.parse() path (same pattern as usgs-mrds's WFS/GML
 * override) and elevation_profile fans out with Promise.all (same pattern as the hackernews
 * adapter's per-item fetch).
 *
 * Auth: None (IHO/IOC/Seabed 2030 public-domain bathymetric grid, no API key).
 * Rate limit: None documented on the public WMS endpoint.
 */
export class GebcoAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'gebco',
      baseUrl: GEBCO_WMS_BASE,
    });
  }

  // All logic lives in call() — buildRequest/parseResponse are required stubs.
  protected buildRequest(_req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    throw new Error('GebcoAdapter.buildRequest() should not be called directly');
  }

  protected parseResponse(raw: ProviderRawResponse): unknown {
    return raw.body;
  }

  override async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    const start = performance.now();
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'gebco.elevation_point': {
        const lat = requireLat(params.lat, req);
        const lon = requireLon(params.lon, req);
        const surface = resolveSurface(params.surface);

        const elevation_meters = await this.fetchElevation(
          lat,
          lon,
          LAYER_BY_SURFACE[surface],
          req,
        );

        const body = { lat, lon, surface, unit: 'meters', note: ELEVATION_NOTE, elevation_meters };
        return {
          status: 200,
          headers: {},
          body,
          durationMs: Math.round(performance.now() - start),
          byteLength: JSON.stringify(body).length,
        };
      }

      case 'gebco.elevation_profile': {
        const rawPoints = Array.isArray(params.points) ? params.points : [];
        if (rawPoints.length < 2 || rawPoints.length > PROFILE_MAX_POINTS) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: `Parameter "points" must contain between 2 and ${PROFILE_MAX_POINTS} {lat, lon} entries.`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        const surface = resolveSurface(params.surface);
        const layer = LAYER_BY_SURFACE[surface];

        const points: GebcoElevationPoint[] = await Promise.all(
          rawPoints.map(async (p) => {
            const entry = p as Record<string, unknown>;
            const lat = requireLat(entry.lat, req);
            const lon = requireLon(entry.lon, req);
            const elevation_meters = await this.fetchElevation(lat, lon, layer, req).catch(
              () => null,
            );
            return { lat, lon, elevation_meters };
          }),
        );

        const body = {
          surface,
          unit: 'meters',
          note: ELEVATION_NOTE,
          count: points.length,
          points,
        };
        return {
          status: 200,
          headers: {},
          body,
          durationMs: Math.round(performance.now() - start),
          byteLength: JSON.stringify(body).length,
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

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async fetchElevation(
    lat: number,
    lon: number,
    layer: string,
    req: ProviderRequest,
  ): Promise<number | null> {
    const bbox = [
      lon - BBOX_HALF_DEGREE,
      lat - BBOX_HALF_DEGREE,
      lon + BBOX_HALF_DEGREE,
      lat + BBOX_HALF_DEGREE,
    ]
      .map((v) => v.toFixed(6))
      .join(',');
    const qs = new URLSearchParams({
      service: 'WMS',
      version: '1.1.1',
      request: 'GetFeatureInfo',
      layers: layer,
      query_layers: layer,
      srs: 'EPSG:4326',
      bbox,
      width: '100',
      height: '100',
      x: '50',
      y: '50',
      info_format: 'text/plain',
      feature_count: '1',
    });
    const text = await this.fetchText(`${GEBCO_WMS_BASE}?${qs.toString()}`, req);
    const match = text.match(/value_list\s*=\s*'(-?\d+(?:\.\d+)?)'/);
    return match ? Number(match[1]) : null;
  }

  private async fetchText(url: string, req: ProviderRequest): Promise<string> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        await sleep(PROVIDER_BACKOFF_BASE_MS * Math.pow(2, attempt - 1));
      }

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: GEBCO_HEADERS,
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (response.status >= 500) {
          throw {
            code: ProviderErrorCode.UNAVAILABLE,
            httpStatus: 502,
            message: `GEBCO WMS returned ${response.status}`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        if (response.status === 429) {
          throw {
            code: ProviderErrorCode.RATE_LIMIT,
            httpStatus: 429,
            message: 'GEBCO WMS rate limit exceeded',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        if (response.status >= 400) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: `GEBCO WMS rejected the request (HTTP ${response.status})`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }

        return await response.text();
      } catch (error) {
        const err = error as { code?: string };
        lastError = error;
        if (err.code === ProviderErrorCode.UNAVAILABLE) {
          continue;
        }
        throw error;
      }
    }

    throw lastError;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveSurface(value: unknown): string {
  const surface = typeof value === 'string' && value.length > 0 ? value : 'standard';
  return surface in LAYER_BY_SURFACE ? surface : 'standard';
}

function requireLat(value: unknown, req: ProviderRequest): number {
  const lat = Number(value);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw {
      code: ProviderErrorCode.INPUT_REJECTED,
      httpStatus: 422,
      message: 'Parameter "lat" must be a number between -90 and 90.',
      provider: 'gebco',
      toolId: req.toolId,
      durationMs: 0,
    };
  }
  return lat;
}

function requireLon(value: unknown, req: ProviderRequest): number {
  const lon = Number(value);
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw {
      code: ProviderErrorCode.INPUT_REJECTED,
      httpStatus: 422,
      message: 'Parameter "lon" must be a number between -180 and 180.',
      provider: 'gebco',
      toolId: req.toolId,
      durationMs: 0,
    };
  }
  return lon;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
