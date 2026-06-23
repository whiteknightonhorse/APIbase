import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  GfwVesselSearchResponse,
  GfwVesselDetailResponse,
  GfwEventsResponse,
  GfwEffortResponse,
  GfwVesselNormalized,
  GfwVesselSearchOutput,
  GfwVesselDetailOutput,
  GfwFishingEventsOutput,
  GfwFishingEffortOutput,
} from './types';

const GFW_BASE = 'https://gateway.api.globalfishingwatch.org/v3';
const VESSEL_DATASET = 'public-global-vessel-identity:latest';
const FISHING_EVENTS_DATASET = 'public-global-fishing-events:latest';
const PORT_VISITS_DATASET = 'public-global-port-visits-c2-events:latest';
const FISHING_EFFORT_DATASET = 'public-global-fishing-effort:latest';

export class GfwAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ provider: 'gfw', baseUrl: GFW_BASE });
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
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'gfw.vessel.search':
        return this.buildVesselSearch(params, headers);
      case 'gfw.vessel.details':
        return this.buildVesselDetails(params, headers);
      case 'gfw.vessel.fishing_events':
        return this.buildFishingEvents(params, headers);
      case 'gfw.ocean.fishing_effort':
        return this.buildFishingEffort(params, headers);
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

  private buildVesselSearch(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qp = new URLSearchParams();
    qp.set('query', encodeURIComponent(String(params.query)));
    qp.append('datasets[0]', VESSEL_DATASET);
    qp.set('limit', String(Math.min(Number(params.limit) || 10, 50)));
    if (params.flag) qp.set('flags[0]', encodeURIComponent(String(params.flag)));
    return { url: `${GFW_BASE}/vessels/search?${qp.toString()}`, method: 'GET', headers };
  }

  private buildVesselDetails(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const vesselId = encodeURIComponent(String(params.vessel_id));
    const qp = new URLSearchParams();
    qp.set('dataset', VESSEL_DATASET);
    return { url: `${GFW_BASE}/vessels/${vesselId}?${qp.toString()}`, method: 'GET', headers };
  }

  private buildFishingEvents(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qp = new URLSearchParams();
    qp.append('vessels[0]', encodeURIComponent(String(params.vessel_id)));
    const eventType = String(params.event_type || 'fishing');
    const dataset = eventType === 'port_visit' ? PORT_VISITS_DATASET : FISHING_EVENTS_DATASET;
    qp.append('datasets[0]', dataset);
    qp.set('limit', String(Math.min(Number(params.limit) || 10, 50)));
    qp.set('offset', String(Math.max(Number(params.offset) || 0, 0)));
    if (params.start_date) qp.set('start-date', String(params.start_date));
    if (params.end_date) qp.set('end-date', String(params.end_date));
    return { url: `${GFW_BASE}/events?${qp.toString()}`, method: 'GET', headers };
  }

  private buildFishingEffort(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string>; body: string } {
    const qp = new URLSearchParams();
    qp.append('datasets[0]', FISHING_EFFORT_DATASET);
    qp.set('spatial-resolution', 'LOW');
    qp.set('temporal-resolution', String(params.temporal_resolution || 'MONTHLY'));
    qp.set('group-by', 'GEARTYPE');
    qp.set('format', 'JSON');
    const start = String(params.start_date);
    const end = String(params.end_date);
    qp.set('date-range', `${start},${end}`);

    const rawCoords = params.coordinates as number[][] | undefined;
    const coords = rawCoords ?? [
      [-180, -90],
      [180, -90],
      [180, 90],
      [-180, 90],
      [-180, -90],
    ];
    const body = JSON.stringify({
      geojson: {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [coords],
        },
      },
    });
    headers['Content-Type'] = 'application/json';
    return {
      url: `${GFW_BASE}/4wings/report?${qp.toString()}`,
      method: 'POST',
      headers,
      body,
    };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;

    if (body.statusCode && body.statusCode !== 200) {
      const messages = Array.isArray(body.messages)
        ? (body.messages as Array<{ title?: string; detail?: string }>)
            .map((m) => m.detail ?? m.title)
            .join('; ')
        : String(body.error ?? 'GFW API error');
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: messages,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }

    switch (req.toolId) {
      case 'gfw.vessel.search':
        return this.parseVesselSearch(body as unknown as GfwVesselSearchResponse);
      case 'gfw.vessel.details':
        return this.parseVesselDetails(body as unknown as GfwVesselDetailResponse);
      case 'gfw.vessel.fishing_events':
        return this.parseFishingEvents(
          body as unknown as GfwEventsResponse,
          req.params as Record<string, unknown>,
        );
      case 'gfw.ocean.fishing_effort':
        return this.parseFishingEffort(
          body as unknown as GfwEffortResponse,
          req.params as Record<string, unknown>,
        );
      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported tool: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: raw.durationMs,
        };
    }
  }

  private normalizeVessel(entry: import('./types').GfwVesselEntry): GfwVesselNormalized {
    const info = entry.selfReportedInfo?.[0] ?? {};
    const combined = entry.combinedSourcesInfo?.[0] ?? {};
    return {
      vessel_id: info.id ?? combined.vesselId ?? '',
      name: info.shipname ?? '',
      flag: info.flag ?? '',
      ssvid: info.ssvid ?? '',
      imo: info.imo ?? null,
      callsign: info.callsign ?? null,
      ship_types: (combined.shiptypes ?? []).map((s) => s.name),
      gear_types: (combined.geartypes ?? []).map((g) => g.name),
      transmission_from: info.transmissionDateFrom ?? '',
      transmission_to: info.transmissionDateTo ?? '',
      source_datasets: entry.selfReportedInfo?.flatMap((s) => s.sourceCode ?? []) ?? [],
    };
  }

  private parseVesselSearch(data: GfwVesselSearchResponse): GfwVesselSearchOutput {
    return {
      total: data.total,
      vessels: (data.entries ?? []).map((e) => this.normalizeVessel(e)),
    };
  }

  private parseVesselDetails(data: GfwVesselDetailResponse): GfwVesselDetailOutput {
    const info = data.selfReportedInfo?.[0] ?? ({} as import('./types').GfwVesselSelfReported);
    const combined =
      data.combinedSourcesInfo?.[0] ?? ({} as import('./types').GfwCombinedSourcesInfo);
    return {
      vessel_id: info.id ?? combined.vesselId ?? '',
      name: info.shipname ?? '',
      flag: info.flag ?? '',
      ssvid: info.ssvid ?? '',
      imo: info.imo ?? null,
      callsign: info.callsign ?? null,
      ship_types: (combined.shiptypes ?? []).map((s) => s.name),
      gear_types: (combined.geartypes ?? []).map((g) => g.name),
      transmission_from: info.transmissionDateFrom ?? '',
      transmission_to: info.transmissionDateTo ?? '',
      source_datasets: data.selfReportedInfo?.flatMap((s) => s.sourceCode ?? []) ?? [],
      registry_records: data.registryInfoTotalRecords,
    };
  }

  private parseFishingEvents(
    data: GfwEventsResponse,
    params: Record<string, unknown>,
  ): GfwFishingEventsOutput {
    return {
      vessel_id: String(params.vessel_id),
      total: data.total,
      offset: data.offset,
      next_offset: data.nextOffset,
      events: (data.entries ?? []).map((e) => ({
        id: e.id,
        type: e.type,
        start: e.start,
        end: e.end,
        lat: e.position?.lat ?? 0,
        lon: e.position?.lon ?? 0,
        eez_ids: e.regions?.eez ?? [],
        rfmo_ids: e.regions?.rfmo ?? [],
        fao_areas: e.regions?.fao ?? [],
        distance_from_shore_km: e.distances?.startDistanceFromShoreKm ?? 0,
        distance_from_port_km: e.distances?.startDistanceFromPortKm ?? 0,
        port_name: e.port?.name ?? null,
        port_flag: e.port?.flag ?? null,
      })),
    };
  }

  private parseFishingEffort(
    data: GfwEffortResponse,
    params: Record<string, unknown>,
  ): GfwFishingEffortOutput {
    const allCells = (data.entries ?? []).flatMap((entry) => Object.values(entry).flat());
    const gearTypes = [...new Set(allCells.map((c) => c.geartype))];
    return {
      total_cells: allCells.length,
      date_range: `${params.start_date ?? ''}/${params.end_date ?? ''}`,
      gear_types: gearTypes,
      cells: allCells.map((c) => ({
        date: c.date,
        gear_type: c.geartype,
        fishing_hours: Math.round(c.hours * 100) / 100,
        vessel_count: c.vesselIDs,
        lat: c.lat,
        lon: c.lon,
      })),
    };
  }
}
