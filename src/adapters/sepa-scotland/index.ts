import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  SepaStationsListResponse,
  SepaStationDetailResponse,
  SepaTimeseriesResponse,
  SepaStationsSearchOutput,
  SepaStationCurrentOutput,
  SepaRainfallHistoryOutput,
  SepaHistoryPeriod,
} from './types';

const SEPA_BASE = 'https://www2.sepa.org.uk/rainfall/api';

/** period param -> upstream URL segment. */
const PERIOD_SEGMENT: Record<SepaHistoryPeriod, string> = {
  hourly: 'Hourly',
  daily: 'Daily',
  monthly: 'Month',
};

/**
 * SEPA Scotland Rainfall Data API adapter (UC-676).
 *
 * Supported tools:
 *   sepa-scotland.stations_search   -> GET /api/Stations              full ~280-gauge network,
 *                                       filtered client-side by name substring
 *   sepa-scotland.station_current   -> GET /api/Stations/{station_no} latest reading for one gauge
 *   sepa-scotland.rainfall_history  -> GET /api/{Hourly|Daily|Month}/{station_no}?all=true
 *                                       hourly (7d), daily (1mo), or monthly (multi-year) totals
 *
 * Auth: none. Data: Scottish Environment Protection Agency (SEPA), Open Government
 * Licence v3.0 — reuse (incl. commercial) permitted with attribution to SEPA.
 * Docs: https://www2.sepa.org.uk/rainfall/
 */
export class SepaScotlandAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'sepa-scotland', baseUrl: SEPA_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'sepa-scotland.stations_search': {
        return { url: `${SEPA_BASE}/Stations`, method: 'GET', headers };
      }

      case 'sepa-scotland.station_current': {
        const stationNo = String(params.station_no || '').trim();
        if (!stationNo) {
          throw this.invalidInput(req.toolId, 'station_no is required');
        }
        return {
          url: `${SEPA_BASE}/Stations/${encodeURIComponent(stationNo)}`,
          method: 'GET',
          headers,
        };
      }

      case 'sepa-scotland.rainfall_history': {
        const stationNo = String(params.station_no || '').trim();
        if (!stationNo) {
          throw this.invalidInput(req.toolId, 'station_no is required');
        }
        const period = String(params.period || 'daily')
          .trim()
          .toLowerCase() as SepaHistoryPeriod;
        const segment = PERIOD_SEGMENT[period];
        if (!segment) {
          throw this.invalidInput(req.toolId, 'period must be one of: hourly, daily, monthly');
        }
        return {
          url: `${SEPA_BASE}/${segment}/${encodeURIComponent(stationNo)}?all=true`,
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
    const params = req.params as Record<string, unknown>;
    switch (req.toolId) {
      case 'sepa-scotland.stations_search':
        return this.parseStationsSearch(raw.body as SepaStationsListResponse, params);
      case 'sepa-scotland.station_current':
        return this.parseStationCurrent(raw.body as SepaStationDetailResponse, req);
      case 'sepa-scotland.rainfall_history':
        return this.parseRainfallHistory(raw.body as SepaTimeseriesResponse, params);
      default:
        return raw.body;
    }
  }

  private parseStationsSearch(
    data: SepaStationsListResponse,
    params: Record<string, unknown>,
  ): SepaStationsSearchOutput {
    const query = String(params.query || '')
      .trim()
      .toLowerCase();
    const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 50);

    const stations = Array.isArray(data) ? data : [];
    const filtered = query
      ? stations.filter((s) => (s.station_name ?? '').toLowerCase().includes(query))
      : stations;

    return {
      total: filtered.length,
      results: filtered.slice(0, limit).map((s) => ({
        station_no: s.station_no,
        name: s.station_name,
        latitude: Number(s.station_latitude),
        longitude: Number(s.station_longitude),
        latest_reading_mm: s.itemValue !== undefined ? Number(s.itemValue) : null,
        latest_reading_at: s.itemDate ?? null,
      })),
    };
  }

  private parseStationCurrent(
    data: SepaStationDetailResponse,
    req: ProviderRequest,
  ): SepaStationCurrentOutput {
    if (!data) {
      throw this.invalidInput(
        req.toolId,
        `No station found for station_no. Call sepa-scotland.stations_search to look up a valid station_no.`,
      );
    }
    return {
      station_no: data.station_no,
      name: data.station_name,
      latitude: Number(data.station_latitude),
      longitude: Number(data.station_longitude),
      latest_reading_mm: Number(data.itemValue),
      latest_reading_at: data.itemDate,
      accumulation_period_minutes: Number(data.accumRange),
    };
  }

  private parseRainfallHistory(
    data: SepaTimeseriesResponse,
    params: Record<string, unknown>,
  ): SepaRainfallHistoryOutput {
    const stationNo = String(params.station_no || '');
    const period = String(params.period || 'daily')
      .trim()
      .toLowerCase() as SepaHistoryPeriod;
    const points = Array.isArray(data) ? data : [];
    return {
      station_no: stationNo,
      period,
      count: points.length,
      readings: points.map((p) => ({
        timestamp: p.Timestamp,
        value_mm: Number(p.Value),
      })),
    };
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
