import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  OecdSdmxResponse,
  OecdSdmxDimension,
  OecdSeries,
  OecdObservation,
  OecdToolOutput,
} from './types';

const API_BASE = 'https://sdmx.oecd.org/public/rest/data';

// ─── Dataflow identifiers (agency,dataflow,version) ──────────────────────

const DATAFLOWS: Record<string, string> = {
  // Annual GDP and national accounts — expenditure approach
  'oecd.economy.gdp': 'OECD.SDD.NAD,DSD_NAMAIN10%40DF_TABLE1,2.0',
  // Monthly unemployment rates (LFS)
  'oecd.economy.unemployment': 'OECD.SDD.TPS,DSD_LFS%40DF_IALFS_UNE_M,1.0',
  // Consumer price indices (CPI/inflation) — COICOP 1999
  'oecd.economy.inflation': 'OECD.SDD.TPS,DSD_PRICES%40DF_PRICES_ALL,1.0',
  // Greenhouse gas emissions (CO2-equivalent by gas/sector)
  'oecd.environment.emissions': 'OECD.ENV.EPI,DSD_AIR_GHG%40DF_AIR_GHG,1.0',
  // Balance of Payments (current account, financial account)
  'oecd.economy.trade': 'OECD.SDD.TPS,DSD_BOP%40DF_BOP,1.0',
};

// Dimension filter applied after fetching all-wildcard data, per tool.
// Returns true for series to INCLUDE. undefined = include everything.
type SeriesFilter = (dims: Record<string, string>) => boolean;

const SERIES_FILTERS: Record<string, SeriesFilter> = {
  'oecd.economy.gdp': (d) =>
    d.TRANSACTION?.startsWith('B1G') === true &&
    d.UNIT_MEASURE === 'USD_EXC' &&
    d.TRANSFORMATION === 'N' &&
    d.ACTIVITY === '_T',
  'oecd.economy.unemployment': (d) =>
    d.MEASURE === 'UNE_LF_M' &&
    d.SEX === '_T' &&
    d.AGE === 'Y_GE15' &&
    (d.ADJUSTMENT === 'Y' || d.ADJUSTMENT === 'N'),
  'oecd.economy.inflation': (d) =>
    d.MEASURE === 'CPI' &&
    (d.EXPENDITURE === 'CP00' || d.EXPENDITURE === 'COICOP_TOT') &&
    d.TRANSFORMATION === 'GY' &&
    d.ADJUSTMENT === 'N',
  'oecd.environment.emissions': (d) =>
    d.UNIT_MEASURE === 'CO2EQ_MN_TONNE' || d.UNIT_MEASURE === 'CO2EQ_KG_TONNE' || true,
  'oecd.economy.trade': (d) =>
    (d.MEASURE === 'B_CA' || d.MEASURE === 'B_G_S' || d.MEASURE === 'B_G' || d.MEASURE === 'B_S') &&
    d.COUNTERPART_AREA === 'W1',
};

const DATASET_NAMES: Record<string, string> = {
  'oecd.economy.gdp': 'Annual GDP and National Accounts (OECD NAMAIN10)',
  'oecd.economy.unemployment': 'Monthly Unemployment Rates — Labour Force Survey (OECD LFS)',
  'oecd.economy.inflation': 'Consumer Price Indices (CPI) — COICOP 1999 (OECD)',
  'oecd.environment.emissions': 'Greenhouse Gas Emissions (OECD ENV.EPI)',
  'oecd.economy.trade': 'Balance of Payments — Current & Capital Account (OECD BOP)',
};

// ─── SDMX-JSON series parser ──────────────────────────────────────────────

/**
 * Decode an SDMX-JSON 2.0 response (series layout) into normalized OecdSeries[].
 * Applies the per-tool filter to limit the returned series.
 */
