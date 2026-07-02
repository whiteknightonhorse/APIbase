import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { P2pQuakeEvent, P2pTsunamiEvent, P2pHistoryEvent } from './types';

// JMA seismic intensity scale × 10 → human-readable label
const SCALE_LABEL: Record<number, string> = {
  '-1': 'Unknown',
  10: 'Shindo 1',
  20: 'Shindo 2',
  30: 'Shindo 3',
  40: 'Shindo 4',
  45: 'Shindo 4+',
  50: 'Shindo 5 (weak)',
  55: 'Shindo 5 (strong)',
  60: 'Shindo 6 (weak)',
  65: 'Shindo 6 (strong)',
  70: 'Shindo 7',
};

function scaleLabel(scale: number): string {
  return SCALE_LABEL[scale] ?? `Scale ${scale}`;
}

/**
 * P2PQuake adapter (UC-592).
 *
 * Supported tools (read-only):
 *   p2pquake.recent_quakes    → GET /v2/jma/quake
 *   p2pquake.tsunami_warnings → GET /v2/jma/tsunami
 *   p2pquake.quake_history    → GET /v2/history?codes=551
 *
 * Auth: None (open data, community-operated, MIT-licensed).
 */
export class P2pquakeAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'p2pquake',
      baseUrl: 'https://api.p2pquake.net',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'p2pquake.recent_quakes':
        return this.buildRecentQuakesRequest(params, headers);
      case 'p2pquake.tsunami_warnings':
        return this.buildTsunamiRequest(params, headers);
      case 'p2pquake.quake_history':
        return this.buildHistoryRequest(params, headers);
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
      case 'p2pquake.recent_quakes':
        return this.parseQuakes(body as P2pQuakeEvent[]);
      case 'p2pquake.tsunami_warnings':
        return this.parseTsunami(body as P2pTsunamiEvent[]);
      case 'p2pquake.quake_history':
        return this.parseHistory(body as P2pHistoryEvent[]);
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildRecentQuakesRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', String(params.limit));
    else qs.set('limit', '10');
    if (params.offset) qs.set('offset', String(params.offset));
    if (params.order !== undefined) qs.set('order', String(params.order));
    if (params.min_scale !== undefined) qs.set('min_scale', String(params.min_scale));
    if (params.max_scale !== undefined) qs.set('max_scale', String(params.max_scale));
    if (params.min_magnitude !== undefined) qs.set('min_magnitude', String(params.min_magnitude));
    if (params.max_magnitude !== undefined) qs.set('max_magnitude', String(params.max_magnitude));
    if (params.prefecture !== undefined) qs.set('prefecture', String(params.prefecture));
    if (params.quake_type) qs.set('quake_type', String(params.quake_type));

    return {
      url: `${this.baseUrl}/v2/jma/quake?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildTsunamiRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', String(params.limit));
    else qs.set('limit', '10');
    if (params.offset) qs.set('offset', String(params.offset));
    if (params.order !== undefined) qs.set('order', String(params.order));

    return {
      url: `${this.baseUrl}/v2/jma/tsunami?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildHistoryRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('codes', '551');
    if (params.limit) qs.set('limit', String(params.limit));
    else qs.set('limit', '20');
    if (params.offset) qs.set('offset', String(params.offset));
    if (params.order !== undefined) qs.set('order', String(params.order));
    if (params.min_scale !== undefined) qs.set('min_scale', String(params.min_scale));
    if (params.max_scale !== undefined) qs.set('max_scale', String(params.max_scale));
    if (params.min_magnitude !== undefined) qs.set('min_magnitude', String(params.min_magnitude));
    if (params.max_magnitude !== undefined) qs.set('max_magnitude', String(params.max_magnitude));
    if (params.prefecture !== undefined) qs.set('prefecture', String(params.prefecture));

    return {
      url: `${this.baseUrl}/v2/history?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // Response parsers
  // ---------------------------------------------------------------------------

  private parseQuakes(events: P2pQuakeEvent[]): unknown {
    return {
      count: events.length,
      earthquakes: events.map((e) => ({
        id: e.id,
        time: e.earthquake?.time ?? null,
        issued_at: e.issue?.time ?? null,
        issue_type: e.issue?.type ?? null,
        source: e.issue?.source ?? null,
        hypocenter: e.earthquake?.hypocenter
          ? {
              name: e.earthquake.hypocenter.name,
              latitude:
                e.earthquake.hypocenter.latitude === -200 ? null : e.earthquake.hypocenter.latitude,
              longitude:
                e.earthquake.hypocenter.longitude === -200
                  ? null
                  : e.earthquake.hypocenter.longitude,
              depth_km: e.earthquake.hypocenter.depth === -1 ? null : e.earthquake.hypocenter.depth,
              magnitude:
                e.earthquake.hypocenter.magnitude === -1 ? null : e.earthquake.hypocenter.magnitude,
            }
          : null,
        max_intensity: e.earthquake?.maxScale != null ? scaleLabel(e.earthquake.maxScale) : null,
        max_scale_raw: e.earthquake?.maxScale ?? null,
        domestic_tsunami: e.earthquake?.domesticTsunami ?? null,
        foreign_tsunami: e.earthquake?.foreignTsunami ?? null,
        correction: e.issue?.correct ?? null,
        remarks: e.comments?.freeFormComment ?? null,
        observation_points: (e.points ?? []).map((p) => ({
          prefecture: p.pref,
          address: p.addr,
          intensity: scaleLabel(p.scale),
          scale_raw: p.scale,
          is_area: p.isArea,
        })),
      })),
    };
  }

  private parseTsunami(events: P2pTsunamiEvent[]): unknown {
    return {
      count: events.length,
      warnings: events.map((e) => ({
        id: e.id,
        issued_at: e.issue?.time ?? null,
        issue_type: e.issue?.type ?? null,
        source: e.issue?.source ?? null,
        cancelled: e.cancelled,
        triggering_quake: e.earthquake?.hypocenter
          ? {
              name: e.earthquake.hypocenter.name,
              magnitude:
                e.earthquake.hypocenter.magnitude === -1 ? null : e.earthquake.hypocenter.magnitude,
              latitude:
                e.earthquake.hypocenter.latitude === -200 ? null : e.earthquake.hypocenter.latitude,
              longitude:
                e.earthquake.hypocenter.longitude === -200
                  ? null
                  : e.earthquake.hypocenter.longitude,
            }
          : null,
        coastal_areas: (e.areas ?? []).map((a) => ({
          name: a.name,
          grade: a.grade,
          immediate_danger: a.immediate,
          estimated_height_m: a.maxHeight?.value ?? null,
          height_condition: a.maxHeight?.condition ?? null,
          first_arrival: a.firstHeight?.arrivalTime ?? null,
          arrival_condition: a.firstHeight?.condition ?? null,
        })),
      })),
    };
  }

  private parseHistory(events: P2pHistoryEvent[]): unknown {
    const quakes = events.filter(
      (e) => (e as Record<string, unknown>).code === 551,
    ) as P2pQuakeEvent[];
    return {
      count: quakes.length,
      earthquakes: quakes.map((e) => ({
        id: e.id,
        time: e.earthquake?.time ?? null,
        issued_at: e.issue?.time ?? null,
        issue_type: e.issue?.type ?? null,
        hypocenter: e.earthquake?.hypocenter
          ? {
              name: e.earthquake.hypocenter.name,
              latitude:
                e.earthquake.hypocenter.latitude === -200 ? null : e.earthquake.hypocenter.latitude,
              longitude:
                e.earthquake.hypocenter.longitude === -200
                  ? null
                  : e.earthquake.hypocenter.longitude,
              depth_km: e.earthquake.hypocenter.depth === -1 ? null : e.earthquake.hypocenter.depth,
              magnitude:
                e.earthquake.hypocenter.magnitude === -1 ? null : e.earthquake.hypocenter.magnitude,
            }
          : null,
        max_intensity: e.earthquake?.maxScale != null ? scaleLabel(e.earthquake.maxScale) : null,
        max_scale_raw: e.earthquake?.maxScale ?? null,
        domestic_tsunami: e.earthquake?.domesticTsunami ?? null,
        correction: e.issue?.correct ?? null,
        observation_count: (e.points ?? []).length,
      })),
    };
  }
}
