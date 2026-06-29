import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  IrailStationsResponse,
  IrailLiveboardResponse,
  IrailConnectionsResponse,
  IrailVehicleResponse,
  IrailDisturbancesResponse,
  IrailConnection,
  IrailVia,
} from './types';

const IRAIL_BASE = 'https://api.irail.be/v1';
const IRAIL_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  'User-Agent': 'APIbase/1.0 (https://apibase.pro; support@apibase.pro)',
};

/**
 * iRail adapter (UC-524).
 *
 * Belgium SNCB/NMBS rail data — stations, real-time liveboards, connections, vehicle schedules,
 * and service disturbances. No auth required; open data license allows commercial use.
 *
 * All timestamps from iRail are Unix epoch strings; we convert to ISO 8601 in parseResponse.
 */
export class IrailAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'irail',
      baseUrl: IRAIL_BASE,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const p = req.params as Record<string, unknown>;
    const lang = (p.lang as string | undefined) ?? 'en';

    switch (req.toolId) {
      case 'irail.stations': {
        return {
          url: `${IRAIL_BASE}/stations?format=json&lang=${lang}`,
          method: 'GET',
          headers: IRAIL_HEADERS,
        };
      }

      case 'irail.liveboard': {
        const station = encodeURIComponent((p.station as string) ?? '');
        const arrdep = (p.arrdep as string | undefined) ?? 'departure';
        const results = (p.results as number | undefined) ?? 20;
        const date = p.date ? `&date=${encodeURIComponent(p.date as string)}` : '';
        const time = p.time ? `&time=${encodeURIComponent(p.time as string)}` : '';
        return {
          url: `${IRAIL_BASE}/liveboard?station=${station}&arrdep=${arrdep}&results=${results}&format=json&lang=${lang}${date}${time}`,
          method: 'GET',
          headers: IRAIL_HEADERS,
        };
      }

      case 'irail.connections': {
        const from = encodeURIComponent((p.from as string) ?? '');
        const to = encodeURIComponent((p.to as string) ?? '');
        const results = (p.results as number | undefined) ?? 6;
        const timesel = (p.timesel as string | undefined) ?? 'depart';
        const date = p.date ? `&date=${encodeURIComponent(p.date as string)}` : '';
        const time = p.time ? `&time=${encodeURIComponent(p.time as string)}` : '';
        return {
          url: `${IRAIL_BASE}/connections?from=${from}&to=${to}&results=${results}&timesel=${timesel}&format=json&lang=${lang}${date}${time}`,
          method: 'GET',
          headers: IRAIL_HEADERS,
        };
      }

      case 'irail.vehicle': {
        const id = encodeURIComponent((p.id as string) ?? '');
        const date = p.date ? `&date=${encodeURIComponent(p.date as string)}` : '';
        return {
          url: `${IRAIL_BASE}/vehicle?id=${id}&format=json&lang=${lang}${date}`,
          method: 'GET',
          headers: IRAIL_HEADERS,
        };
      }

      case 'irail.disturbances': {
        return {
          url: `${IRAIL_BASE}/disturbances?format=json&lang=${lang}`,
          method: 'GET',
          headers: IRAIL_HEADERS,
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
    const p = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'irail.stations':
        return parseStations(raw.body as IrailStationsResponse, p);

      case 'irail.liveboard':
        return parseLiveboard(raw.body as IrailLiveboardResponse);

      case 'irail.connections':
        return parseConnections(raw.body as IrailConnectionsResponse);

      case 'irail.vehicle':
        return parseVehicle(raw.body as IrailVehicleResponse);

      case 'irail.disturbances':
        return parseDisturbances(raw.body as IrailDisturbancesResponse);

      default:
        return raw.body;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function epochToIso(epoch: string | number): string {
  return new Date(Number(epoch) * 1000).toISOString();
}

function parseDelayMinutes(delaySeconds: string): number {
  return Math.round(Number(delaySeconds) / 60);
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function parseStations(data: IrailStationsResponse, params: Record<string, unknown>): unknown {
  const query = ((params.query as string | undefined) ?? '').toLowerCase();
  let stations = data.station.map((s) => ({
    id: s.id,
    name: s.name,
    standard_name: s.standardname,
    latitude: parseFloat(s.locationY),
    longitude: parseFloat(s.locationX),
  }));
  if (query) {
    stations = stations.filter(
      (s) => s.name.toLowerCase().includes(query) || s.standard_name.toLowerCase().includes(query),
    );
  }
  return {
    total: stations.length,
    stations,
  };
}

function parseLiveboard(data: IrailLiveboardResponse): unknown {
  const deps = data.departures.departure ?? [];
  return {
    station: data.stationinfo.name,
    standard_name: data.stationinfo.standardname,
    latitude: parseFloat(data.stationinfo.locationY),
    longitude: parseFloat(data.stationinfo.locationX),
    fetched_at: epochToIso(data.timestamp),
    count: deps.length,
    departures: deps.map((d) => ({
      time: epochToIso(d.time),
      delay_minutes: parseDelayMinutes(d.delay),
      canceled: d.canceled === '1',
      destination: d.station,
      train: d.vehicleinfo.shortname,
      train_type: d.vehicleinfo.type,
      platform: d.platform,
      platform_changed: d.platforminfo.normal === '0',
      occupancy: d.occupancy.name,
    })),
  };
}

function parseConnections(data: IrailConnectionsResponse): unknown {
  const connections = data.connection ?? [];
  return {
    fetched_at: epochToIso(data.timestamp),
    count: connections.length,
    connections: connections.map((c: IrailConnection) => {
      const viaList: IrailVia[] = c.vias
        ? Array.isArray(c.vias.via)
          ? c.vias.via
          : [c.vias.via]
        : [];
      return {
        departure_time: epochToIso(c.departure.time),
        arrival_time: epochToIso(c.arrival.time),
        duration_minutes: Math.round(Number(c.duration) / 60),
        departure_delay_minutes: parseDelayMinutes(c.departure.delay),
        arrival_delay_minutes: parseDelayMinutes(c.arrival.delay),
        canceled: c.departure.canceled === '1' || c.arrival.canceled === '1',
        from: c.departure.stationinfo.name,
        to: c.arrival.stationinfo.name,
        train: c.departure.vehicleinfo.shortname,
        train_type: c.departure.vehicleinfo.type,
        direction: c.departure.direction.name,
        departure_platform: c.departure.platform,
        arrival_platform: c.arrival.platform,
        changes: viaList.length,
        vias: viaList.map((v) => ({
          station: v.stationinfo.name,
          arrival_time: epochToIso(v.arrival.time),
          departure_time: epochToIso(v.departure.time),
          train: v.vehicleinfo.shortname,
          direction: v.departure.direction.name,
        })),
      };
    }),
  };
}

function parseVehicle(data: IrailVehicleResponse): unknown {
  const stops = data.stops.stop ?? [];
  return {
    vehicle_id: data.vehicleinfo.name,
    short_name: data.vehicleinfo.shortname,
    type: data.vehicleinfo.type,
    fetched_at: epochToIso(data.timestamp),
    stop_count: stops.length,
    stops: stops.map((s) => ({
      station: s.stationinfo.name,
      standard_name: s.stationinfo.standardname,
      scheduled_arrival: epochToIso(s.scheduledArrivalTime),
      scheduled_departure: epochToIso(s.scheduledDepartureTime),
      arrival_delay_minutes: parseDelayMinutes(s.arrivalDelay),
      departure_delay_minutes: parseDelayMinutes(s.departureDelay),
      platform: s.platform,
      canceled: s.canceled === '1',
      arrived: s.arrived === '1',
      left: s.left === '1',
      occupancy: s.occupancy?.name ?? null,
    })),
  };
}

function parseDisturbances(data: IrailDisturbancesResponse): unknown {
  const disturbances = data.disturbance ?? [];
  return {
    fetched_at: epochToIso(data.timestamp),
    count: disturbances.length,
    disturbances: disturbances.map((d) => ({
      id: d.id,
      type: d.type,
      title: d.title,
      description: d.description,
      timestamp: epochToIso(d.timestamp),
      more_info_url: d.link ?? null,
    })),
  };
}
