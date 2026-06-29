import { BaseAdapter } from '../base.adapter';
import { logger } from '../../config/logger';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { CatalogResponse, CatalogDatasetRaw } from './types';

const OTP_BASE = 'https://portal.opentopography.org/API';

/** Available global DEM dataset identifiers for the /API/globaldem endpoint. */
const GLOBAL_DATASETS = new Set([
  'SRTMGL3',
  'SRTMGL1',
  'SRTMGL1_E',
  'AW3D30',
  'AW3D30_E',
  'SRTM15Plus',
  'NASADEM',
  'COP30',
  'COP90',
  'EU_DTM',
  'GEDI_L3',
  'GEBCOIceTopo',
  'GEBCOSubIceTopo',
]);

/**
 * OpenTopography adapter (UC-537).
 *
 * Portal: https://portal.opentopography.org
 * Auth: API key query param (free registration, 5K req/day, CC BY 4.0)
 *
 * Supported tools (read-only):
 *   opentopo.elevation_point → /API/globaldem (AAIGrid parse → JSON elevation)
 *   opentopo.elevation_area  → /API/globaldem (AAIGrid parse → JSON stats)
 *   opentopo.lidar_catalog   → /API/otCatalog (PointCloud JSON)
 *   opentopo.dem_catalog     → /API/otCatalog (Raster JSON)
 *
 * Elevation tools override call() because the API returns AAIGrid ASCII text,
 * not JSON. The catalog tools use normal JSON flow via super.call().
 */
