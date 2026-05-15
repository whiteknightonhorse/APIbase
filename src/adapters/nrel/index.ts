import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  AfdcNearestResponse,
  AfdcSearchResponse,
  AfdcDetailResponse,
  PVWattsResponse,
} from './types';

const AFDC_BASE = 'https://developer.nrel.gov/api/alt-fuel-stations/v1';
const PVWATTS_BASE = 'https://developer.nrel.gov/api/pvwatts/v8';

/**
 * NREL (National Renewable Energy Laboratory) adapter (UC-414).
 *
 * Covers two API domains sharing one API key:
 *   AFDC — Alternative Fuels Station Locator
 *     nrel.afdc_stations_nearest → GET /api/alt-fuel-stations/v1/nearest.json
 *     nrel.afdc_stations_search  → GET /api/alt-fuel-stations/v1.json
 *     nrel.afdc_station_detail   → GET /api/alt-fuel-stations/v1/{id}.json
 *   PVWatts — Solar PV Production Estimator
 *     nrel.pvwatts_estimate      → GET /api/pvwatts/v8.json
 *
 * Auth: api_key query parameter.
 * Rate limit: 1000 req/hour shared across both APIs.
 * License: US Public Domain.
 * URL-encode params per flywheel [2026-04-05].
 */
export class NrelAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'nrel',
      baseUrl: AFDC_BASE,
    });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase-Gateway/1.0',
    };

    switch (req.toolId) {
      case 'nrel.afdc_stations_nearest': {
        const qp = new URLSearchParams();
        qp.set('api_key', this.apiKey);
        qp.set('latitude', String(params.latitude));
        qp.set('longitude', String(params.longitude));
        if (params.fuel_type != null) qp.set('fuel_type', String(params.fuel_type));
        else qp.set('fuel_type', 'ELEC');
        if (params.status != null) qp.set('status', String(params.status));
        else qp.set('status', 'E');
        const radius = params.radius != null ? Number(params.radius) : 5;
        qp.set('radius', String(Math.min(radius, 500)));
        const limit = params.limit != null ? Number(params.limit) : 20;
        qp.set('limit', String(Math.min(Math.max(1, limit), 200)));
        return {
          url: `${AFDC_BASE}/nearest.json?${qp.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'nrel.afdc_stations_search': {
        const qp = new URLSearchParams();
        qp.set('api_key', this.apiKey);
        if (params.zip != null) qp.set('zip', String(params.zip));
        if (params.state != null) qp.set('state', String(params.state));
        if (params.city != null) qp.set('city', String(params.city));
        if (params.fuel_type != null) qp.set('fuel_type', String(params.fuel_type));
        else qp.set('fuel_type', 'ELEC');
        if (params.ev_connector_type != null)
          qp.set('ev_connector_type', String(params.ev_connector_type));
        if (params.access != null) qp.set('access', String(params.access));
        if (params.status != null) qp.set('status', String(params.status));
        else qp.set('status', 'E');
        const limit = params.limit != null ? Number(params.limit) : 50;
        qp.set('limit', String(Math.min(Math.max(1, limit), 200)));
        const offset = params.offset != null ? Number(params.offset) : 0;
        qp.set('offset', String(Math.max(0, offset)));
        return {
          url: `${AFDC_BASE}.json?${qp.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'nrel.afdc_station_detail': {
        const stationId = Number(params.station_id);
        const qp = new URLSearchParams();
        qp.set('api_key', this.apiKey);
        // Station ID is numeric — safe to use directly in path.
        return {
          url: `${AFDC_BASE}/${encodeURIComponent(String(stationId))}.json?${qp.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'nrel.pvwatts_estimate': {
        const qp = new URLSearchParams();
        qp.set('api_key', this.apiKey);
        qp.set('lat', String(params.latitude));
        qp.set('lon', String(params.longitude));
        qp.set('system_capacity', String(params.system_capacity));
        const moduleType = params.module_type != null ? Number(params.module_type) : 1;
        qp.set('module_type', String(moduleType));
        const losses = params.losses != null ? Number(params.losses) : 14;
        qp.set('losses', String(losses));
        const arrayType = params.array_type != null ? Number(params.array_type) : 1;
        qp.set('array_type', String(arrayType));
        const tilt = params.tilt != null ? Number(params.tilt) : 20;
        qp.set('tilt', String(tilt));
        const azimuth = params.azimuth != null ? Number(params.azimuth) : 180;
        qp.set('azimuth', String(azimuth));
        qp.set('timeframe', 'monthly');
        return {
          url: `${PVWATTS_BASE}.json?${qp.toString()}`,
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
    switch (req.toolId) {
      case 'nrel.afdc_stations_nearest':
        return this.parseNearest(raw.body as AfdcNearestResponse);
      case 'nrel.afdc_stations_search':
        return this.parseSearch(raw.body as AfdcSearchResponse);
      case 'nrel.afdc_station_detail':
        return this.parseDetail(raw.body as AfdcDetailResponse);
      case 'nrel.pvwatts_estimate':
        return this.parsePVWatts(raw.body as PVWattsResponse);
      default:
        return raw.body;
    }
  }

  private parseNearest(data: AfdcNearestResponse) {
    return {
      total_results: data.total_results,
      search_location: { latitude: data.latitude, longitude: data.longitude },
      stations: (data.fuel_stations ?? []).map((s) => this.formatStation(s)),
    };
  }

  private parseSearch(data: AfdcSearchResponse) {
    return {
      total_results: data.total_results,
      offset: data.offset,
      stations: (data.fuel_stations ?? []).map((s) => this.formatStation(s)),
    };
  }

  private parseDetail(data: AfdcDetailResponse) {
    const s = data.alt_fuel_station;
    if (!s) return { found: false, station: null };
    return {
      found: true,
      station: {
        ...this.formatStation(s),
        access_detail_code: s.access_detail_code ?? null,
        cards_accepted: s.cards_accepted ?? null,
        ev_workplace_charging: s.ev_workplace_charging ?? null,
        facility_type: s.facility_type ?? null,
        intersection_directions: s.intersection_directions ?? null,
        open_date: s.open_date ?? null,
        planned_construction: s.planned_construction ?? null,
        ng_fill_type_code: s.ng_fill_type_code ?? null,
      },
    };
  }

  private parsePVWatts(data: PVWattsResponse) {
    // PVWatts returns 200 but with errors array when params are invalid.
    if (data.errors && data.errors.length > 0) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 422,
        message: `PVWatts validation error: ${data.errors.join('; ')}`,
        provider: this.provider,
        toolId: 'nrel.pvwatts_estimate',
        durationMs: 0,
      };
    }
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const o = data.outputs;
    return {
      station_info: data.station_info,
      inputs: data.inputs,
      version: data.version,
      warnings: data.warnings ?? [],
      annual: {
        ac_energy_kwh: o.ac_annual,
        solrad_kwh_m2_day: o.solrad_annual,
        capacity_factor_pct: o.capacity_factor,
      },
      monthly: months.map((month, i) => ({
        month,
        ac_energy_kwh: o.ac_monthly[i] ?? null,
        dc_energy_kwh: o.dc_monthly[i] ?? null,
        poa_irradiance_kwh_m2: o.poa_monthly[i] ?? null,
        solrad_kwh_m2_day: o.solrad_monthly[i] ?? null,
      })),
    };
  }

  private formatStation(s: AfdcNearestResponse['fuel_stations'][0]) {
    return {
      id: s.id,
      name: s.station_name,
      address: {
        street: s.street,
        city: s.city,
        state: s.state,
        zip: s.zip,
        country: s.country,
      },
      status: s.status_code,
      access: s.access_code,
      fuel_type: s.fuel_type_code,
      ev: {
        level1_outlets: s.ev_level1_evse_num ?? 0,
        level2_outlets: s.ev_level2_evse_num ?? 0,
        dc_fast_outlets: s.ev_dc_fast_num ?? 0,
        connector_types: s.ev_connector_types ?? [],
        network: s.ev_network ?? null,
        network_web: s.ev_network_web ?? null,
        pricing: s.ev_pricing ?? null,
      },
      location: { latitude: s.latitude, longitude: s.longitude },
      phone: s.station_phone ?? s.phone ?? null,
      hours: s.access_days_time ?? null,
      date_last_confirmed: s.date_last_confirmed ?? null,
      updated_at: s.updated_at,
      owner_type: s.owner_type_code ?? null,
    };
  }
}
