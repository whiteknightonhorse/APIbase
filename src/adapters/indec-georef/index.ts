import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  GeorefProvinciasResponse,
  GeorefDepartamentosResponse,
  GeorefLocalidadesResponse,
  GeorefDireccionesResponse,
  GeorefUbicacionResponse,
} from './types';

const GEOREF_BASE = 'https://apis.datos.gob.ar/georef/api';

/**
 * INDEC Georef adapter (UC-603).
 *
 * Official Argentine government geographic reference API (Instituto Nacional
 * de Estadística y Censos), published as open data at apis.datos.gob.ar — no
 * auth, no documented rate limit. Covers forward/reverse geocoding plus
 * search over the country's administrative hierarchy (provinces, departments,
 * localities).
 *   indec-georef.geocode         -> GET /direcciones?direccion=
 *   indec-georef.reverse_geocode -> GET /ubicacion?lat=&lon=
 *   indec-georef.provincias      -> GET /provincias?nombre=
 *   indec-georef.departamentos   -> GET /departamentos?nombre=&provincia=
 *   indec-georef.localidades     -> GET /localidades?nombre=&provincia=
 */
export class IndecGeorefAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'indec-georef', baseUrl: GEOREF_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };
    const max = Math.min(Math.max(Number(params.max) || 10, 1), 50);

    switch (req.toolId) {
      case 'indec-georef.geocode': {
        const address = String(params.address || '').trim();
        if (!address) throw this.invalidInput(req.toolId, 'address is required');
        const qs = new URLSearchParams({ direccion: address, max: String(max) });
        return { url: `${GEOREF_BASE}/direcciones?${qs.toString()}`, method: 'GET', headers };
      }

      case 'indec-georef.reverse_geocode': {
        const lat = Number(params.lat);
        const lon = Number(params.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          throw this.invalidInput(req.toolId, 'lat and lon must be numbers');
        }
        const qs = new URLSearchParams({ lat: String(lat), lon: String(lon) });
        return { url: `${GEOREF_BASE}/ubicacion?${qs.toString()}`, method: 'GET', headers };
      }

      case 'indec-georef.provincias': {
        const qs = new URLSearchParams({ max: String(max) });
        const query = String(params.query || '').trim();
        if (query) qs.set('nombre', query);
        return { url: `${GEOREF_BASE}/provincias?${qs.toString()}`, method: 'GET', headers };
      }

      case 'indec-georef.departamentos': {
        const qs = new URLSearchParams({ max: String(max) });
        const query = String(params.query || '').trim();
        if (query) qs.set('nombre', query);
        const provincia = String(params.provincia || '').trim();
        if (provincia) qs.set('provincia', provincia);
        return { url: `${GEOREF_BASE}/departamentos?${qs.toString()}`, method: 'GET', headers };
      }

      case 'indec-georef.localidades': {
        const query = String(params.query || '').trim();
        if (!query) throw this.invalidInput(req.toolId, 'query is required');
        const qs = new URLSearchParams({ nombre: query, max: String(max) });
        const provincia = String(params.provincia || '').trim();
        if (provincia) qs.set('provincia', provincia);
        return { url: `${GEOREF_BASE}/localidades?${qs.toString()}`, method: 'GET', headers };
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
      case 'indec-georef.geocode': {
        const body = raw.body as GeorefDireccionesResponse;
        return {
          total: body.total,
          direcciones: (body.direcciones ?? []).map((d) => ({
            nomenclatura: d.nomenclatura,
            calle: d.calle?.nombre ?? null,
            altura: d.altura?.valor ?? null,
            provincia: d.provincia?.nombre ?? null,
            departamento: d.departamento?.nombre ?? null,
            localidad_censal: d.localidad_censal?.nombre ?? null,
            lat: d.ubicacion?.lat ?? null,
            lon: d.ubicacion?.lon ?? null,
          })),
        };
      }

      case 'indec-georef.reverse_geocode': {
        const body = raw.body as GeorefUbicacionResponse;
        const u = body.ubicacion;
        return {
          lat: u.lat,
          lon: u.lon,
          provincia: u.provincia?.nombre ?? null,
          departamento: u.departamento?.nombre ?? null,
          municipio: u.municipio?.nombre ?? null,
        };
      }

      case 'indec-georef.provincias': {
        const body = raw.body as GeorefProvinciasResponse;
        return {
          total: body.total,
          provincias: (body.provincias ?? []).map((p) => ({
            id: p.id,
            nombre: p.nombre,
            lat: p.centroide?.lat ?? null,
            lon: p.centroide?.lon ?? null,
          })),
        };
      }

      case 'indec-georef.departamentos': {
        const body = raw.body as GeorefDepartamentosResponse;
        return {
          total: body.total,
          departamentos: (body.departamentos ?? []).map((d) => ({
            id: d.id,
            nombre: d.nombre,
            provincia: d.provincia?.nombre ?? null,
            lat: d.centroide?.lat ?? null,
            lon: d.centroide?.lon ?? null,
          })),
        };
      }

      case 'indec-georef.localidades': {
        const body = raw.body as GeorefLocalidadesResponse;
        return {
          total: body.total,
          localidades: (body.localidades ?? []).map((l) => ({
            id: l.id,
            nombre: l.nombre,
            categoria: l.categoria ?? null,
            provincia: l.provincia?.nombre ?? null,
            departamento: l.departamento?.nombre ?? null,
            municipio: l.municipio?.nombre ?? null,
            lat: l.centroide?.lat ?? null,
            lon: l.centroide?.lon ?? null,
          })),
        };
      }

      default:
        return raw.body;
    }
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