export class OpenTopographyAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'opentopography',
      baseUrl: OTP_BASE,
      timeoutMs: 15_000,
    });
    this.apiKey = apiKey;
  }

  /**
   * Override call() to handle AAIGrid text responses for elevation tools.
   * Catalog tools return JSON and use the normal super.call() flow.
   */
  async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    if (req.toolId === 'opentopo.elevation_point' || req.toolId === 'opentopo.elevation_area') {
      return this.handleElevationCall(req);
    }
    return super.call(req);
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'opentopo.lidar_catalog':
        return this.buildCatalogRequest(params, headers, 'PointCloud');
      case 'opentopo.dem_catalog':
        return this.buildCatalogRequest(params, headers, 'Raster');
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
    const body = raw.body as CatalogResponse;

    switch (req.toolId) {
      case 'opentopo.lidar_catalog':
      case 'opentopo.dem_catalog': {
        const datasets = (body.Datasets ?? []).map((d: CatalogDatasetRaw) => ({
          name: d.Dataset.name,
          id: d.Dataset.identifier?.value ?? null,
          short_name: d.Dataset.alternateName ?? null,
          url: d.Dataset.url ?? null,
          format: d.Dataset.fileFormat ?? null,
          date_created: d.Dataset.dateCreated ?? null,
          temporal_coverage: d.Dataset.temporalCoverage ?? null,
          bounding_box: d.Dataset.spatialCoverage?.geo?.box ?? null,
          description: d.Dataset.description
            ? d.Dataset.description
                .replace(/<[^>]*>/g, '')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 500)
            : null,
        }));
        return {
          count: datasets.length,
          datasets,
        };
      }
      default:
        return raw.body;
    }
  }

  // ---------------------------------------------------------------------------
  // Elevation handler — AAIGrid text parsing
  // ---------------------------------------------------------------------------

  private async handleElevationCall(req: ProviderRequest): Promise<ProviderRawResponse> {
    const params = req.params as Record<string, unknown>;
    const start = performance.now();

    const dataset = GLOBAL_DATASETS.has(String(params.dataset ?? ''))
      ? String(params.dataset)
      : 'SRTMGL1';

    let south: number, north: number, west: number, east: number;

    if (req.toolId === 'opentopo.elevation_point') {
      const lat = Number(params.lat);
      const lon = Number(params.lon);
      const half = 0.002;
      south = lat - half;
      north = lat + half;
      west = lon - half;
      east = lon + half;
    } else {
      south = Number(params.south);
      north = Number(params.north);
      west = Number(params.west);
      east = Number(params.east);
      // Enforce max 0.5° x 0.5° bbox to keep response size reasonable
      const latSpan = north - south;
      const lonSpan = east - west;
      if (latSpan > 0.5 || lonSpan > 0.5) {
        throw {
          code: ProviderErrorCode.INPUT_REJECTED,
          httpStatus: 422,
          message:
            `Bounding box too large: ${latSpan.toFixed(3)}° lat × ${lonSpan.toFixed(3)}° lon. ` +
            'Maximum allowed is 0.5° × 0.5°. For larger areas use the dem_catalog tool instead.',
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
      }
    }

    const qs = new URLSearchParams({
      demtype: dataset,
      south: String(south),
      north: String(north),
      west: String(west),
      east: String(east),
      outputFormat: 'AAIGrid',
      API_Key: this.apiKey,
    });

    const url = `${OTP_BASE}/globaldem?${qs.toString()}`;
    let response: Response;

    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Accept: '*/*' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const durationMs = Math.round(performance.now() - start);
      const isTimeout =
        error instanceof DOMException ||
        (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'));
      throw {
        code: isTimeout ? ProviderErrorCode.TIMEOUT : ProviderErrorCode.UNAVAILABLE,
        httpStatus: isTimeout ? 504 : 502,
        message: isTimeout
          ? `Provider call timed out after ${this.timeoutMs}ms`
          : `Provider connection failed: ${error instanceof Error ? error.message : 'unknown'}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs,
      };
    }

    const durationMs = Math.round(performance.now() - start);

    // Read text body (not JSON)
    const text = await response.text();

    if (response.status === 401 || response.status === 403) {
      throw {
        code: ProviderErrorCode.PROVIDER_AUTH,
        httpStatus: 503,
        message: `OpenTopography rejected our API key (HTTP ${response.status}): ${text.slice(0, 200)}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs,
      };
    }

    if (response.status === 429) {
      throw {
        code: ProviderErrorCode.RATE_LIMIT,
        httpStatus: 429,
        message: 'OpenTopography API rate limit exceeded (5,000 req/day for free tier)',
        provider: this.provider,
        toolId: req.toolId,
        durationMs,
        retryAfter: 3600,
      };
    }

    if (response.status >= 400 || text.includes('<error>')) {
      const detail = text.includes('<error>')
        ? text.replace(/<[^>]*>/g, '').trim()
        : text.slice(0, 300);
      throw {
        code:
          response.status >= 500 ? ProviderErrorCode.UNAVAILABLE : ProviderErrorCode.INPUT_REJECTED,
        httpStatus: response.status >= 500 ? 502 : 422,
        message: `OpenTopography error: ${detail}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs,
      };
    }

    // Parse AAIGrid ASCII text format into structured JSON
    const parsed = parseAaiGrid(text);
    if (!parsed) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'OpenTopography returned unexpected response format (expected AAIGrid)',
        provider: this.provider,
        toolId: req.toolId,
        durationMs,
      };
    }

    let body: unknown;

    if (req.toolId === 'opentopo.elevation_point') {
      const lat = Number(params.lat);
      const lon = Number(params.lon);
      // Return center cell elevation (or mean of all valid cells)
      const validValues = parsed.values.filter((v) => v !== parsed.nodata);
      const elevation =
        validValues.length > 0
          ? Math.round((validValues.reduce((a, b) => a + b, 0) / validValues.length) * 10) / 10
          : null;

      body = {
        lat,
        lon,
        elevation_m: elevation,
        dataset,
        resolution_m: datasetResolutionM(dataset),
        ncols: parsed.ncols,
        nrows: parsed.nrows,
        cellsize_deg: parsed.cellsize,
        nodata: elevation === null,
      };
    } else {
      // elevation_area: return stats
      const validValues = parsed.values.filter((v) => v !== parsed.nodata);
      const nodataCount = parsed.values.length - validValues.length;
      const minVal = validValues.length > 0 ? Math.min(...validValues) : 0;
      const maxVal = validValues.length > 0 ? Math.max(...validValues) : 0;
      const meanVal =
        validValues.length > 0
          ? Math.round((validValues.reduce((a, b) => a + b, 0) / validValues.length) * 10) / 10
          : 0;

      body = {
        dataset,
        resolution_m: datasetResolutionM(dataset),
        south,
        north,
        west,
        east,
        ncols: parsed.ncols,
        nrows: parsed.nrows,
        cell_count: parsed.values.length,
        valid_cells: validValues.length,
        nodata_cells: nodataCount,
        min_m: Math.round(minVal * 10) / 10,
        max_m: Math.round(maxVal * 10) / 10,
        mean_m: meanVal,
        range_m: Math.round((maxVal - minVal) * 10) / 10,
        cellsize_deg: parsed.cellsize,
      };
    }

    logger.info(
      { provider: this.provider, tool_id: req.toolId, duration_ms: durationMs, dataset },
      'OpenTopography elevation parsed from AAIGrid',
    );

    return {
      status: 200,
      headers: {},
      body,
      durationMs,
      byteLength: Buffer.byteLength(text, 'utf8'),
    };
  }

  // ---------------------------------------------------------------------------
  // Catalog request builder
  // ---------------------------------------------------------------------------

  private buildCatalogRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
    productFormat: 'PointCloud' | 'Raster',
  ): { url: string; method: string; headers: Record<string, string> } {
    const minx = Number(params.min_lon ?? params.west ?? -180);
    const miny = Number(params.min_lat ?? params.south ?? -90);
    const maxx = Number(params.max_lon ?? params.east ?? 180);
    const maxy = Number(params.max_lat ?? params.north ?? 90);

    const qs = new URLSearchParams({
      productFormat,
      minx: String(minx),
      miny: String(miny),
      maxx: String(maxx),
      maxy: String(maxy),
      detail: 'true',
      outputFormat: 'json',
      API_Key: this.apiKey,
    });

    return {
      url: `${OTP_BASE}/otCatalog?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }
}

// ---------------------------------------------------------------------------
// AAIGrid parser
// ---------------------------------------------------------------------------

interface AaiGridParsed {
  ncols: number;
  nrows: number;
  xllcorner: number;
  yllcorner: number;
  cellsize: number;
  nodata: number;
  values: number[];
}

function parseAaiGrid(text: string): AaiGridParsed | null {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 6) return null;

  const header: Record<string, number> = {};
  let dataStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^([a-zA-Z_]+)\s+(-?[\d.eE+\-]+)/);
    if (match) {
      header[match[1].toLowerCase()] = parseFloat(match[2]);
      dataStart = i + 1;
    } else {
      break;
    }
  }

  const ncols = Math.round(header['ncols'] ?? 0);
  const nrows = Math.round(header['nrows'] ?? 0);
  const xllcorner = header['xllcorner'] ?? header['xllcenter'] ?? 0;
  const yllcorner = header['yllcorner'] ?? header['yllcenter'] ?? 0;
  const cellsize = header['cellsize'] ?? 0;
  const nodata = header['nodata_value'] ?? -9999;

  if (ncols === 0 || nrows === 0) return null;

  const values: number[] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const rowVals = lines[i].split(/\s+/).map(Number);
    values.push(...rowVals);
  }

  return { ncols, nrows, xllcorner, yllcorner, cellsize, nodata, values };
}

/** Approximate native resolution in metres for common DEM datasets. */
function datasetResolutionM(dataset: string): number {
  const resMap: Record<string, number> = {
    SRTMGL3: 90,
    SRTMGL1: 30,
    SRTMGL1_E: 30,
    AW3D30: 30,
    AW3D30_E: 30,
    NASADEM: 30,
    COP30: 30,
    EU_DTM: 30,
    SRTM15Plus: 500,
    COP90: 90,
    GEDI_L3: 1000,
    GEBCOIceTopo: 500,
    GEBCOSubIceTopo: 500,
  };
  return resMap[dataset] ?? 30;
}
