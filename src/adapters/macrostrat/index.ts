import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  MacrostratEnvelope,
  MacrostratColumn,
  MacrostratUnit,
  MacrostratMapUnit,
  MacrostratFossilCollection,
} from './types';

const MACROSTRAT_BASE = 'https://macrostrat.org/api/v2';
const MAP_SCALES = new Set(['small', 'medium', 'large']);

/**
 * Macrostrat geologic database API adapter (UC-643).
 *
 * macrostrat.org/api/v2 is a no-auth, CC BY 4.0 REST API (University of Wisconsin-Madison /
 * NSF-funded) covering worldwide stratigraphic columns, rock units, bedrock geologic map units,
 * and Paleobiology Database (PBDB) fossil collections tied to those units.
 *
 * Response-size discipline (measured live): `/units` and `/fossils` accept broad free-text
 * filters (`lith`, `interval_name`) with NO server-side row cap — e.g. `/units?lith=sandstone`
 * alone returns 4+MB and `/fossils?interval_name=Cretaceous` returns 3+MB, both far over the
 * adapter's response-size limit. Both tools are therefore scoped to require `col_id` and/or a
 * `lat`+`lng` point (measured worst case ~255KB for a 460-unit column), never a bare free-text
 * filter. `/columns` has no such blowup (it is a small ~5,000-row summary table, worst-case
 * ~913KB for the entire Phanerozoic with `response=short`) so it accepts free-text filters
 * directly — `response=long` is never requested for it (measured 1.16MB, over budget).
 *   macrostrat.columns_search    -> stratigraphic columns by point, age, lithology, or name
 *   macrostrat.units_search      -> rock units (formation/member, age, lithology) for a column/point
 *   macrostrat.geologic_map_units -> bedrock geologic map units at a point (surface geology)
 *   macrostrat.fossils_search    -> PBDB fossil collections tied to a column or unit
 */
