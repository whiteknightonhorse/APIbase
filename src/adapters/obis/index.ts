import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  ObisOccurrenceOutput,
  ObisTaxonOutput,
  ObisChecklistOutput,
  ObisDatasetOutput,
} from './types';

const OBIS_BASE = 'https://api.obis.org/v3';

/**
 * OBIS adapter (UC-576).
 *
 * Ocean Biodiversity Information System — 100M+ marine species occurrence records.
 * No auth, unlimited free, CC BY 4.0 / CC0.
 */
export class ObisAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'obis', baseUrl: OBIS_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase/1.0 (https://apibase.pro)',
    };

    switch (req.toolId) {
      case 'obis.occurrence_search': {
        const qp = new URLSearchParams();
        if (params.scientificname) qp.set('scientificname', String(params.scientificname));
        if (params.taxonid) qp.set('taxonid', String(Number(params.taxonid)));
        if (params.lat && params.lon && params.radius) {
          qp.set('lat', String(Number(params.lat)));
          qp.set('lon', String(Number(params.lon)));
          qp.set('radius', String(Number(params.radius)));
        }
        if (params.startdate) qp.set('startdate', String(params.startdate));
        if (params.enddate) qp.set('enddate', String(params.enddate));
        if (params.minyear) qp.set('minyear', String(Number(params.minyear)));
        if (params.maxyear) qp.set('maxyear', String(Number(params.maxyear)));
        qp.set('size', String(Math.min(Number(params.limit) || 10, 100)));
        return { url: `${OBIS_BASE}/occurrence?${qp.toString()}`, method: 'GET', headers };
      }

      case 'obis.taxon_search': {
        const qp = new URLSearchParams();
        qp.set('scientificname', String(params.scientificname));
        return {
          url: `${OBIS_BASE}/taxon/${encodeURIComponent(String(params.scientificname))}`,
          method: 'GET',
          headers,
        };
      }

      case 'obis.checklist': {
        const qp = new URLSearchParams();
        if (params.scientificname) qp.set('scientificname', String(params.scientificname));
        if (params.taxonid) qp.set('taxonid', String(Number(params.taxonid)));
        if (params.areaid) qp.set('areaid', String(Number(params.areaid)));
        if (params.marine_only !== false) qp.set('marine', 'true');
        qp.set('size', String(Math.min(Number(params.limit) || 20, 100)));
        return { url: `${OBIS_BASE}/checklist?${qp.toString()}`, method: 'GET', headers };
      }

      case 'obis.dataset_search': {
        const qp = new URLSearchParams();
        if (params.scientificname) qp.set('scientificname', String(params.scientificname));
        if (params.areaid) qp.set('areaid', String(Number(params.areaid)));
        qp.set('size', String(Math.min(Number(params.limit) || 10, 50)));
        return { url: `${OBIS_BASE}/dataset?${qp.toString()}`, method: 'GET', headers };
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
      case 'obis.occurrence_search':
        return this.parseOccurrences(body);
      case 'obis.taxon_search':
        return this.parseTaxon(body);
      case 'obis.checklist':
        return this.parseChecklist(body);
      case 'obis.dataset_search':
        return this.parseDatasets(body);
      default:
        return body;
    }
  }

  private parseOccurrences(body: Record<string, unknown>): ObisOccurrenceOutput {
    const results = (body.results ?? []) as Record<string, unknown>[];
    return {
      total: Number(body.total ?? results.length),
      results: results.map((r) => ({
        occurrence_id: String(r.occurrenceID ?? r.id ?? ''),
        scientific_name: String(r.scientificName ?? ''),
        species: String(r.species ?? ''),
        genus: String(r.genus ?? ''),
        family: String(r.family ?? ''),
        order: String(r.order ?? ''),
        class: String(r.class ?? ''),
        phylum: String(r.phylum ?? ''),
        kingdom: String(r.kingdom ?? ''),
        aphia_id: Number(r.aphiaID ?? 0),
        latitude: r.decimalLatitude != null ? Number(r.decimalLatitude) : null,
        longitude: r.decimalLongitude != null ? Number(r.decimalLongitude) : null,
        year: r.date_year != null ? Number(r.date_year) : null,
        month: r.month != null ? Number(r.month) : null,
        dataset: String(r.datasetName ?? '').slice(0, 120),
        basis_of_record: String(r.basisOfRecord ?? ''),
        depth_m: r.bathymetry != null ? Number(r.bathymetry) : null,
        sea_surface_temp_c: r.sst != null ? Number(r.sst) : null,
      })),
    };
  }

  private parseTaxon(body: Record<string, unknown>): ObisTaxonOutput {
    const results = (body.results ?? []) as Record<string, unknown>[];
    return {
      total: Number(body.total ?? results.length),
      results: results.map((r) => {
        const vernacular = (r.vernacularNames ?? []) as Record<string, unknown>[];
        return {
          scientific_name: String(r.scientificName ?? ''),
          authorship: String(r.scientificNameAuthorship ?? ''),
          aphia_id: Number(r.taxonID ?? 0),
          rank: String(r.taxonRank ?? ''),
          status: String(r.taxonomicStatus ?? ''),
          accepted_name: String(r.acceptedNameUsage ?? r.scientificName ?? ''),
          is_marine: Boolean(r.is_marine),
          is_brackish: Boolean(r.is_brackish),
          is_freshwater: Boolean(r.is_freshwater),
          kingdom: String(r.kingdom ?? ''),
          phylum: String(r.phylum ?? ''),
          class: String(r.class ?? ''),
          order: String(r.order ?? ''),
          family: String(r.family ?? ''),
          genus: String(r.genus ?? ''),
          species: String(r.species ?? ''),
          vernacular_names: vernacular
            .map((v) => String(v.vernacularName ?? ''))
            .filter(Boolean)
            .slice(0, 10),
        };
      }),
    };
  }

  private parseChecklist(body: Record<string, unknown>): ObisChecklistOutput {
    const results = (body.results ?? []) as Record<string, unknown>[];
    return {
      total: Number(body.total ?? results.length),
      results: results.map((r) => ({
        scientific_name: String(r.scientificName ?? ''),
        aphia_id: Number(r.taxonID ?? 0),
        rank: String(r.taxonRank ?? ''),
        kingdom: String(r.kingdom ?? ''),
        phylum: String(r.phylum ?? ''),
        class: String(r.class ?? ''),
        order: String(r.order ?? ''),
        family: String(r.family ?? ''),
        genus: String(r.genus ?? ''),
        species: String(r.species ?? ''),
        occurrence_records: Number(r.records ?? 0),
        is_marine: Boolean(r.is_marine),
      })),
    };
  }

  private parseDatasets(body: Record<string, unknown>): ObisDatasetOutput {
    const results = (body.results ?? []) as Record<string, unknown>[];
    return {
      total: Number(body.total ?? results.length),
      results: results.map((r) => ({
        id: String(r.id ?? ''),
        title: String(r.title ?? ''),
        abstract: String(r.abstract ?? '').slice(0, 500),
        records: Number(r.records ?? 0),
        citation: String(r.citation ?? '').slice(0, 300),
        url: String(r.url ?? ''),
      })),
    };
  }
}
