import { BaseAdapter } from '../base.adapter';
import { type ProviderRequest, type ProviderRawResponse, ProviderErrorCode } from '../../types/provider';

/**
 * Calendarific adapter (UC-111).
 * Premium world holidays API. 230+ countries. API key. Free: 500/mo.
 */
export class CalendarificAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ provider: 'calendarific', baseUrl: 'https://calendarific.com/api/v2' });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    if (req.toolId !== 'calendarific.holidays') {
      throw { code: ProviderErrorCode.INVALID_RESPONSE, httpStatus: 502, message: `Unsupported: ${req.toolId}`, provider: this.provider, toolId: req.toolId, durationMs: 0 };
    }
    const qs = new URLSearchParams();
    qs.set('api_key', this.apiKey);
    qs.set('country', String(p.country).toUpperCase());
    qs.set('year', String(p.year ?? 2026));
    if (p.month) qs.set('month', String(p.month));
    if (p.day) qs.set('day', String(p.day));
    if (p.type) qs.set('type', String(p.type));
    return { url: `${this.baseUrl}/holidays?${qs}`, method: 'GET', headers: { Accept: 'application/json' } };
  }

  protected parseResponse(raw: ProviderRawResponse, _req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;
    const resp = (body.response ?? {}) as Record<string, unknown>;
    const holidays = (resp.holidays ?? []) as Array<Record<string, unknown>>;
    return {
      total: holidays.length,
      holidays: holidays.slice(0, 50).map((h) => ({
        name: h.name,
        description: h.description,
        date: ((h.date as Record<string, unknown>)?.iso),
        type: h.type,
        primary_type: h.primary_type,
        country: ((h.country as Record<string, unknown>)?.name),
      })),
    };
  }
}
