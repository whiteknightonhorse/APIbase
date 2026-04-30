import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

/**
 * Eurostat adapter (UC-410) — 35K+ EU statistical datasets.
 * CC BY 4.0, no auth, no rate limit. JSON-stat 2.0 format.
 *
 * NOTE: multi-country queries silently return empty — adapter accepts ONE
 * country per call (geo) and tells the agent to call again per country.
 */
const DATASET_FOR_TOOL: Record<
  string,
  { code: string; freq: 'A' | 'M' | 'Q'; defaultParams: Record<string, string> }
> = {
  'eurostat.unemployment': {
    code: 'une_rt_m',
    freq: 'M',
    defaultParams: { age: 'TOTAL', sex: 'T', s_adj: 'SA', unit: 'PC_ACT' },
  },
  'eurostat.inflation': {
    code: 'prc_hicp_manr',
    freq: 'M',
    defaultParams: { coicop: 'CP00' },
  },
  'eurostat.gdp_growth': {
    code: 'tec00115',
    freq: 'A',
    defaultParams: { unit: 'CLV_PCH_PRE' },
  },
  'eurostat.population': {
    code: 'demo_gind',
    freq: 'A',
    defaultParams: { indic_de: 'JAN' },
  },
};

export class EurostatAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'eurostat',
      baseUrl: 'https://ec.europa.eu/eurostat',
      maxResponseBytes: 2_500_000,
    });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const meta = DATASET_FOR_TOOL[req.toolId];
    if (!meta) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Unsupported: ${req.toolId}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    const qs = new URLSearchParams();
    qs.set('format', 'JSON');
    qs.set('lang', 'EN');
    qs.set('geo', String(p.country ?? 'EU27_2020').toUpperCase());
    if (p.since) qs.set('sinceTimePeriod', String(p.since));
    if (p.until) qs.set('untilTimePeriod', String(p.until));
    for (const [k, v] of Object.entries(meta.defaultParams)) qs.append(k, v);

    return {
      url: `${this.baseUrl}/api/dissemination/statistics/1.0/data/${meta.code}?${qs.toString()}`,
      method: 'GET',
      headers: { Accept: 'application/json' },
    };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as {
      label?: string;
      value?: Record<string, number>;
      dimension?: Record<
        string,
        { category?: { index?: Record<string, number>; label?: Record<string, string> } }
      >;
      updated?: string;
      source?: string;
    };
    const meta = DATASET_FOR_TOOL[req.toolId];

    // JSON-stat 2.0: value is a flat dict keyed by an index integer
    const values = body.value ?? {};
    const timeDim = body.dimension?.time?.category ?? {};
    const timeIndex = timeDim.index ?? {};
    const timeLabel = timeDim.label ?? {};

    // Map index -> period string -> value
    const indexToPeriod: Record<number, string> = {};
    for (const [period, idx] of Object.entries(timeIndex)) {
      indexToPeriod[idx] = timeLabel[period] ?? period;
    }

    const observations: Array<{ period: string; value: number | null }> = [];
    for (const [idxStr, value] of Object.entries(values)) {
      const idx = Number(idxStr);
      const period = indexToPeriod[idx];
      if (period) observations.push({ period, value });
    }
    observations.sort((a, b) => (a.period < b.period ? -1 : 1));

    return {
      dataset_code: meta?.code,
      dataset_label: body.label,
      source: body.source,
      updated: body.updated,
      country: (req.params as Record<string, unknown>).country ?? 'EU27_2020',
      observations,
      latest: observations.length > 0 ? observations[observations.length - 1] : null,
    };
  }
}
