import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  GeonetQuakeCollection,
  GeonetQuakeStats,
  GeonetVolcanoAlertCollection,
} from './types';

const GEO_JSON_ACCEPT = 'application/vnd.geo+json;version=2';
const JSON_ACCEPT = 'application/json;version=2';

/**
 * GeoNet adapter (UC-649).
 *
 * Supported tools (read-only):
 *   geonet-nz.quake_search        → GET /quake?MMI=(int)
 *   geonet-nz.quake_detail        → GET /quake/(publicID)
 *   geonet-nz.quake_stats         → GET /quake/stats
 *   geonet-nz.volcano_alert_level → GET /volcano/val
 *
 * Auth: None (GeoNet Data Policy — data and images freely available, CC BY 3.0 NZ,
 * run by GNS Science). No documented rate limit.
 */
export class GeonetNzAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'geonet-nz',
      baseUrl: 'https://api.geonet.org.nz',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'geonet-nz.quake_search': {
        const mmi = requireMmi(params.mmi, req);
        return {
          url: `${this.baseUrl}/quake?MMI=${mmi}`,
          method: 'GET',
          headers: { Accept: GEO_JSON_ACCEPT },
        };
      }

      case 'geonet-nz.quake_detail': {
        const publicId = requirePublicId(params.public_id, req);
        return {
          url: `${this.baseUrl}/quake/${encodeURIComponent(publicId)}`,
          method: 'GET',
          headers: { Accept: GEO_JSON_ACCEPT },
        };
      }

      case 'geonet-nz.quake_stats':
        return {
          url: `${this.baseUrl}/quake/stats`,
          method: 'GET',
          headers: { Accept: JSON_ACCEPT },
        };

      case 'geonet-nz.volcano_alert_level':
        return {
          url: `${this.baseUrl}/volcano/val`,
          method: 'GET',
          headers: { Accept: GEO_JSON_ACCEPT },
        };

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
    const body = raw.body as unknown;

    switch (req.toolId) {
      case 'geonet-nz.quake_search':
        return this.parseQuakeSearch(body as GeonetQuakeCollection);
      case 'geonet-nz.quake_detail':
        return this.parseQuakeDetail(body as GeonetQuakeCollection, req);
      case 'geonet-nz.quake_stats':
        return this.parseQuakeStats(
          body as GeonetQuakeStats,
          req.params as Record<string, unknown>,
        );
      case 'geonet-nz.volcano_alert_level':
        return this.parseVolcanoAlertLevel(
          body as GeonetVolcanoAlertCollection,
          req.params as Record<string, unknown>,
        );
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Response parsers
  // ---------------------------------------------------------------------------

  private parseQuakeSearch(collection: GeonetQuakeCollection): unknown {
    const quakes = (collection.features ?? []).map((f) => ({
      public_id: f.properties.publicID,
      time: f.properties.time,
      latitude: f.geometry.coordinates[1],
      longitude: f.geometry.coordinates[0],
      depth_km: f.properties.depth,
      magnitude: f.properties.magnitude,
      locality: f.properties.locality,
      mmi: f.properties.mmi,
      quality: f.properties.quality,
    }));
    return { count: quakes.length, quakes };
  }

  private parseQuakeDetail(collection: GeonetQuakeCollection, req: ProviderRequest): unknown {
    const feature = (collection.features ?? [])[0];
    if (!feature) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: 'No quake found for the given public_id.',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }
    return {
      public_id: feature.properties.publicID,
      time: feature.properties.time,
      latitude: feature.geometry.coordinates[1],
      longitude: feature.geometry.coordinates[0],
      depth_km: feature.properties.depth,
      magnitude: feature.properties.magnitude,
      locality: feature.properties.locality,
      mmi: feature.properties.mmi,
      quality: feature.properties.quality,
    };
  }

  private parseQuakeStats(stats: GeonetQuakeStats, params: Record<string, unknown>): unknown {
    const days = typeof params.days === 'string' ? params.days : undefined;
    const magnitudeCount =
      days === '7'
        ? { days7: stats.magnitudeCount.days7 }
        : days === '28'
          ? { days28: stats.magnitudeCount.days28 }
          : days === '365'
            ? { days365: stats.magnitudeCount.days365 }
            : stats.magnitudeCount;
    return { magnitude_count_by_window: magnitudeCount, rate_per_day: stats.rate.perDay };
  }

  private parseVolcanoAlertLevel(
    collection: GeonetVolcanoAlertCollection,
    params: Record<string, unknown>,
  ): unknown {
    const volcanoId = typeof params.volcano_id === 'string' ? params.volcano_id : undefined;
    const volcanoes = (collection.features ?? [])
      .filter((f) => !volcanoId || f.properties.volcanoID === volcanoId)
      .map((f) => ({
        volcano_id: f.properties.volcanoID,
        volcano_title: f.properties.volcanoTitle,
        latitude: f.geometry.coordinates[1],
        longitude: f.geometry.coordinates[0],
        alert_level: f.properties.level,
        aviation_colour_code: f.properties.acc,
        activity: f.properties.activity,
        hazards: f.properties.hazards,
      }));
    return { count: volcanoes.length, volcanoes };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireMmi(value: unknown, req: ProviderRequest): number {
  const mmi = Number(value);
  if (!Number.isInteger(mmi) || mmi < -1 || mmi > 8) {
    throw {
      code: ProviderErrorCode.INPUT_REJECTED,
      httpStatus: 422,
      message: 'Parameter "mmi" must be an integer between -1 and 8.',
      provider: 'geonet-nz',
      toolId: req.toolId,
      durationMs: 0,
    };
  }
  return mmi;
}

function requirePublicId(value: unknown, req: ProviderRequest): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 32) {
    throw {
      code: ProviderErrorCode.INPUT_REJECTED,
      httpStatus: 422,
      message:
        'Parameter "public_id" must be a non-empty GeoNet quake publicID (e.g. 2014p715167).',
      provider: 'geonet-nz',
      toolId: req.toolId,
      durationMs: 0,
    };
  }
  return value;
}
