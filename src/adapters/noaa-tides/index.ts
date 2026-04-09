import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  TidePredictionsOutput,
  TidePrediction,
  WaterLevelsOutput,
  WaterLevelReading,
} from './types';

const TIDES_BASE = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';

/**
 * NOAA Tides & Currents adapter (UC-374).
 *
 * Real-time water levels and tide predictions from NOAA stations.
 * US Gov public domain, no auth, unlimited.
 */
export class NoaaTidesAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'noaa-tides', baseUrl: TIDES_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'tides.predictions': {
        const qp = new URLSearchParams();
        qp.set('station', String(params.station));
        qp.set('product', 'predictions');
        qp.set('begin_date', String(params.begin_date));
        qp.set('end_date', String(params.end_date));
        qp.set('datum', String(params.datum || 'MLLW'));
        qp.set('units', String(params.units || 'english'));
        qp.set('time_zone', 'lst_ldt');
        qp.set('interval', String(params.interval || 'hilo'));
        qp.set('format', 'json');
        qp.set('application', 'apibase');
        return { url: `${TIDES_BASE}?${qp.toString()}`, method: 'GET', headers };
      }

      case 'tides.water_levels': {
        const qp = new URLSearchParams();
        qp.set('station', String(params.station));
        qp.set('product', 'water_level');
        qp.set('datum', String(params.datum || 'MLLW'));
        qp.set('units', String(params.units || 'english'));
        qp.set('time_zone', 'lst_ldt');
        qp.set('format', 'json');
        qp.set('application', 'apibase');
        if (params.date) {
          qp.set('date', String(params.date));
        } else {
          qp.set('date', 'latest');
        }
        return { url: `${TIDES_BASE}?${qp.toString()}`, method: 'GET', headers };
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

    if (body.error) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `NOAA Tides error: ${JSON.stringify(body.error).slice(0, 200)}`,
        provider: this.provider,
        durationMs: 0,
      };
    }

    switch (req.toolId) {
      case 'tides.predictions':
        return this.parsePredictions(body);
      case 'tides.water_levels':
        return this.parseWaterLevels(body);
      default:
        return body;
    }
  }

  private parsePredictions(body: Record<string, unknown>): TidePredictionsOutput {
    const predictions = (body.predictions ?? []) as Array<Record<string, string>>;
    const meta = (body.metadata ?? {}) as Record<string, string>;

    return {
      station_id: meta.id ?? '',
      station_name: meta.name ?? '',
      datum: String(body.datum ?? 'MLLW'),
      units: 'ft',
      total: predictions.length,
      predictions: predictions.map(
        (p): TidePrediction => ({
          time: p.t ?? '',
          value: parseFloat(p.v) || 0,
        }),
      ),
    };
  }

  private parseWaterLevels(body: Record<string, unknown>): WaterLevelsOutput {
    const data = (body.data ?? []) as Array<Record<string, string>>;
    const meta = (body.metadata ?? {}) as Record<string, string>;

    return {
      station_id: meta.id ?? '',
      station_name: meta.name ?? '',
      datum: String(body.datum ?? 'MLLW'),
      units: 'ft',
      total: data.length,
      readings: data.map(
        (d): WaterLevelReading => ({
          time: d.t ?? '',
          value: parseFloat(d.v) || 0,
          quality: d.q ?? '',
        }),
      ),
    };
  }
}