function parseSdmxSeries(
  raw: OecdSdmxResponse,
  filter: SeriesFilter | undefined,
  maxSeries: number,
): { series: OecdSeries[]; total: number } {
  const structures = raw.data?.structures;
  const dataSets = raw.data?.dataSets;

  if (!structures?.length || !dataSets?.length) {
    return { series: [], total: 0 };
  }

  const struct = structures[0];
  const seriesDims: OecdSdmxDimension[] = struct.dimensions?.series ?? [];
  const obsDims: OecdSdmxDimension[] = struct.dimensions?.observation ?? [];
  const timeDim = obsDims.find((d) => d.id === 'TIME_PERIOD');

  const rawSeries = dataSets[0].series ?? {};
  const allSeries: OecdSeries[] = [];

  for (const [key, seriesEntry] of Object.entries(rawSeries)) {
    if (!seriesEntry.observations) continue;

    // Decode colon-separated indices into dimension labels
    const idxParts = key.split(':');
    const dims: Record<string, string> = {};
    for (let i = 0; i < seriesDims.length; i++) {
      const idx = Number(idxParts[i]);
      const dim = seriesDims[i];
      const val = dim.values[idx];
      if (val) dims[dim.id] = val.id;
    }

    // Apply filter
    if (filter && !filter(dims)) continue;

    // Decode observations
    const obs: OecdObservation[] = [];
    for (const [timeIdx, obsValue] of Object.entries(seriesEntry.observations)) {
      if (obsValue[0] == null) continue;
      const period = timeDim?.values[Number(timeIdx)]?.id ?? timeIdx;
      obs.push({ period, value: obsValue[0] as number });
    }

    if (obs.length === 0) continue;

    // Sort observations by period
    obs.sort((a, b) => a.period.localeCompare(b.period));
    allSeries.push({ dimensions: dims, observations: obs });
  }

  const total = allSeries.length;
  return { series: allSeries.slice(0, maxSeries), total };
}

// ─── Adapter ─────────────────────────────────────────────────────────────

/**
 * OECD Statistics SDMX REST adapter (UC-538).
 *
 * Provides 5 tools backed by the OECD SDMX v2.1 public API at sdmx.oecd.org.
 * No authentication required. Unlimited public access. CC BY 4.0.
 *
 * Tools:
 *   oecd.economy.gdp          → Annual GDP and national accounts
 *   oecd.economy.unemployment → Monthly unemployment rates (LFS)
 *   oecd.economy.inflation    → Consumer price indices (CPI)
 *   oecd.environment.emissions → Greenhouse gas emissions
 *   oecd.economy.trade        → Balance of Payments
 */
export class OecdStatsAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'oecd-stats', baseUrl: API_BASE, maxResponseBytes: 2_000_000 });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const dataflow = DATAFLOWS[req.toolId];
    if (!dataflow) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Unsupported OECD tool: ${req.toolId}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    const params = req.params as Record<string, unknown>;
    const country = String(params.country ?? 'USA').toUpperCase();

    // Build start/end period query params
    const qp = new URLSearchParams({ format: 'jsondata' });
    if (params.start_period) qp.set('startPeriod', String(params.start_period));
    if (params.end_period) qp.set('endPeriod', String(params.end_period));

    // All wildcards after the first dimension (country/REF_AREA) position varies.
    // Use the full wildcard key pattern tested during onboarding.
    const keyMap: Record<string, string> = {
      'oecd.economy.gdp': `A.${country}.............`,
      'oecd.economy.unemployment': `${country}...........`,
      'oecd.economy.inflation': `${country}.........`,
      'oecd.environment.emissions': `${country}.......`,
      'oecd.economy.trade': `${country}.......`,
    };

    const key = keyMap[req.toolId] ?? `${country}.......`;
    const url = `${API_BASE}/${dataflow}/${key}?${qp.toString()}`;

    return {
      url,
      method: 'GET',
      headers: { Accept: 'application/json' },
    };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const params = req.params as Record<string, unknown>;
    const body = raw.body as OecdSdmxResponse;
    const country = String(params.country ?? 'USA').toUpperCase();
    const maxSeries = Math.min(Number(params.max_series) || 20, 100);

    const filter = SERIES_FILTERS[req.toolId];
    const { series, total } = parseSdmxSeries(body, filter, maxSeries);

    const output: OecdToolOutput = {
      dataset: DATASET_NAMES[req.toolId] ?? req.toolId,
      country,
      start_period: String(params.start_period ?? ''),
      end_period: String(params.end_period ?? ''),
      series,
      total_series: total,
      returned_series: series.length,
    };

    return output;
  }
}
