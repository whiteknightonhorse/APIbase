import { BaseAdapter } from '../base.adapter';
import { type ProviderRequest, type ProviderRawResponse, ProviderErrorCode } from '../../types/provider';

/**
 * NASA FIRMS adapter (UC-108).
 * Satellite fire detection. Auth: MAP_KEY.
 * Free: 5,000 tx/10min. NASA open data.
 */
export class FirmsAdapter extends BaseAdapter {
  private readonly mapKey: string;

  constructor(mapKey: string) {
    super({ provider: 'firms', baseUrl: 'https://firms.modaps.eosdis.nasa.gov/api', timeoutMs: 30_000 });
    this.mapKey = mapKey;
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;

    if (req.toolId !== 'firms.fires') {
      throw { code: ProviderErrorCode.INVALID_RESPONSE, httpStatus: 502, message: `Unsupported: ${req.toolId}`, provider: this.provider, toolId: req.toolId, durationMs: 0 };
    }

    const source = String(p.source ?? 'VIIRS_SNPP_NRT');
    const days = String(p.days ?? 1);
    const west = p.west ?? -180;
    const south = p.south ?? -90;
    const east = p.east ?? 180;
    const north = p.north ?? 90;
    const area = `${west},${south},${east},${north}`;

    return {
      url: `${this.baseUrl}/area/csv/${this.mapKey}/${source}/${area}/${days}`,
      method: 'GET',
      headers: { Accept: 'text/csv' },
    };
  }

  protected parseResponse(raw: ProviderRawResponse, _req: ProviderRequest): unknown {
    // FIRMS returns CSV — parse it
    const text = typeof raw.body === 'string' ? raw.body : JSON.stringify(raw.body);

    // If response is already parsed as JSON (shouldn't happen with CSV)
    if (Array.isArray(raw.body)) {
      return { fires: (raw.body as Array<Record<string, unknown>>).slice(0, 50) };
    }

    // Parse CSV
    const lines = text.split('\n').filter((l: string) => l.trim());
    if (lines.length < 2) return { total: 0, fires: [] };

    const headers = lines[0].split(',');
    const fires = [];
    for (let i = 1; i < Math.min(lines.length, 51); i++) {
      const vals = lines[i].split(',');
      const fire: Record<string, unknown> = {};
      for (let j = 0; j < headers.length; j++) {
        const key = headers[j].trim();
        const val = vals[j]?.trim();
        if (key === 'latitude' || key === 'longitude' || key === 'bright_ti4' || key === 'bright_ti5' || key === 'frp') {
          fire[key] = parseFloat(val) || null;
        } else {
          fire[key] = val;
        }
      }
      fires.push({
        latitude: fire.latitude,
        longitude: fire.longitude,
        brightness: fire.bright_ti4,
        confidence: fire.confidence,
        satellite: fire.satellite,
        instrument: fire.instrument,
        date: fire.acq_date,
        fire_radiative_power: fire.frp,
        day_night: fire.daynight,
      });
    }

    return { total: lines.length - 1, fires };
  }
}
