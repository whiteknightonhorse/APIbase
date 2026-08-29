import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { GeoBoundariesRecord, GeoBoundariesResponse } from './types';

const GB_BASE = 'https://www.geoboundaries.org/api/current/gbOpen';

const ADM_LEVELS = ['ADM0', 'ADM1', 'ADM2', 'ADM3', 'ADM4', 'ADM5'] as const;
type AdmLevel = (typeof ADM_LEVELS)[number];

/** ISO 3166-1 alpha-3 country code, e.g. "USA", "KEN". Case-sensitive uppercase upstream. */
const ISO3_RE = /^[A-Z]{3}$/;

function summarizeRecord(r: GeoBoundariesRecord) {
  return {
    boundary_id: r.boundaryID,
    name: r.boundaryName,
    iso3: r.boundaryISO,
    adm_level: r.boundaryType,
    local_admin_name: r.boundaryCanonical,
    admin_unit_count: Number(r.admUnitCount) || 0,
    year_represented: r.boundaryYearRepresented,
    continent: r.Continent,
    unsdg_region: r['UNSDG-region'],
    unsdg_subregion: r['UNSDG-subregion'],
    world_bank_income_group: r.worldBankIncomeGroup,
    source: r.boundarySource,
    license: r.boundaryLicense,
    license_source_url: r.licenseSource,
    mean_area_sq_km: Number(r.meanAreaSqKM) || 0,
    mean_perimeter_km: Number(r.meanPerimeterLengthKM) || 0,
    geojson_url: r.gjDownloadURL,
    simplified_geojson_url: r.simplifiedGeometryGeoJSON,
    topojson_url: r.tjDownloadURL,
    preview_image_url: r.imagePreview,
    all_formats_zip_url: r.staticDownloadLink,
  };
}

/**
 * geoBoundaries public REST API adapter (UC-631).
 *
 * www.geoboundaries.org/api/current/gbOpen/{ISO3}/{ADM_LEVEL}/ exposes metadata (name, admin
 * unit count, area/perimeter stats, license, source) plus download links for the actual
 * boundary geometry files (full GeoJSON, simplified GeoJSON, TopoJSON, preview PNG), hosted on
 * GitHub. No auth, public domain / open licenses (varies per country, always documented in the
 * response). ISO3 accepts "ALL" as a wildcard to list every country at one ADM level; ADM level
 * accepts "ALL" to list every level for one country — both wildcards return a JSON array instead
 * of a single object.
 *
 * IMPORTANT: full (non-simplified) and even simplified GeoJSON geometry files can be tens of MB
 * (e.g. RUS ADM1 simplified = ~9.7MB) — far beyond the platform's response size cap. This adapter
 * NEVER downloads/re-serves geometry; tools return metadata + the upstream download URLs so
 * agents fetch geometry directly from GitHub only when they actually need it.
 *
 *   geoboundaries.boundary.detail           -> single country+level metadata record
 *   geoboundaries.boundary.list_countries   -> every country's metadata at one ADM level
 *   geoboundaries.boundary.available_levels -> which ADM0-ADM5 levels exist for one country
 */
export class GeoBoundariesAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'geoboundaries', baseUrl: GB_BASE, maxResponseBytes: 1_500_000 });
  }

  private validateIso3(value: unknown, req: ProviderRequest): string {
    const iso3 = String(value ?? '')
      .trim()
      .toUpperCase();
    if (!ISO3_RE.test(iso3)) {
      throw this.invalidInput(
        req.toolId,
        'country must be a 3-letter ISO 3166-1 alpha-3 code (e.g. USA, KEN)',
      );
    }
    return iso3;
  }

  private validateAdmLevel(value: unknown, req: ProviderRequest, allowAll = false): string {
    const level = String(value ?? 'ADM0')
      .trim()
      .toUpperCase();
    if (allowAll && level === 'ALL') return level;
    if (!ADM_LEVELS.includes(level as AdmLevel)) {
      throw this.invalidInput(
        req.toolId,
        `adm_level must be one of: ${ADM_LEVELS.join(', ')}${allowAll ? ', ALL' : ''}`,
      );
    }
    return level;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'geoboundaries.boundary.detail': {
        const country = this.validateIso3(params.country, req);
        const admLevel = this.validateAdmLevel(params.adm_level, req);
        return {
          url: `${GB_BASE}/${country}/${admLevel}/`,
          method: 'GET',
          headers: { Accept: 'application/json' },
        };
      }

      case 'geoboundaries.boundary.list_countries': {
        const admLevel = this.validateAdmLevel(params.adm_level, req);
        return {
          url: `${GB_BASE}/ALL/${admLevel}/`,
          method: 'GET',
          headers: { Accept: 'application/json' },
        };
      }

      case '__geoboundaries_probe__': {
        const country = String(params.__country);
        const level = String(params.__level);
        return {
          url: `${GB_BASE}/${country}/${level}/`,
          method: 'GET',
          headers: { Accept: 'application/json' },
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
    const body = raw.body as GeoBoundariesResponse;

    switch (req.toolId) {
      case 'geoboundaries.boundary.detail': {
        const record = body as GeoBoundariesRecord;
        return summarizeRecord(record);
      }

      case 'geoboundaries.boundary.list_countries': {
        const records = Array.isArray(body) ? body : [body as GeoBoundariesRecord];
        return {
          adm_level: (req.params as Record<string, unknown>).adm_level || 'ADM0',
          count: records.length,
          countries: records.map(summarizeRecord),
        };
      }

      case '__geoboundaries_probe__':
        return body as GeoBoundariesRecord;

      default:
        return body;
    }
  }

  /**
   * geoboundaries.boundary.available_levels fans out ADM0..ADM5 requests for one country
   * (the upstream API 404s per-level rather than exposing a "levels available" endpoint) and
   * reports which levels exist. Overrides call() because it needs multiple upstream requests
   * per tool invocation, unlike buildRequest/parseResponse's single-request contract.
   */
  override async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    if (req.toolId !== 'geoboundaries.boundary.available_levels') {
      return super.call(req);
    }

    const start = performance.now();
    const params = req.params as Record<string, unknown>;
    const country = this.validateIso3(params.country, req);

    const results = await Promise.all(
      ADM_LEVELS.map(async (level) => {
        try {
          const raw = await super.call({
            ...req,
            toolId: '__geoboundaries_probe__',
            params: { __country: country, __level: level },
          });
          const record = raw.body as GeoBoundariesRecord;
          return {
            adm_level: level,
            available: true,
            local_admin_name: record.boundaryCanonical,
            admin_unit_count: Number(record.admUnitCount) || 0,
          };
        } catch {
          return { adm_level: level, available: false };
        }
      }),
    );

    const body = {
      country,
      levels: results,
    };

    return {
      status: 200,
      headers: {},
      body,
      durationMs: Math.round(performance.now() - start),
      byteLength: JSON.stringify(body).length,
    };
  }

  private invalidInput(toolId: string, message: string): never {
    throw {
      code: ProviderErrorCode.INPUT_REJECTED,
      httpStatus: 422,
      message,
      provider: this.provider,
      toolId,
      durationMs: 0,
    };
  }
}
