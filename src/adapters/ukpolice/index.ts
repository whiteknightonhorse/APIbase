import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

/**
 * UK Police API adapter (UC-411).
 * Crime, force, and outcome data for England + Wales (43 forces).
 * OGL v3.0 (Open Government Licence) — commercial reuse explicitly permitted.
 * No auth, no rate limit. https://data.police.uk/docs/
 */
export class UkPoliceAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'ukpolice', baseUrl: 'https://data.police.uk', maxResponseBytes: 2_000_000 });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'ukpolice.crimes_near': {
        const qs = new URLSearchParams();
        qs.set('lat', String(p.lat));
        qs.set('lng', String(p.lng));
        if (p.date) qs.set('date', String(p.date));
        const category = p.category ? String(p.category) : 'all-crime';
        return {
          url: `${this.baseUrl}/api/crimes-street/${encodeURIComponent(category)}?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }
      case 'ukpolice.forces':
        return { url: `${this.baseUrl}/api/forces`, method: 'GET', headers };
      case 'ukpolice.outcomes_at_location': {
        const qs = new URLSearchParams();
        qs.set('lat', String(p.lat));
        qs.set('lng', String(p.lng));
        if (p.date) qs.set('date', String(p.date));
        return {
          url: `${this.baseUrl}/api/outcomes-at-location?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }
      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body;

    switch (req.toolId) {
      case 'ukpolice.crimes_near': {
        const list = (body as Array<Record<string, unknown>>) ?? [];
        const params = req.params as Record<string, unknown>;
        const limit = Math.max(1, Math.min(500, Number(params.limit ?? 100)));
        // Group by category for a quick summary
        const byCategory: Record<string, number> = {};
        for (const c of list) {
          const cat = String(c.category ?? 'unknown');
          byCategory[cat] = (byCategory[cat] ?? 0) + 1;
        }
        return {
          total: list.length,
          returned: Math.min(limit, list.length),
          summary_by_category: byCategory,
          crimes: list.slice(0, limit).map((c) => ({
            category: c.category,
            location: c.location,
            month: c.month,
            id: c.id,
            persistent_id: c.persistent_id,
            outcome_status: c.outcome_status,
          })),
        };
      }
      case 'ukpolice.forces': {
        const list = (body as Array<Record<string, unknown>>) ?? [];
        return { total: list.length, forces: list };
      }
      case 'ukpolice.outcomes_at_location': {
        const list = (body as Array<Record<string, unknown>>) ?? [];
        const limit = Math.max(
          1,
          Math.min(500, Number((req.params as Record<string, unknown>).limit ?? 100)),
        );
        return {
          total: list.length,
          returned: Math.min(limit, list.length),
          outcomes: list.slice(0, limit).map((o) => ({
            category: ((o.category as Record<string, unknown>) ?? {}).name,
            crime: ((o.crime as Record<string, unknown>) ?? {}).category,
            month: o.date,
            location: ((o.crime as Record<string, unknown>) ?? {}).location,
          })),
        };
      }
      default:
        return body;
    }
  }
}
