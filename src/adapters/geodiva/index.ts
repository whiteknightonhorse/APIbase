import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { GeoDivaVolcano, GeoDivaEruption } from './types';

const GEODIVA_BASE = 'https://geodiva.avo.alaska.edu';

/**
 * GeoDIVA (Alaska Volcano Observatory) API adapter (UC-644).
 *
 * geodiva.avo.alaska.edu is a no-auth, public-domain REST API run by the Alaska Volcano
 * Observatory (USGS / University of Alaska Fairbanks / Alaska DGGS) covering Alaska's 356
 * volcanoes and their documented eruption history. NOTE: the documentation lives at `/api`
 * (an HTML page), but the actual endpoints are served from the site root — `/api/volcanoes`
 * returns the same HTML doc page, not data; `/volcanoes` and `/eruptions` (no `/api` prefix)
 * are the real JSON endpoints.
 *
 * Response-size discipline (measured live): `/volcanoes` with no filter returns the full
 * 356-volcano catalog at ~370KB (safe, always fetched in full and filtered client-side since
 * the upstream API has no server-side query filters beyond a single `id` lookup). `/eruptions`
 * has NO row cap: unfiltered it returns 1022 records / ~2.1MB, and `sdate_end`/`edate_end`
 * alone (no matching `_start`) silently defaults the open bound to the full catalog history,
 * measured up to ~2.0MB — both far over the adapter's 1MB response-size budget. Therefore
 * eruption_search requires at least one of volcano_id, eruption_id, or a *paired*
 * start+end date range, and caps any date-range-only query (no volcano_id/eruption_id) to a
 * 20-year span — measured worst-case dense 20-year window ~691KB, safely under budget. A
 * date range combined with volcano_id is always safe regardless of span (busiest volcano,
 * Shishaldin/ak252, is 70 eruptions / ~165KB for its entire history).
 *   geodiva.volcano_list    -> browse/filter Alaska's 356 volcanoes (threat, age class, monitored)
 *   geodiva.volcano_detail  -> single volcano by ID, VNUM, or name (full description)
 *   geodiva.eruption_search -> eruption history filtered by volcano, eruption ID, or date range
 */
export class GeoDivaAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'geodiva', baseUrl: GEODIVA_BASE });
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

  private optString(value: unknown): string | undefined {
    if (value === undefined || value === null) return undefined;
    const s = String(value).trim();
    return s === '' ? undefined : s;
  }

  private extractYear(value: string): number {
    const match = /^-?\d+/.exec(value);
    return match ? parseInt(match[0], 10) : NaN;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;
    const headers = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'geodiva.volcano_list': {
        return { url: `${GEODIVA_BASE}/volcanoes`, method: 'GET', headers };
      }

      case 'geodiva.volcano_detail': {
        const id = this.optString(params.id);
        if (!id) {
          throw this.invalidInput(req.toolId, 'id is required');
        }
        const qs = new URLSearchParams({ id });
        return { url: `${GEODIVA_BASE}/volcanoes?${qs.toString()}`, method: 'GET', headers };
      }

      case 'geodiva.eruption_search': {
        const volcanoId = this.optString(params.volcano_id);
        const eruptionId = this.optString(params.eruption_id);
        const sdateStart = this.optString(params.sdate_start);
        const sdateEnd = this.optString(params.sdate_end);
        const edateStart = this.optString(params.edate_start);
        const edateEnd = this.optString(params.edate_end);

        if ((sdateStart === undefined) !== (sdateEnd === undefined)) {
          throw this.invalidInput(
            req.toolId,
            'sdate_start and sdate_end must be supplied together',
          );
        }
        if ((edateStart === undefined) !== (edateEnd === undefined)) {
          throw this.invalidInput(
            req.toolId,
            'edate_start and edate_end must be supplied together',
          );
        }

        const sPaired = sdateStart !== undefined && sdateEnd !== undefined;
        const ePaired = edateStart !== undefined && edateEnd !== undefined;

        if (!volcanoId && !eruptionId && !sPaired && !ePaired) {
          throw this.invalidInput(
            req.toolId,
            'supply at least one filter: volcano_id, eruption_id, or a paired date range (sdate_start+sdate_end / edate_start+edate_end)',
          );
        }

        // Unfiltered/date-only ranges can return the entire multi-decade catalog (measured
        // ~2MB) — cap to 20 years unless narrowed further by volcano_id/eruption_id.
        if (sPaired && !volcanoId && !eruptionId) {
          const span = Math.abs(
            this.extractYear(sdateEnd as string) - this.extractYear(sdateStart as string),
          );
          if (Number.isFinite(span) && span > 20) {
            throw this.invalidInput(
              req.toolId,
              'sdate_start/sdate_end span cannot exceed 20 years unless volcano_id or eruption_id is also given',
            );
          }
        }
        if (ePaired && !volcanoId && !eruptionId) {
          const span = Math.abs(
            this.extractYear(edateEnd as string) - this.extractYear(edateStart as string),
          );
          if (Number.isFinite(span) && span > 20) {
            throw this.invalidInput(
              req.toolId,
              'edate_start/edate_end span cannot exceed 20 years unless volcano_id or eruption_id is also given',
            );
          }
        }

        const qs = new URLSearchParams();
        if (volcanoId) qs.set('volcano_id', volcanoId);
        if (eruptionId) qs.set('eruption_id', eruptionId);
        if (sdateStart) qs.set('sdate_start', sdateStart);
        if (sdateEnd) qs.set('sdate_end', sdateEnd);
        if (edateStart) qs.set('edate_start', edateStart);
        if (edateEnd) qs.set('edate_end', edateEnd);
        return { url: `${GEODIVA_BASE}/eruptions?${qs.toString()}`, method: 'GET', headers };
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
    const params = (req.params ?? {}) as Record<string, unknown>;

    switch (req.toolId) {
      case 'geodiva.volcano_list': {
        let volcanoes = raw.body as GeoDivaVolcano[];

        const threatLevel = this.optString(params.threat_level);
        if (threatLevel) {
          volcanoes = volcanoes.filter((v) => v.NvewsThreat === threatLevel);
        }
        const ageClass = this.optString(params.age_class);
        if (ageClass) {
          volcanoes = volcanoes.filter((v) => v.AgeClass === ageClass);
        }
        if (params.monitored_only === true) {
          volcanoes = volcanoes.filter((v) => v.IsMonitored === true);
        }
        const nameContains = this.optString(params.name_contains);
        if (nameContains) {
          const needle = nameContains.toLowerCase();
          volcanoes = volcanoes.filter(
            (v) =>
              v.Volcano.toLowerCase().includes(needle) ||
              v.OfficialName.toLowerCase().includes(needle),
          );
        }

        return { returned: volcanoes.length, volcanoes };
      }

      case 'geodiva.volcano_detail': {
        return raw.body as GeoDivaVolcano;
      }

      case 'geodiva.eruption_search': {
        const eruptions = raw.body as GeoDivaEruption[];
        return { returned: eruptions.length, eruptions };
      }

      default:
        return raw.body;
    }
  }
}
