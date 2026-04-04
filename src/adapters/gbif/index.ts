import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  GbifSpeciesResult,
  GbifSpeciesSearchOutput,
  GbifSpeciesDetailOutput,
  GbifOccurrenceResult,
  GbifOccurrencesOutput,
  GbifOccurrenceCountOutput,
} from './types';

const GBIF_BASE = 'https://api.gbif.org/v1';

/**
 * GBIF adapter (UC-341).
 *
 * Global Biodiversity Information Facility — 2.5B+ species occurrences, 9M+ taxa.
 * CC0/CC BY. No auth, unlimited.
 */
export class GbifAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'gbif', baseUrl: GBIF_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'gbif.species_search': {
        const qp = new URLSearchParams();
        qp.set('q', String(params.query));
        if (params.rank) qp.set('rank', String(params.rank));
        qp.set('limit', String(Math.min(Number(params.limit) || 5, 20)));
        return { url: `${GBIF_BASE}/species/search?${qp.toString()}`, method: 'GET', headers };
      }

      case 'gbif.species_details': {
        const key = Number(params.taxon_key);
        return { url: `${GBIF_BASE}/species/${key}`, method: 'GET', headers };
      }

      case 'gbif.occurrences': {
        const qp = new URLSearchParams();
        qp.set('taxonKey', String(Number(params.taxon_key)));
        if (params.country) qp.set('country', String(params.country).toUpperCase());
        if (params.year) qp.set('year', String(Number(params.year)));
        qp.set('limit', String(Math.min(Number(params.limit) || 10, 50)));
        return { url: `${GBIF_BASE}/occurrence/search?${qp.toString()}`, method: 'GET', headers };
      }

      case 'gbif.occurrence_count': {
        const qp = new URLSearchParams();
        qp.set('taxonKey', String(Number(params.taxon_key)));
        if (params.country) qp.set('country', String(params.country).toUpperCase());
        return { url: `${GBIF_BASE}/occurrence/count?${qp.toString()}`, method: 'GET', headers };
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
    const body = raw.body as Record<string, unknown>;

    switch (req.toolId) {
      case 'gbif.species_search':
        return this.parseSpeciesSearch(body);
      case 'gbif.species_details':
        return this.parseSpeciesDetail(body);
      case 'gbif.occurrences':
        return this.parseOccurrences(body);
      case 'gbif.occurrence_count':
        return this.parseCount(body, req.params as Record<string, unknown>);
      default:
        return body;
    }
  }

  private parseSpeciesSearch(body: Record<string, unknown>): GbifSpeciesSearchOutput {
    const results = (body.results ?? []) as Record<string, unknown>[];
    return {
      total: Number(body.count ?? results.length),
      results: results.map((r) => this.toSpeciesResult(r)),
    };
  }

  private parseSpeciesDetail(body: Record<string, unknown>): GbifSpeciesDetailOutput {
    const vernacular = (body.vernacularNames ?? []) as Record<string, unknown>[];
    return {
      ...this.toSpeciesResult(body),
      parent_key: body.parentKey != null ? Number(body.parentKey) : null,
      accepted_key: body.acceptedKey != null ? Number(body.acceptedKey) : null,
      num_descendants: Number(body.numDescendants ?? 0),
      vernacular_names: vernacular
        .filter((v) => v.language === 'eng' || !v.language)
        .map((v) => String(v.vernacularName ?? ''))
        .slice(0, 10),
    };
  }

  private parseOccurrences(body: Record<string, unknown>): GbifOccurrencesOutput {
    const results = (body.results ?? []) as Record<string, unknown>[];
    return {
      total: Number(body.count ?? results.length),
      results: results.map(
        (r): GbifOccurrenceResult => ({
          key: Number(r.key ?? 0),
          species: String(r.species ?? ''),
          scientific_name: String(r.scientificName ?? ''),
          latitude: r.decimalLatitude != null ? Number(r.decimalLatitude) : null,
          longitude: r.decimalLongitude != null ? Number(r.decimalLongitude) : null,
          country: String(r.country ?? ''),
          state_province: String(r.stateProvince ?? ''),
          year: r.year != null ? Number(r.year) : null,
          month: r.month != null ? Number(r.month) : null,
          basis_of_record: String(r.basisOfRecord ?? ''),
          institution: String(r.institutionCode ?? ''),
          dataset: String(r.datasetName ?? '').slice(0, 100),
        }),
      ),
    };
  }

  private parseCount(
    body: Record<string, unknown>,
    params: Record<string, unknown>,
  ): GbifOccurrenceCountOutput {
    // /occurrence/count returns a plain number, not JSON object
    const count = typeof body === 'number' ? body : Number(body);
    return {
      taxon_key: Number(params.taxon_key),
      count: Number.isFinite(count) ? count : 0,
    };
  }

  private toSpeciesResult(r: Record<string, unknown>): GbifSpeciesResult {
    return {
      key: Number(r.key ?? r.usageKey ?? 0),
      scientific_name: String(r.scientificName ?? ''),
      canonical_name: String(r.canonicalName ?? ''),
      rank: String(r.rank ?? ''),
      status: String(r.taxonomicStatus ?? ''),
      kingdom: String(r.kingdom ?? ''),
      phylum: String(r.phylum ?? ''),
      class_name: String(r.class ?? ''),
      order: String(r.order ?? ''),
      family: String(r.family ?? ''),
      genus: String(r.genus ?? ''),
    };
  }
}
