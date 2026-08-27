import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  type ProviderError,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  InatTaxaSearchResponse,
  InatObservationsSearchResponse,
  InatSpeciesCountsResponse,
  InatPlacesSearchResponse,
} from './types';

const INATURALIST_BASE = 'https://api.inaturalist.org/v1';

/**
 * iNaturalist API adapter (UC-620).
 *
 * Global community wildlife-observation database (species ID, sightings, biodiversity
 * stats). Public, no-auth REST API. Docs: https://api.inaturalist.org/v1/docs/
 *   inaturalist.taxa_search        -> GET /taxa
 *   inaturalist.observations_search -> GET /observations
 *   inaturalist.species_counts     -> GET /observations/species_counts
 *   inaturalist.places_search      -> GET /places/autocomplete
 *
 * QUIRK: raw observation/taxon records are extremely verbose (~15-20KB each — full
 * ancestry chains, flag history, every photo size variant) so parseResponse() trims
 * every result down to the fields an agent actually needs, keeping normalized output
 * well under the 512KB budget even at the max per_page.
 *
 * Rate limit (upstream docs): throttled at 100 req/min, requested to stay under 60
 * req/min and 10,000 req/day — enforced upstream, not duplicated here.
 */
export class InaturalistAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'inaturalist', baseUrl: INATURALIST_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'inaturalist.taxa_search':
        return this.buildTaxaSearchRequest(params, headers);
      case 'inaturalist.observations_search':
        return this.buildObservationsSearchRequest(params, headers);
      case 'inaturalist.species_counts':
        return this.buildSpeciesCountsRequest(params, headers);
      case 'inaturalist.places_search':
        return this.buildPlacesSearchRequest(params, headers);
      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported tool: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        } satisfies ProviderError;
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    switch (req.toolId) {
      case 'inaturalist.taxa_search': {
        const data = raw.body as unknown as InatTaxaSearchResponse;
        return {
          total_results: data.total_results,
          results: (data.results ?? []).map((t) => ({
            taxon_id: t.id,
            name: t.name,
            rank: t.rank,
            preferred_common_name: t.preferred_common_name ?? null,
            iconic_taxon_name: t.iconic_taxon_name ?? null,
            observations_count: t.observations_count ?? 0,
            extinct: Boolean(t.extinct),
            threatened: Boolean(t.threatened),
            wikipedia_url: t.wikipedia_url ?? null,
            photo_url: t.default_photo?.url ?? null,
          })),
        };
      }
      case 'inaturalist.observations_search': {
        const data = raw.body as unknown as InatObservationsSearchResponse;
        return {
          total_results: data.total_results,
          results: (data.results ?? []).map((o) => ({
            observation_id: o.id,
            uuid: o.uuid,
            species_guess: o.species_guess ?? null,
            taxon: o.taxon
              ? {
                  taxon_id: o.taxon.id,
                  name: o.taxon.name,
                  preferred_common_name: o.taxon.preferred_common_name ?? null,
                  rank: o.taxon.rank,
                }
              : null,
            observed_on: o.observed_on ?? null,
            location: o.location ?? null,
            place_guess: o.place_guess ?? null,
            quality_grade: o.quality_grade ?? null,
            observer: o.user?.login ?? null,
            photo_url: o.photos?.[0]?.url ?? null,
            uri: o.uri ?? null,
          })),
        };
      }
      case 'inaturalist.species_counts': {
        const data = raw.body as unknown as InatSpeciesCountsResponse;
        return {
          total_results: data.total_results,
          results: (data.results ?? []).map((r) => ({
            observation_count: r.count,
            taxon_id: r.taxon.id,
            name: r.taxon.name,
            preferred_common_name: r.taxon.preferred_common_name ?? null,
            rank: r.taxon.rank,
            iconic_taxon_name: r.taxon.iconic_taxon_name ?? null,
          })),
        };
      }
      case 'inaturalist.places_search': {
        const data = raw.body as unknown as InatPlacesSearchResponse;
        return {
          total_results: data.total_results,
          results: (data.results ?? []).map((p) => ({
            place_id: p.id,
            name: p.name,
            display_name: p.display_name ?? null,
            place_type: p.place_type ?? null,
          })),
        };
      }
      default:
        return raw.body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildTaxaSearchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const query = params.query !== undefined ? String(params.query).trim() : '';
    if (!query) throw this.invalidInput('inaturalist.taxa_search', 'query is required');

    const qs = new URLSearchParams({ q: query });
    if (params.rank) qs.set('rank', String(params.rank));
    qs.set('per_page', String(this.clampPerPage(params.per_page, 10, 30)));

    return { url: `${INATURALIST_BASE}/taxa?${qs}`, method: 'GET', headers };
  }

  private buildObservationsSearchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const taxonName = params.taxon_name !== undefined ? String(params.taxon_name).trim() : '';
    const taxonId = params.taxon_id !== undefined ? String(params.taxon_id).trim() : '';
    const placeId = params.place_id !== undefined ? String(params.place_id).trim() : '';
    const lat = params.lat !== undefined ? Number(params.lat) : undefined;
    const lng = params.lng !== undefined ? Number(params.lng) : undefined;
    if (!taxonName && !taxonId && !placeId && lat === undefined) {
      throw this.invalidInput(
        'inaturalist.observations_search',
        'At least one of taxon_name, taxon_id, place_id, or lat/lng is required',
      );
    }

    const qs = new URLSearchParams();
    if (taxonName) qs.set('taxon_name', taxonName);
    if (taxonId) qs.set('taxon_id', taxonId);
    if (placeId) qs.set('place_id', placeId);
    if (lat !== undefined && lng !== undefined) {
      qs.set('lat', String(lat));
      qs.set('lng', String(lng));
      qs.set('radius', String(params.radius_km !== undefined ? Number(params.radius_km) : 10));
    }
    if (params.observed_after) qs.set('d1', String(params.observed_after));
    if (params.observed_before) qs.set('d2', String(params.observed_before));
    if (params.quality_grade) qs.set('quality_grade', String(params.quality_grade));
    qs.set('order_by', 'observed_on');
    qs.set('order', 'desc');
    qs.set('per_page', String(this.clampPerPage(params.per_page, 10, 20)));

    return { url: `${INATURALIST_BASE}/observations?${qs}`, method: 'GET', headers };
  }

  private buildSpeciesCountsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const placeId = params.place_id !== undefined ? String(params.place_id).trim() : '';
    if (!placeId) throw this.invalidInput('inaturalist.species_counts', 'place_id is required');

    const qs = new URLSearchParams({ place_id: placeId });
    if (params.taxon_id) qs.set('taxon_id', String(params.taxon_id));
    if (params.observed_after) qs.set('d1', String(params.observed_after));
    if (params.observed_before) qs.set('d2', String(params.observed_before));
    qs.set('per_page', String(this.clampPerPage(params.per_page, 20, 50)));

    return { url: `${INATURALIST_BASE}/observations/species_counts?${qs}`, method: 'GET', headers };
  }

  private buildPlacesSearchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const query = params.query !== undefined ? String(params.query).trim() : '';
    if (!query) throw this.invalidInput('inaturalist.places_search', 'query is required');

    const qs = new URLSearchParams({ q: query });
    qs.set('per_page', String(this.clampPerPage(params.per_page, 10, 20)));

    return { url: `${INATURALIST_BASE}/places/autocomplete?${qs}`, method: 'GET', headers };
  }

  private clampPerPage(value: unknown, fallback: number, max: number): number {
    const n = value !== undefined ? Number(value) : fallback;
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(1, Math.trunc(n)));
  }

  private invalidInput(toolId: string, message: string): never {
    throw {
      code: ProviderErrorCode.INPUT_REJECTED,
      httpStatus: 422,
      message,
      provider: this.provider,
      toolId,
      durationMs: 0,
    } satisfies ProviderError;
  }
}
