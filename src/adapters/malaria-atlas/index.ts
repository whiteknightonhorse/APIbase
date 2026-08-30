import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { MalariaAtlasFeatureCollection } from './types';

const WFS_URL = 'https://data.malariaatlas.org/geoserver/ows';

const ISO3_RE = /^[A-Z]{3}$/;
const SEARCH_TEXT_RE = /^[A-Za-z0-9 .,'-]{1,60}$/;

const SPECIES_FIELDS: Record<'pf' | 'pv', { layer: string; pos: string; pr: string }> = {
  pf: { layer: 'Explorer:public_pf_data', pos: 'pf_pos', pr: 'pf_pr' },
  pv: { layer: 'Explorer:public_pv_data', pos: 'pv_pos', pr: 'pv_pr' },
};

const CASE_LAYERS: Record<'pf' | 'pv', { layer: string; field: string }> = {
  pf: { layer: 'MAP_READER:map_data_estate_detail_admin1_conf_c_pf', field: 'conf_c_pf' },
  pv: { layer: 'MAP_READER:map_data_estate_detail_admin1_conf_c_pv', field: 'conf_c_pv' },
};

/**
 * Malaria Atlas Project (MAP) public GeoServer WFS API adapter (UC-640).
 *
 * data.malariaatlas.org/geoserver/ows is a no-auth OGC WFS 2.0 service run by the University
 * of Oxford (MAP), exposing malaria epidemiology point surveys, admin1-level confirmed-case
 * estimates, Anopheles mosquito vector-occurrence records, and country reference boundaries.
 * All four tools request `outputFormat=application/json` and select a curated `propertyName`
 * list (never `geom`) to keep responses small — the raw admin-boundary polygons are multi-MB.
 * Every user-controlled value that is interpolated into a CQL_FILTER is validated against a
 * strict allowlist regex (ISO3 country code / bounded search text) before use, to close off
 * CQL/SQL injection into the upstream GeoServer feature-type query (CWE-89 analog for OGC WFS).
 *   malaria-atlas.parasite_rate_survey -> point-level Pf/Pv parasite-rate survey records
 *   malaria-atlas.case_estimates       -> admin1 confirmed-case estimates by year (1980-2017)
 *   malaria-atlas.vector_occurrence    -> Anopheles mosquito vector occurrence records
 *   malaria-atlas.country_list         -> reference list of MAP-covered countries (iso/name)
 */
export class MalariaAtlasAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'malaria-atlas', baseUrl: WFS_URL, maxResponseBytes: 2_000_000 });
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

  private validCountry(toolId: string, country: string): string {
    const value = country.trim().toUpperCase();
    if (!ISO3_RE.test(value)) {
      throw this.invalidInput(
        toolId,
        'country must be an ISO3166 alpha-3 code (e.g. "KEN", "IDN")',
      );
    }
    return value;
  }

  private validSearchText(toolId: string, field: string, value: string): string {
    const trimmed = value.trim();
    if (!SEARCH_TEXT_RE.test(trimmed)) {
      throw this.invalidInput(
        toolId,
        `${field} must be 1-60 characters of letters, numbers, spaces, or . , ' -`,
      );
    }
    // Defense in depth: escape any literal single quote for CQL string interpolation.
    return trimmed.replace(/'/g, "''");
  }

  private clampLimit(value: unknown, def: number, max: number): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return def;
    return Math.min(Math.floor(n), max);
  }

  private buildUrl(
    typeName: string,
    propertyName: string[],
    count: number,
    cqlFilter?: string,
  ): string {
    const params = new URLSearchParams({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeName,
      outputFormat: 'application/json',
      propertyName: propertyName.join(','),
      count: String(count),
    });
    if (cqlFilter) {
      params.set('CQL_FILTER', cqlFilter);
    }
    return `${WFS_URL}?${params.toString()}`;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;
    const headers = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'malaria-atlas.parasite_rate_survey': {
        const species = String(params.species || '')
          .trim()
          .toLowerCase();
        if (species !== 'pf' && species !== 'pv') {
          throw this.invalidInput(
            req.toolId,
            'species must be "pf" (P. falciparum) or "pv" (P. vivax)',
          );
        }
        const fields = SPECIES_FIELDS[species];
        const count = this.clampLimit(params.limit, 50, 200);
        const filters: string[] = [];
        if (params.country) {
          filters.push(`country_id='${this.validCountry(req.toolId, String(params.country))}'`);
        }
        const propertyName = [
          'country',
          'country_id',
          'site_name',
          'latitude',
          'longitude',
          'rural_urban',
          'year_start',
          'year_end',
          'examined',
          fields.pos,
          fields.pr,
          'method',
        ];
        return {
          url: this.buildUrl(fields.layer, propertyName, count, filters.join(' AND ') || undefined),
          method: 'GET',
          headers,
        };
      }

      case 'malaria-atlas.case_estimates': {
        const species = String(params.species || '')
          .trim()
          .toLowerCase();
        if (species !== 'pf' && species !== 'pv') {
          throw this.invalidInput(
            req.toolId,
            'species must be "pf" (P. falciparum) or "pv" (P. vivax)',
          );
        }
        const country = this.validCountry(req.toolId, String(params.country || ''));
        const info = CASE_LAYERS[species];
        const count = this.clampLimit(params.limit, 50, 500);
        const filters = [`iso_3_code='${country}'`];
        if (params.year !== undefined && params.year !== null && params.year !== '') {
          const year = Number(params.year);
          if (!Number.isInteger(year) || year < 1980 || year > 2017) {
            throw this.invalidInput(req.toolId, 'year must be an integer between 1980 and 2017');
          }
          filters.push(`year=${year}`);
        }
        const propertyName = [
          'iso_3_code',
          'country_name',
          'admin_unit',
          'year',
          info.field,
          'total_pop',
        ];
        return {
          url: this.buildUrl(info.layer, propertyName, count, filters.join(' AND ')),
          method: 'GET',
          headers,
        };
      }

      case 'malaria-atlas.vector_occurrence': {
        const count = this.clampLimit(params.limit, 50, 200);
        const filters: string[] = [];
        if (params.country) {
          filters.push(`country_id='${this.validCountry(req.toolId, String(params.country))}'`);
        }
        if (params.species) {
          const species = this.validSearchText(req.toolId, 'species', String(params.species));
          filters.push(`species_plain ILIKE '%${species}%'`);
        }
        const propertyName = [
          'country',
          'country_id',
          'latitude',
          'longitude',
          'year_start',
          'year_end',
          'species',
          'species_plain',
          'sample_method1',
        ];
        return {
          url: this.buildUrl(
            'Explorer:Anopheline_Data',
            propertyName,
            count,
            filters.join(' AND ') || undefined,
          ),
          method: 'GET',
          headers,
        };
      }

      case 'malaria-atlas.country_list': {
        const count = this.clampLimit(params.limit, 50, 250);
        let cqlFilter: string | undefined;
        if (params.name) {
          const name = this.validSearchText(req.toolId, 'name', String(params.name));
          cqlFilter = `name_0 ILIKE '%${name}%'`;
        }
        return {
          url: this.buildUrl(
            'Explorer:mapadmin_0_2022',
            ['iso', 'iso2', 'name_0'],
            count,
            cqlFilter,
          ),
          method: 'GET',
          headers,
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
    const body = raw.body as MalariaAtlasFeatureCollection;
    const records = (body.features || []).map((f) => f.properties);

    switch (req.toolId) {
      case 'malaria-atlas.parasite_rate_survey':
        return { total_matched: body.totalFeatures, returned: records.length, surveys: records };

      case 'malaria-atlas.case_estimates':
        return { total_matched: body.totalFeatures, returned: records.length, estimates: records };

      case 'malaria-atlas.vector_occurrence':
        return {
          total_matched: body.totalFeatures,
          returned: records.length,
          occurrences: records,
        };

      case 'malaria-atlas.country_list':
        return { total_matched: body.totalFeatures, returned: records.length, countries: records };

      default:
        return raw.body;
    }
  }
}
