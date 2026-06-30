import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

/**
 * Eurostat SDMX 2.1 adapter (UC-542) — EU statistical datasets.
 * CC BY 4.0, no auth, no rate limit. SDMX 2.1 key-based filtering.
 * JSON-stat 2.0 response format. 5 datasets: fertility, GHG, R&D, renewables, youth employment.
 */

interface JsonStatDimension {
  label?: string;
  category?: {
    index?: Record<string, number>;
    label?: Record<string, string>;
  };
}

interface JsonStatResponse {
  label?: string;
  source?: string;
  updated?: string;
  value?: Record<string, number>;
  dimension?: Record<string, JsonStatDimension>;
}

const TOOL_CONFIG: Record<
  string,
  { dataset: string; buildKey: (p: Record<string, unknown>) => string; defaultSince: string }
> = {
  'eurostat2.fertility': {
    dataset: 'demo_find',
    buildKey: (p) =>
      `A.${String(p.indicator ?? 'TOTFERRT').toUpperCase()}.${String(p.country ?? 'DE').toUpperCase()}`,
    defaultSince: '2010',
  },
  'eurostat2.ghg_emissions': {
    dataset: 'env_air_gge',
    buildKey: (p) =>
      `A.MIO_T.${String(p.pollutant ?? 'GHG').toUpperCase()}.TOTX4_MEMO.${String(p.country ?? 'DE').toUpperCase()}`,
    defaultSince: '2000',
  },
  'eurostat2.rd_spending': {
    dataset: 'rd_e_gerdtot',
    buildKey: (p) =>
      `A.${String(p.sector ?? 'TOTAL').toUpperCase()}.${String(p.unit ?? 'PC_GDP').toUpperCase()}.${String(p.country ?? 'DE').toUpperCase()}`,
    defaultSince: '2005',
  },
  'eurostat2.renewable_energy': {
    dataset: 'sdg_07_10',
    buildKey: (p) =>
      `A.${String(p.unit ?? 'MTOE').toUpperCase()}.${String(p.country ?? 'DE').toUpperCase()}`,
    defaultSince: '2005',
  },
  'eurostat2.youth_employment': {
    dataset: 'yth_empl_010',
    buildKey: (p) =>
      `A.T.${String(p.age_group ?? 'Y15-24').toUpperCase()}.PC.TOTAL.${String(p.country ?? 'DE').toUpperCase()}`,
    defaultSince: '2005',
  },
};

export class Eurostat2Adapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'eurostat2',
      baseUrl: 'https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1',
      maxResponseBytes: 3_000_000,
    });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const cfg = TOOL_CONFIG[req.toolId];
    if (!cfg) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Unsupported tool: ${req.toolId}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    const key = cfg.buildKey(p);
    const qs = new URLSearchParams();
    qs.set('format', 'JSON');
    qs.set('lang', 'EN');
    qs.set('startPeriod', p.since_year ? String(p.since_year) : cfg.defaultSince);

    return {
      url: `${this.baseUrl}/data/${cfg.dataset}/${key}?${qs.toString()}`,
      method: 'GET',
      headers: { Accept: 'application/json' },
    };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as JsonStatResponse;
    const cfg = TOOL_CONFIG[req.toolId];
    const p = req.params as Record<string, unknown>;

    const values = body.value ?? {};
    const dims = body.dimension ?? {};

    // Build time-period index → label mapping
    const timeCat = dims['time']?.category ?? {};
    const timeIndex = timeCat.index ?? {};
    const timeLabel = timeCat.label ?? {};

    const indexToPeriod: Record<number, string> = {};
    for (const [period, idx] of Object.entries(timeIndex)) {
      indexToPeriod[idx] = timeLabel[period] ?? period;
    }

    const observations: Array<{ period: string; value: number | null }> = [];
    for (const [idxStr, value] of Object.entries(values)) {
      const idx = Number(idxStr);
      const period = indexToPeriod[idx] ?? String(idx);
      observations.push({ period, value });
    }
    observations.sort((a, b) => (a.period < b.period ? -1 : 1));

    return {
      dataset: cfg?.dataset,
      dataset_label: body.label,
      source: body.source,
      updated: body.updated,
      country: String(p.country ?? 'DE').toUpperCase(),
      observations,
      latest: observations.length > 0 ? observations[observations.length - 1] : null,
    };
  }
}
