import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  IrctcTrainBetweenStationsResponse,
  IrctcLiveStatusResponse,
  IrctcStationSearchResponse,
  IrctcTrainSearchOutput,
  IrctcTrainStatusOutput,
  IrctcStationSearchOutput,
  IrctcStatusStation,
} from './types';

/**
 * IRCTC Indian Railways adapter via RapidAPI (UC-426).
 *
 * Supported tools:
 *   irctc.train_search   → GET /api/v3/trainBetweenStations
 *   irctc.train_status   → GET /api/v1/liveTrainStatus
 *   irctc.station_search → GET /api/v1/searchStation
 *
 * Auth: X-RapidAPI-Key header (reuses PROVIDER_KEY_RAPIDAPI).
 * RapidAPI Basic plan — commercial use OK.
 * Rate limit depends on subscribed plan; default conservative: 500 req/month.
 */
export class IrctcAdapter extends BaseAdapter {
  private readonly rapidApiKey: string;

  constructor(rapidApiKey: string) {
    super({
      provider: 'irctc',
      baseUrl: 'https://irctc1.p.rapidapi.com',
    });
    this.rapidApiKey = rapidApiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      'X-RapidAPI-Key': this.rapidApiKey,
      'X-RapidAPI-Host': 'irctc1.p.rapidapi.com',
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'irctc.train_search': {
        const qp = new URLSearchParams();
        qp.set(
          'fromStationCode',
          encodeURIComponent(String(params.from_station_code ?? '')).toUpperCase(),
        );
        qp.set(
          'toStationCode',
          encodeURIComponent(String(params.to_station_code ?? '')).toUpperCase(),
        );
        qp.set('dateOfJourney', encodeURIComponent(String(params.date_of_journey ?? '')));
        return {
          url: `${this.baseUrl}/api/v3/trainBetweenStations?${qp.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'irctc.train_status': {
        const qp = new URLSearchParams();
        qp.set('trainNo', encodeURIComponent(String(params.train_number ?? '')));
        qp.set('startDay', String(params.start_day ?? 0));
        return {
          url: `${this.baseUrl}/api/v1/liveTrainStatus?${qp.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'irctc.station_search': {
        const qp = new URLSearchParams();
        qp.set('query', encodeURIComponent(String(params.query ?? '')));
        return {
          url: `${this.baseUrl}/api/v1/searchStation?${qp.toString()}`,
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
    const body = raw.body as Record<string, unknown>;

    // RapidAPI 402 plan limit exceeded
    if (raw.status === 402) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'IRCTC RapidAPI plan limit exceeded — upgrade your subscription at rapidapi.com',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }

    // RapidAPI 401 bad key
    if (raw.status === 401) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'IRCTC RapidAPI authentication failed — check PROVIDER_KEY_RAPIDAPI',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }

    // Upstream returned status:false (no results or error)
    if (body.status === false) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `IRCTC upstream returned no results: ${String(body.message ?? 'unknown error')}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }

    switch (req.toolId) {
      case 'irctc.train_search':
        return this.parseTrainSearch(
          body as IrctcTrainBetweenStationsResponse,
          req.params as Record<string, unknown>,
        );
      case 'irctc.train_status':
        return this.parseTrainStatus(body as IrctcLiveStatusResponse);
      case 'irctc.station_search':
        return this.parseStationSearch(
          body as IrctcStationSearchResponse,
          req.params as Record<string, unknown>,
        );
      default:
        return body;
    }
  }

  private parseTrainSearch(
    body: IrctcTrainBetweenStationsResponse,
    params: Record<string, unknown>,
  ): IrctcTrainSearchOutput {
    const trains = (body.data ?? []).map((t) => ({
      train_number: t.train_number ?? '',
      train_name: t.train_name ?? '',
      departure: t.from_std ?? t.from_sta ?? '',
      arrival: t.to_std ?? t.to_sta ?? '',
      distance: String(t.distance ?? ''),
      classes: t.classes ?? [],
      run_days: t.run_days ?? {},
      train_type: t.train_type ?? '',
    }));

    return {
      trains,
      count: trains.length,
      from_station: String(params.from_station_code ?? ''),
      to_station: String(params.to_station_code ?? ''),
      date: String(params.date_of_journey ?? ''),
    };
  }

  private parseTrainStatus(body: IrctcLiveStatusResponse): IrctcTrainStatusOutput {
    const data = body.data ?? {};
    const stations = (data.stations ?? []).map((s: IrctcStatusStation) => ({
      code: s.station_code ?? '',
      name: s.station_name ?? '',
      scheduled_arrival: s.scheduled_arrival ?? '',
      actual_arrival: s.actual_arrival ?? '',
      scheduled_departure: s.scheduled_departure ?? '',
      actual_departure: s.actual_departure ?? '',
      delay_minutes: s.delay_arrival ?? s.delay_departure ?? 0,
      distance_km: s.distance ?? 0,
      is_current: s.is_current ?? false,
    }));

    return {
      train_number: data.train_number ?? '',
      train_name: data.train_name ?? '',
      current_station: data.current_station_name ?? data.current_station_code ?? '',
      delay_minutes: data.delay ?? 0,
      position: data.position ?? '',
      journey_date: data.journey_date ?? '',
      stations,
    };
  }

  private parseStationSearch(
    body: IrctcStationSearchResponse,
    params: Record<string, unknown>,
  ): IrctcStationSearchOutput {
    const stations = (body.data ?? []).slice(0, 20).map((s) => ({
      code: s.station_code ?? '',
      name: s.station_name ?? '',
      state: s.state ?? '',
      city: s.city ?? '',
    }));

    return {
      stations,
      count: stations.length,
      query: String(params.query ?? ''),
    };
  }
}
