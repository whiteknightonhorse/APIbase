import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { OdsPage, FossLandingRow, FossSurveySpeciesRow, FossSurveyCatchRow } from './types';

const FOSS_BASE = 'https://apps-st.fisheries.noaa.gov/ods/foss';

/** Free-text names go into an Oracle $like pattern: allow letters, digits, space, comma, hyphen, apostrophe, period. */
const TEXT_RE = /^[A-Za-z0-9 ,.'-]{1,80}$/;

/**
 * NOAA Fisheries FOSS adapter (UC-797).
 *
 * Fisheries One Stop Shop (Oracle REST Data Services) — US commercial/recreational landings
 * and AFSC bottom-trawl groundfish survey data. Public US Government data, no auth.
 *   noaa-fisheries-stats.landings       -> GET /landings/?q={json}
 *   noaa-fisheries-stats.survey_species -> GET /afsc_groundfish_survey_species/?q={json}
 *   noaa-fisheries-stats.survey_catch   -> GET /afsc_groundfish_survey_catch/?q={json}
 */
export class NoaaFisheriesStatsAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'noaa-fisheries-stats', baseUrl: FOSS_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers = {
      Accept: 'application/json',
      'User-Agent': 'APIbase/1.0 (https://apibase.pro)',
    };
    const limit = Math.min(Math.max(Number(params.limit) || 25, 1), 100);
    const offset = Math.max(Number(params.offset) || 0, 0);

    let table: string;
    const q: Record<string, unknown> = {};

    switch (req.toolId) {
      case 'noaa-fisheries-stats.landings': {
        table = 'landings';
        if (params.species) {
          q.ts_afs_name = {
            $like: `%${this.text(req.toolId, 'species', params.species).toUpperCase()}%`,
          };
        }
        if (params.state) q.state_name = this.text(req.toolId, 'state', params.state).toUpperCase();
        if (params.region) q.region_name = this.text(req.toolId, 'region', params.region);
        if (params.collection) q.collection = String(params.collection);
        const from = params.year_from === undefined ? undefined : Number(params.year_from);
        const to = params.year_to === undefined ? undefined : Number(params.year_to);
        if (from !== undefined && to !== undefined) q.year = { $between: [from, to] };
        else if (from !== undefined) q.year = { $gte: from };
        else if (to !== undefined) q.year = { $lte: to };
        break;
      }
      case 'noaa-fisheries-stats.survey_species': {
        table = 'afsc_groundfish_survey_species';
        if (params.common_name) {
          q.common_name = {
            $like: `%${this.text(req.toolId, 'common_name', params.common_name).toLowerCase()}%`,
          };
        }
        if (params.scientific_name) {
          q.scientific_name = {
            $like: `%${this.text(req.toolId, 'scientific_name', params.scientific_name)}%`,
          };
        }
        break;
      }
      case 'noaa-fisheries-stats.survey_catch': {
        table = 'afsc_groundfish_survey_catch';
        const code = Number(params.species_code);
        if (!Number.isInteger(code) || code <= 0) {
          throw this.invalidInput(req.toolId, 'species_code must be a positive integer');
        }
        q.species_code = code;
        if (params.hauljoin !== undefined) q.hauljoin = Number(params.hauljoin);
        break;
      }
      default:
        throw this.invalidInput(req.toolId, `Unknown tool: ${req.toolId}`);
    }

    const qp = new URLSearchParams();
    if (Object.keys(q).length > 0) qp.set('q', JSON.stringify(q));
    qp.set('limit', String(limit));
    if (offset) qp.set('offset', String(offset));
    return { url: `${FOSS_BASE}/${table}/?${qp.toString()}`, method: 'GET', headers };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as OdsPage<Record<string, unknown>>;
    const items = body.items ?? [];
    const page = {
      count: items.length,
      has_more: body.hasMore ?? false,
      offset: body.offset ?? 0,
    };

    switch (req.toolId) {
      case 'noaa-fisheries-stats.landings':
        return {
          ...page,
          landings: (items as FossLandingRow[]).map((r) => ({
            species: r.ts_afs_name ?? null,
            scientific_name: r.ts_scientific_name ?? null,
            tsn: r.tsn ?? null,
            region: r.region_name ?? null,
            state: r.state_name ?? null,
            year: r.year ?? null,
            pounds: r.pounds ?? null,
            dollars: r.dollars ?? null,
            fish_count: r.tot_count ?? null,
            source: r.source ?? null,
            collection: r.collection ?? null,
          })),
        };
      case 'noaa-fisheries-stats.survey_species':
        return {
          ...page,
          species: (items as FossSurveySpeciesRow[]).map((r) => ({
            species_code: r.species_code ?? null,
            scientific_name: r.scientific_name ?? null,
            common_name: r.common_name ?? null,
            rank: r.id_rank ?? null,
            worms_aphia_id: r.worms ?? null,
            itis_tsn: r.itis ?? null,
          })),
        };
      default:
        return {
          ...page,
          catches: (items as FossSurveyCatchRow[]).map((r) => ({
            hauljoin: r.hauljoin ?? null,
            species_code: r.species_code ?? null,
            cpue_kg_per_km2: r.cpue_kgkm2 ?? null,
            cpue_count_per_km2: r.cpue_nokm2 ?? null,
            count: r.count ?? null,
            weight_kg: r.weight_kg ?? null,
            taxon_confidence: r.taxon_confidence ?? null,
          })),
        };
    }
  }

  private text(toolId: string, field: string, value: unknown): string {
    const s = String(value).trim();
    if (!TEXT_RE.test(s)) {
      throw this.invalidInput(
        toolId,
        `${field} must be 1-80 characters (letters, digits, space, , . ' -)`,
      );
    }
    return s;
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