export class MacrostratAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'macrostrat', baseUrl: MACROSTRAT_BASE, maxResponseBytes: 1_500_000 });
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

  private optNumber(toolId: string, field: string, value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const n = Number(value);
    if (!Number.isFinite(n)) {
      throw this.invalidInput(toolId, `${field} must be a number`);
    }
    return n;
  }

  private optString(value: unknown): string | undefined {
    if (value === undefined || value === null) return undefined;
    const s = String(value).trim();
    return s === '' ? undefined : s;
  }

  private requireLatLng(
    toolId: string,
    params: Record<string, unknown>,
  ): { lat: number; lng: number } | undefined {
    const lat = this.optNumber(toolId, 'lat', params.lat);
    const lng = this.optNumber(toolId, 'lng', params.lng);
    if (lat === undefined && lng === undefined) return undefined;
    if (lat === undefined || lng === undefined) {
      throw this.invalidInput(toolId, 'lat and lng must be supplied together');
    }
    if (lat < -90 || lat > 90) {
      throw this.invalidInput(toolId, 'lat must be between -90 and 90');
    }
    if (lng < -180 || lng > 180) {
      throw this.invalidInput(toolId, 'lng must be between -180 and 180');
    }
    return { lat, lng };
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;
    const headers = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'macrostrat.columns_search': {
        const latLng = this.requireLatLng(req.toolId, params);
        const stratName = this.optString(params.strat_name);
        const intervalName = this.optString(params.interval_name);
        const lith = this.optString(params.lith);
        const age = this.optNumber(req.toolId, 'age', params.age);
        const ageTop = this.optNumber(req.toolId, 'age_top', params.age_top);
        const ageBottom = this.optNumber(req.toolId, 'age_bottom', params.age_bottom);
        if ((ageTop === undefined) !== (ageBottom === undefined)) {
          throw this.invalidInput(req.toolId, 'age_top and age_bottom must be supplied together');
        }
        if (
          !latLng &&
          !stratName &&
          !intervalName &&
          !lith &&
          age === undefined &&
          ageTop === undefined
        ) {
          throw this.invalidInput(
            req.toolId,
            'supply at least one filter: lat+lng, strat_name, interval_name, lith, age, or age_top+age_bottom',
          );
        }
        const qs = new URLSearchParams();
        if (latLng) {
          qs.set('lat', String(latLng.lat));
          qs.set('lng', String(latLng.lng));
          if (params.adjacents === true) qs.set('adjacents', 'true');
        }
        if (stratName) qs.set('strat_name', stratName);
        if (intervalName) qs.set('interval_name', intervalName);
        if (lith) qs.set('lith', lith);
        if (age !== undefined) qs.set('age', String(age));
        if (ageTop !== undefined) qs.set('age_top', String(ageTop));
        if (ageBottom !== undefined) qs.set('age_bottom', String(ageBottom));
        return { url: `${MACROSTRAT_BASE}/columns?${qs.toString()}`, method: 'GET', headers };
      }

      case 'macrostrat.units_search': {
        const colId = this.optNumber(req.toolId, 'col_id', params.col_id);
        const latLng = this.requireLatLng(req.toolId, params);
        if (colId === undefined && !latLng) {
          throw this.invalidInput(req.toolId, 'supply either col_id, or lat+lng together');
        }
        const qs = new URLSearchParams();
        if (colId !== undefined) qs.set('col_id', String(colId));
        if (latLng) {
          qs.set('lat', String(latLng.lat));
          qs.set('lng', String(latLng.lng));
        }
        return { url: `${MACROSTRAT_BASE}/units?${qs.toString()}`, method: 'GET', headers };
      }

      case 'macrostrat.geologic_map_units': {
        const latLng = this.requireLatLng(req.toolId, params);
        if (!latLng) {
          throw this.invalidInput(req.toolId, 'lat and lng are required');
        }
        const scale = this.optString(params.scale);
        if (scale && !MAP_SCALES.has(scale)) {
          throw this.invalidInput(req.toolId, 'scale must be one of: small, medium, large');
        }
        const qs = new URLSearchParams({ lat: String(latLng.lat), lng: String(latLng.lng) });
        if (scale) qs.set('scale', scale);
        return {
          url: `${MACROSTRAT_BASE}/geologic_units/map?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'macrostrat.fossils_search': {
        const colId = this.optNumber(req.toolId, 'col_id', params.col_id);
        const unitId = this.optNumber(req.toolId, 'unit_id', params.unit_id);
        if (colId === undefined && unitId === undefined) {
          throw this.invalidInput(req.toolId, 'supply either col_id or unit_id');
        }
        const intervalName = this.optString(params.interval_name);
        const qs = new URLSearchParams();
        if (colId !== undefined) qs.set('col_id', String(colId));
        if (unitId !== undefined) qs.set('unit_id', String(unitId));
        if (intervalName) qs.set('interval_name', intervalName);
        return { url: `${MACROSTRAT_BASE}/fossils?${qs.toString()}`, method: 'GET', headers };
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
      case 'macrostrat.columns_search': {
        const env = raw.body as MacrostratEnvelope<MacrostratColumn[]>;
        const data = env.success?.data ?? [];
        return { returned: data.length, columns: data };
      }

      case 'macrostrat.units_search': {
        const env = raw.body as MacrostratEnvelope<MacrostratUnit[]>;
        const data = env.success?.data ?? [];
        return { returned: data.length, units: data };
      }

      case 'macrostrat.geologic_map_units': {
        const env = raw.body as MacrostratEnvelope<MacrostratMapUnit[]>;
        const data = env.success?.data ?? [];
        return { returned: data.length, map_units: data };
      }

      case 'macrostrat.fossils_search': {
        const env = raw.body as MacrostratEnvelope<MacrostratFossilCollection[]>;
        const data = env.success?.data ?? [];
        return { returned: data.length, fossil_collections: data };
      }

      default:
        return raw.body;
    }
  }
}
