import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  StedsnavnNavnResponse,
  StedsnavnStedResponse,
  StedsnavnNavnHit,
  StedsnavnNavneform,
} from './types';

const STEDSNAVN_BASE = 'https://ws.geonorge.no/stedsnavn/v1';
const HEADERS = { Accept: 'application/json' };

/**
 * Kartverket Stedsnavn (Norwegian Place Names) API adapter (UC-681).
 *
 * ws.geonorge.no/stedsnavn/v1 is a no-auth, public REST API run by Kartverket (the
 * Norwegian Mapping Authority) publishing the official national register of place names —
 * every approved Norwegian place name (by/city, municipality, lake, mountain, street, etc.)
 * with status, language, and representative coordinates. Published under NLOD 2.0 (Norsk
 * lisens for offentlige data), Norway's standard open-government-data licence — equivalent
 * to CC BY 4.0, free reuse including commercial with attribution.
 *
 * Tools:
 *   norway-kartverket-stedsnavn.search_names     -> GET /navn   — text search for place names
 *   norway-kartverket-stedsnavn.search_by_point  -> GET /punkt  — reverse lookup near a coordinate
 *   norway-kartverket-stedsnavn.get_place        -> GET /sted   — full place record by stedsnummer id
 *
 * Response-size discipline: `treffPerSide` (page size) is capped well below the upstream's
 * default (10) ceiling for search tools to keep responses small and predictable.
 */
export class NorwayKartverketStedsnavnAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'norway-kartverket-stedsnavn',
      baseUrl: STEDSNAVN_BASE,
      maxResponseBytes: 1_000_000,
    });
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

  private clampInt(value: unknown, min: number, max: number, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.min(Math.max(Math.round(value), min), max);
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;

    switch (req.toolId) {
      case 'norway-kartverket-stedsnavn.search_names': {
        const query = params.query;
        if (typeof query !== 'string' || query.trim() === '') {
          throw this.invalidInput(req.toolId, 'query is required and must be a non-empty string');
        }
        const treffPerSide = this.clampInt(params.limit, 1, 30, 10);
        const qs = new URLSearchParams({
          sok: query,
          treffPerSide: String(treffPerSide),
        });
        if (typeof params.fuzzy === 'boolean') qs.set('fuzzy', String(params.fuzzy));
        if (typeof params.county === 'string' && params.county.trim() !== '') {
          qs.set('fylkesnavn', params.county);
        }
        if (typeof params.municipality === 'string' && params.municipality.trim() !== '') {
          qs.set('kommunenavn', params.municipality);
        }
        return {
          url: `${STEDSNAVN_BASE}/navn?${qs.toString()}`,
          method: 'GET',
          headers: HEADERS,
        };
      }

      case 'norway-kartverket-stedsnavn.search_by_point': {
        const lat = params.lat;
        const lng = params.lng;
        if (typeof lat !== 'number' || typeof lng !== 'number') {
          throw this.invalidInput(req.toolId, 'lat and lng are required numbers');
        }
        if (lat < 57 || lat > 72 || lng < 4 || lng > 32) {
          throw this.invalidInput(
            req.toolId,
            'lat/lng must fall within Norway (lat 57-72, lng 4-32)',
          );
        }
        const radiusM = this.clampInt(params.radius_m, 10, 10_000, 500);
        const treffPerSide = this.clampInt(params.limit, 1, 30, 10);
        const qs = new URLSearchParams({
          nord: String(lat),
          ost: String(lng),
          koordsys: '4258',
          radius: String(radiusM),
          treffPerSide: String(treffPerSide),
        });
        return {
          url: `${STEDSNAVN_BASE}/punkt?${qs.toString()}`,
          method: 'GET',
          headers: HEADERS,
        };
      }

      case 'norway-kartverket-stedsnavn.get_place': {
        const stedsnummer = params.place_id;
        if (typeof stedsnummer !== 'number' && typeof stedsnummer !== 'string') {
          throw this.invalidInput(
            req.toolId,
            'place_id is required (stedsnummer, e.g. 307915 for Oslo)',
          );
        }
        const qs = new URLSearchParams({ stedsnummer: String(stedsnummer) });
        return {
          url: `${STEDSNAVN_BASE}/sted?${qs.toString()}`,
          method: 'GET',
          headers: HEADERS,
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
    switch (req.toolId) {
      case 'norway-kartverket-stedsnavn.search_names': {
        const body = raw.body as StedsnavnNavnResponse;
        const hits = body.navn ?? [];
        return {
          matched: body.metadata?.totaltAntallTreff ?? hits.length,
          returned: hits.length,
          names: hits.map((h: StedsnavnNavnHit) => ({
            place_id: h.stedsnummer,
            status: h.stedstatus,
            type: h.navneobjekttype,
            name: h.skrivemåte,
            name_status: h.navnestatus,
            language: h.språk ?? null,
            county: h.fylker?.[0]?.fylkesnavn ?? null,
            municipality: h.kommuner?.[0]?.kommunenavn ?? null,
            lat: h.representasjonspunkt?.nord ?? null,
            lng: h.representasjonspunkt?.øst ?? null,
          })),
        };
      }

      case 'norway-kartverket-stedsnavn.search_by_point': {
        const body = raw.body as StedsnavnNavnResponse;
        const hits = body.navn ?? [];
        return {
          matched: body.metadata?.totaltAntallTreff ?? hits.length,
          returned: hits.length,
          names: hits.map((h: StedsnavnNavnHit) => ({
            place_id: h.stedsnummer,
            type: h.navneobjekttype,
            name: h.skrivemåte,
            municipality: h.kommuner?.[0]?.kommunenavn ?? null,
            lat: h.representasjonspunkt?.nord ?? null,
            lng: h.representasjonspunkt?.øst ?? null,
          })),
        };
      }

      case 'norway-kartverket-stedsnavn.get_place': {
        const body = raw.body as StedsnavnStedResponse;
        const hit = body.navn?.[0];
        if (!hit) {
          return { place_id: null, found: false };
        }
        return {
          place_id: hit.stedsnummer,
          found: true,
          status: hit.stedstatus,
          type: hit.navneobjekttype,
          county: hit.fylker?.[0]?.fylkesnavn ?? null,
          municipality: hit.kommuner?.[0]?.kommunenavn ?? null,
          lat: hit.representasjonspunkt?.nord ?? null,
          lng: hit.representasjonspunkt?.øst ?? null,
          updated: hit.oppdateringsdato ?? null,
          names: (hit.stedsnavn ?? []).map((n: StedsnavnNavneform) => ({
            name: n.skrivemåte,
            status: n.navnestatus,
            language: n.språk ?? null,
          })),
          geometry: hit.geojson?.geometry ?? null,
        };
      }

      default:
        return raw.body;
    }
  }
}
