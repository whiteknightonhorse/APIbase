import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  BorderCrossingRecord,
  TsiRecord,
  FreightIndicatorRecord,
  AviationTrafficRecord,
} from './types';

/**
 * Bureau of Transportation Statistics (BTS) Socrata adapter (UC-564).
 *
 * Supported tools (read-only):
 *   bts.border_crossings  → GET /resource/keg4-3bc2.json  (Border Crossing Entry Data)
 *   bts.tsi               → GET /resource/bw6n-ddqk.json  (Transportation Services Index)
 *   bts.freight_indicators → GET /resource/y5ut-ibwt.json (Supply Chain & Freight Indicators)
 *   bts.aviation_traffic  → GET /resource/r495-tyji.json  (T100 Segment Summary By Airport)
 *
 * Auth: None (US Government open data, Socrata SoQL API, public domain).
 */
export class BtsTransportAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'bts-transport',
      baseUrl: 'https://data.bts.gov',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'bts.border_crossings':
        return this.buildBorderCrossingsRequest(params, headers);
      case 'bts.tsi':
        return this.buildTsiRequest(params, headers);
      case 'bts.freight_indicators':
        return this.buildFreightIndicatorsRequest(params, headers);
      case 'bts.aviation_traffic':
        return this.buildAviationTrafficRequest(params, headers);
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
    const body = raw.body as unknown[];

    switch (req.toolId) {
      case 'bts.border_crossings':
        return this.parseBorderCrossings(body as BorderCrossingRecord[]);
      case 'bts.tsi':
        return this.parseTsi(body as TsiRecord[]);
      case 'bts.freight_indicators':
        return this.parseFreightIndicators(body as FreightIndicatorRecord[]);
      case 'bts.aviation_traffic':
        return this.parseAviationTraffic(body as AviationTrafficRecord[]);
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildBorderCrossingsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    const conditions: string[] = [];

    if (params.border) conditions.push(`border='${String(params.border)}'`);
    if (params.measure) conditions.push(`measure='${String(params.measure)}'`);
    if (params.port_name) {
      conditions.push(`upper(port_name) like upper('%${String(params.port_name)}%')`);
    }
    if (params.start_date) conditions.push(`date >= '${String(params.start_date)}'`);
    if (params.end_date) conditions.push(`date <= '${String(params.end_date)}'`);

    if (conditions.length > 0) qs.set('$where', conditions.join(' AND '));
    qs.set('$order', 'date DESC, value DESC');
    qs.set('$limit', String(params.limit ?? 20));

    return {
      url: `${this.baseUrl}/resource/keg4-3bc2.json?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildTsiRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    const conditions: string[] = [];

    if (params.start_date) conditions.push(`obs_date >= '${String(params.start_date)}'`);
    if (params.end_date) conditions.push(`obs_date <= '${String(params.end_date)}'`);

    if (conditions.length > 0) qs.set('$where', conditions.join(' AND '));
    qs.set(
      '$select',
      'obs_date,tsi_total,tsi_freight,tsi_passenger,vmt,rail_frt_carloads,transit,petroleum,natural_gas',
    );
    qs.set('$order', 'obs_date DESC');
    qs.set('$limit', String(params.limit ?? 12));

    return {
      url: `${this.baseUrl}/resource/bw6n-ddqk.json?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildFreightIndicatorsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    const conditions: string[] = [];

    if (params.indicator) {
      conditions.push(`upper(indicator) like upper('%${String(params.indicator)}%')`);
    }
    if (params.year) conditions.push(`year='${String(params.year)}'`);
    if (params.start_date) conditions.push(`date >= '${String(params.start_date)}'`);
    if (params.end_date) conditions.push(`date <= '${String(params.end_date)}'`);

    if (conditions.length > 0) qs.set('$where', conditions.join(' AND '));
    qs.set('$order', 'date DESC');
    qs.set('$limit', String(params.limit ?? 20));

    return {
      url: `${this.baseUrl}/resource/y5ut-ibwt.json?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildAviationTrafficRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    const conditions: string[] = [];

    if (params.airport_code) {
      conditions.push(`origin_airport_code='${String(params.airport_code).toUpperCase()}'`);
    }
    if (params.year) conditions.push(`year='${String(params.year)}'`);

    if (conditions.length > 0) qs.set('$where', conditions.join(' AND '));
    qs.set(
      '$select',
      'year,origin_airport_code,total_departures,total_passengers,total_seats,total_load_factor,total_distance_flight_sm,total_payload_lbs',
    );
    qs.set('$order', 'year DESC, total_passengers DESC');
    qs.set('$limit', String(params.limit ?? 20));

    return {
      url: `${this.baseUrl}/resource/r495-tyji.json?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // Response parsers
  // ---------------------------------------------------------------------------

  private parseBorderCrossings(records: BorderCrossingRecord[]): unknown {
    return {
      count: records.length,
      crossings: records.map((r) => ({
        port_name: r.port_name,
        state: r.state,
        port_code: r.port_code,
        border: r.border,
        date: r.date ? r.date.slice(0, 10) : null,
        measure: r.measure,
        value: r.value !== undefined ? Number(r.value) : null,
        latitude: r.latitude !== undefined ? Number(r.latitude) : null,
        longitude: r.longitude !== undefined ? Number(r.longitude) : null,
      })),
    };
  }

  private parseTsi(records: TsiRecord[]): unknown {
    return {
      count: records.length,
      index: records.map((r) => ({
        date: r.obs_date ? r.obs_date.slice(0, 10) : null,
        tsi_total: r.tsi_total !== undefined ? Number(r.tsi_total) : null,
        tsi_freight: r.tsi_freight !== undefined ? Number(r.tsi_freight) : null,
        tsi_passenger: r.tsi_passenger !== undefined ? Number(r.tsi_passenger) : null,
        vehicle_miles_traveled: r.vmt !== undefined ? Number(r.vmt) : null,
        rail_carloads: r.rail_frt_carloads !== undefined ? Number(r.rail_frt_carloads) : null,
        transit: r.transit !== undefined ? Number(r.transit) : null,
        petroleum_pipeline: r.petroleum !== undefined ? Number(r.petroleum) : null,
        natural_gas_pipeline: r.natural_gas !== undefined ? Number(r.natural_gas) : null,
      })),
    };
  }

  private parseFreightIndicators(records: FreightIndicatorRecord[]): unknown {
    return {
      count: records.length,
      indicators: records.map((r) => ({
        date: r.date ? r.date.slice(0, 10) : null,
        year: r.year,
        indicator: r.indicator,
        value: r.value1 !== undefined ? Number(r.value1) : null,
        units: r.units,
        source: r.source ?? null,
        note: r.note ?? null,
      })),
    };
  }

  private parseAviationTraffic(records: AviationTrafficRecord[]): unknown {
    return {
      count: records.length,
      traffic: records.map((r) => ({
        year: r.year,
        airport_code: r.origin_airport_code ?? null,
        departures: r.total_departures !== undefined ? Number(r.total_departures) : null,
        passengers: r.total_passengers !== undefined ? Number(r.total_passengers) : null,
        seats: r.total_seats !== undefined ? Number(r.total_seats) : null,
        load_factor_pct: r.total_load_factor !== undefined ? Number(r.total_load_factor) : null,
        distance_miles:
          r.total_distance_flight_sm !== undefined ? Number(r.total_distance_flight_sm) : null,
        payload_lbs: r.total_payload_lbs !== undefined ? Number(r.total_payload_lbs) : null,
      })),
    };
  }
}
