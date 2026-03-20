import { BaseAdapter } from '../base.adapter';
import { type ProviderRequest, type ProviderRawResponse, ProviderErrorCode } from '../../types/provider';

/**
 * TimeAPI.io adapter (UC-103).
 * World clock, timezone conversion, zone listing.
 * Auth: None. Free, unlimited.
 */
export class TimeApiAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'timeapi', baseUrl: 'https://timeapi.io/api' });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const h: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'worldclock.current':
        return { url: `${this.baseUrl}/time/current/zone?timeZone=${encodeURIComponent(String(p.timezone))}`, method: 'GET', headers: h };

      case 'worldclock.convert': {
        const body = {
          fromTimeZone: p.from_timezone,
          dateTime: p.datetime,
          toTimeZone: p.to_timezone,
          dstAmbiguity: '',
        };
        return { url: `${this.baseUrl}/conversion/converttimezone`, method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
      }

      case 'worldclock.zones':
        return { url: `${this.baseUrl}/timezone/availabletimezones`, method: 'GET', headers: h };

      default:
        throw { code: ProviderErrorCode.INVALID_RESPONSE, httpStatus: 502, message: `Unsupported: ${req.toolId}`, provider: this.provider, toolId: req.toolId, durationMs: 0 };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body;

    if (req.toolId === 'worldclock.current') {
      const d = body as Record<string, unknown>;
      return {
        timezone: d.timeZone,
        datetime: d.dateTime,
        date: d.date,
        time: d.time,
        day_of_week: d.dayOfWeek,
        dst_active: d.dstActive,
      };
    }

    if (req.toolId === 'worldclock.convert') {
      const d = body as Record<string, unknown>;
      const result = (d.conversionResult ?? {}) as Record<string, unknown>;
      return {
        from_timezone: (d.fromTimezone ?? d.fromTimeZone) as string,
        from_datetime: (d.fromDateTime ?? d.dateTime) as string,
        to_timezone: result.timeZone,
        to_datetime: result.dateTime,
        to_date: result.date,
        to_time: result.time,
        dst_active: result.dstActive,
      };
    }

    // zones
    const zones = body as string[];
    return { total: zones.length, zones };
  }
}
