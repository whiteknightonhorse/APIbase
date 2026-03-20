import { BaseAdapter } from '../base.adapter';
import { type ProviderRequest, type ProviderRawResponse, ProviderErrorCode } from '../../types/provider';

/**
 * Nager.Date public holidays adapter (UC-110).
 * World holidays for 100+ countries. No auth. Free.
 */
export class NagerDateAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'nagerdate', baseUrl: 'https://date.nager.at/api/v3' });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const h: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'holidays.by_country':
        return { url: `${this.baseUrl}/publicholidays/${p.year ?? 2026}/${String(p.country_code).toUpperCase()}`, method: 'GET', headers: h };
      case 'holidays.next':
        return { url: `${this.baseUrl}/NextPublicHolidays/${String(p.country_code).toUpperCase()}`, method: 'GET', headers: h };
      default:
        throw { code: ProviderErrorCode.INVALID_RESPONSE, httpStatus: 502, message: `Unsupported: ${req.toolId}`, provider: this.provider, toolId: req.toolId, durationMs: 0 };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, _req: ProviderRequest): unknown {
    const holidays = raw.body as Array<Record<string, unknown>>;
    return {
      total: holidays.length,
      holidays: holidays.map((h) => ({
        date: h.date, name: h.localName, name_english: h.name, country: h.countryCode, fixed: h.fixed, global: h.global, types: h.types,
      })),
    };
  }
}
