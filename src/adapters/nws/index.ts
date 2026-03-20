import { BaseAdapter } from '../base.adapter';
import { type ProviderRequest, type ProviderRawResponse, ProviderErrorCode } from '../../types/provider';

/**
 * NWS Weather Alerts adapter (UC-109).
 * US severe weather alerts. No auth. US Gov open data.
 */
export class NwsAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'nws', baseUrl: 'https://api.weather.gov' });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const h: Record<string, string> = { Accept: 'application/geo+json', 'User-Agent': '(apibase.pro, support@apibase.pro)' };

    switch (req.toolId) {
      case 'weather_alerts.active': {
        const qs = new URLSearchParams();
        if (p.area) qs.set('area', String(p.area));
        if (p.severity) qs.set('severity', String(p.severity));
        if (p.event) qs.set('event', String(p.event));
        if (p.urgency) qs.set('urgency', String(p.urgency));
        qs.set('limit', String(Math.min(Number(p.limit ?? 10), 50)));
        return { url: `${this.baseUrl}/alerts/active?${qs}`, method: 'GET', headers: h };
      }
      case 'weather_alerts.by_area': {
        const state = String(p.state).toUpperCase();
        return { url: `${this.baseUrl}/alerts/active?area=${state}&limit=${Math.min(Number(p.limit ?? 10), 50)}`, method: 'GET', headers: h };
      }
      default:
        throw { code: ProviderErrorCode.INVALID_RESPONSE, httpStatus: 502, message: `Unsupported: ${req.toolId}`, provider: this.provider, toolId: req.toolId, durationMs: 0 };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, _req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;
    const features = (body.features ?? []) as Array<Record<string, unknown>>;
    return {
      total: features.length,
      alerts: features.map((f) => {
        const p = (f.properties ?? {}) as Record<string, unknown>;
        return { event: p.event, severity: p.severity, urgency: p.urgency, certainty: p.certainty, headline: p.headline, description: (p.description as string)?.slice(0, 500), area: p.areaDesc, effective: p.effective, expires: p.expires, sender: p.senderName };
      }),
    };
  }
}
