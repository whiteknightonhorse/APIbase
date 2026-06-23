import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { OpenSenseMapBox, OpenSenseMapMeasurement } from './types';

const API_BASE = 'https://api.opensensemap.org';

export class OpenSenseMapAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'opensensemap', baseUrl: API_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const p = req.params as Record<string, unknown>;
    let url: string;

    switch (req.toolId) {
      case 'opensensemap.box_search': {
        const params = new URLSearchParams();
        if (p.latitude !== undefined && p.longitude !== undefined) {
          params.set('near', `${p.longitude},${p.latitude}`);
          params.set('maxDistance', String(p.max_distance ?? 5000));
        }
        if (p.name) params.set('name', encodeURIComponent(String(p.name)));
        if (p.grouptag) params.set('grouptag', encodeURIComponent(String(p.grouptag)));
        if (p.exposure) params.set('exposure', String(p.exposure));
        if (p.phenomenon) params.set('phenomenon', encodeURIComponent(String(p.phenomenon)));
        params.set('limit', String(Math.min(Number(p.limit ?? 20), 100)));
        params.set('minimal', 'false');
        url = `${API_BASE}/boxes?${params.toString()}`;
        break;
      }
      case 'opensensemap.box_detail': {
        const boxId = encodeURIComponent(String(p.box_id));
        url = `${API_BASE}/boxes/${boxId}`;
        break;
      }
      case 'opensensemap.sensors_latest': {
        const boxId = encodeURIComponent(String(p.box_id));
        url = `${API_BASE}/boxes/${boxId}/sensors`;
        break;
      }
      case 'opensensemap.sensor_timeseries': {
        const boxId = encodeURIComponent(String(p.box_id));
        const sensorId = encodeURIComponent(String(p.sensor_id));
        const params = new URLSearchParams();
        if (p.from_date) params.set('from-date', String(p.from_date));
        if (p.to_date) params.set('to-date', String(p.to_date));
        params.set('limit', String(Math.min(Number(p.limit ?? 100), 10000)));
        url = `${API_BASE}/boxes/${boxId}/data/${sensorId}?${params.toString()}`;
        break;
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

    return {
      url,
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'APIbase.pro/1.0 (https://apibase.pro)',
      },
    };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    switch (req.toolId) {
      case 'opensensemap.box_search': {
        const boxes = raw.body as OpenSenseMapBox[];
        return {
          total: boxes.length,
          stations: boxes.map((b) => ({
            id: b._id,
            name: b.name,
            longitude: b.currentLocation?.coordinates[0],
            latitude: b.currentLocation?.coordinates[1],
            exposure: b.exposure ?? null,
            model: b.model ?? null,
            grouptag: b.grouptag ?? [],
            last_measurement_at: b.lastMeasurementAt ?? null,
            sensor_count: b.sensors?.length ?? 0,
            sensors: (b.sensors ?? []).map((s) => ({
              id: s._id,
              title: s.title,
              unit: s.unit,
              sensor_type: s.sensorType,
              last_value: s.lastMeasurement?.value ?? null,
              last_at: s.lastMeasurement?.createdAt ?? null,
            })),
          })),
        };
      }
      case 'opensensemap.box_detail': {
        const b = raw.body as OpenSenseMapBox;
        return {
          id: b._id,
          name: b.name,
          longitude: b.currentLocation?.coordinates[0],
          latitude: b.currentLocation?.coordinates[1],
          exposure: b.exposure ?? null,
          model: b.model ?? null,
          grouptag: b.grouptag ?? [],
          created_at: b.createdAt ?? null,
          last_measurement_at: b.lastMeasurementAt ?? null,
          sensors: (b.sensors ?? []).map((s) => ({
            id: s._id,
            title: s.title,
            unit: s.unit,
            sensor_type: s.sensorType,
            last_value: s.lastMeasurement?.value ?? null,
            last_at: s.lastMeasurement?.createdAt ?? null,
          })),
        };
      }
      case 'opensensemap.sensors_latest': {
        const d = raw.body as OpenSenseMapBox;
        return {
          box_id: d._id,
          sensors: (d.sensors ?? []).map((s) => ({
            id: s._id,
            title: s.title,
            unit: s.unit,
            sensor_type: s.sensorType,
            last_value: s.lastMeasurement?.value ?? null,
            last_at: s.lastMeasurement?.createdAt ?? null,
          })),
        };
      }
      case 'opensensemap.sensor_timeseries': {
        const measurements = raw.body as OpenSenseMapMeasurement[];
        return {
          total: measurements.length,
          measurements: measurements.map((m) => ({
            value: m.value,
            timestamp: m.createdAt,
          })),
        };
      }
      default:
        return raw.body;
    }
  }
}
