import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  BisSdmxResponse,
  BisSdmxDimension,
  BisSeries,
  BisObservation,
  BisToolOutput,
} from './types';

const API_BASE = 'https://stats.bis.org/api/v2/data/dataflow/BIS';

// ─── Dataflow identifiers (BIS agency, dataflow id, version) ─────────────

const DATAFLOWS: Record<string, string> = {
  'bis-stats.policy_rates': 'WS_CBPOL/1.0',
  'bis-stats.exchange_rates': 'WS_EER/1.0',
  'bis-stats.property_prices': 'WS_SPP/1.0',
};

const DATASET_NAMES: Record<string, string> = {
  'bis-stats.policy_rates': 'Central Bank Policy Rates (BIS WS_CBPOL)',
  'bis-stats.exchange_rates': 'Effective Exchange Rates (BIS WS_EER)',
  'bis-stats.property_prices': 'Selected Residential Property Prices (BIS WS_SPP)',
};

// ─── SDMX-JSON series parser (BIS v1.0.0 data message) ────────────────────

/**
 * Decode a BIS SDMX-JSON response into normalized BisSeries[].
 * BIS nests the structure at `data.structure` (a single object), unlike the
 * OECD API's `data.structures[]` array — everything else follows the same
 * series-key-index / observation-index-map layout.
 */
function parseSdmxSeries(
  raw: BisSdmxResponse,
  maxSeries: number,
): { series: BisSeries[]; total: number } {
  const struct = raw.data?.structure;
  const dataSets = raw.data?.dataSets;

  if (!struct || !dataSets?.length) {
    return { series: [], total: 0 };
  }

  const seriesDims: BisSdmxDimension[] = struct.dimensions?.series ?? [];
  const obsDims: BisSdmxDimension[] = struct.dimensions?.observation ?? [];
  const timeDim = obsDims.find((d) => d.id === 'TIME_PERIOD');

  const rawSeries = dataSets[0].series ?? {};
  const allSeries: BisSeries[] = [];

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

    // Decode observations
    const obs: BisObservation[] = [];
    for (const [timeIdx, obsValue] of Object.entries(seriesEntry.observations)) {
      const raw0 = obsValue[0];
      if (raw0 == null) continue;
      const period = timeDim?.values[Number(timeIdx)]?.id ?? timeIdx;
      const num = typeof raw0 === 'number' ? raw0 : Number(raw0);
      if (Number.isNaN(num)) continue;
      obs.push({ period, value: num });
    }

    if (obs.length === 0) continue;

    obs.sort((a, b) => a.period.localeCompare(b.period));
    allSeries.push({ dimensions: dims, observations: obs });
  }

  const total = allSeries.length;
  return { series: allSeries.slice(0, maxSeries), total };
}

// ─── Adapter ─────────────────────────────────────────────────────────────

/**
 * Bank for International Settlements (BIS) Statistics SDMX REST adapter (UC-682).
 *
 * Provides 3 tools backed by the BIS public SDMX v2 API at stats.bis.org.
 * No authentication required. Unlimited public access.
 *
 * Tools:
 *   bis-stats.policy_rates      → Central bank policy rates (WS_CBPOL)
 *   bis-stats.exchange_rates    → Nominal/real effective exchange rates (WS_EER)
 *   bis-stats.property_prices   → Selected residential property prices (WS_SPP)
 */
export class BisStatsAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'bis-stats', baseUrl: API_BASE, maxResponseBytes: 2_000_000 });
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
        message: `Unsupported BIS Statistics tool: ${req.toolId}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    const params = req.params as Record<string, unknown>;
    const country = String(params.country ?? 'US').toUpperCase();

    const qp = new URLSearchParams();
    if (params.start_period) qp.set('startPeriod', String(params.start_period));
    if (params.end_period) qp.set('endPeriod', String(params.end_period));
    if (!params.start_period && !params.end_period) qp.set('lastNObservations', '24');

    let key: string;
    if (req.toolId === 'bis-stats.exchange_rates') {
      const eerType = String(params.eer_type ?? 'N').toUpperCase(); // N=Nominal, R=Real
      const basket = String(params.basket ?? 'N').toUpperCase(); // N=Narrow, B=Broad
      key = `M.${eerType}.${basket}.${country}`;
    } else if (req.toolId === 'bis-stats.property_prices') {
      const valueType = String(params.value_type ?? 'N').toUpperCase(); // N=Nominal, R=Real
      key = `Q.${country}.${valueType}.`; // wildcard UNIT_MEASURE — small result set
    } else {
      // policy_rates: FREQ.REF_AREA
      key = `M.${country}`;
    }

    const url = `${API_BASE}/${dataflow}/${key}?${qp.toString()}`;

    return {
      url,
      method: 'GET',
      headers: { Accept: 'application/vnd.sdmx.data+json;version=1.0.0' },
    };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const params = req.params as Record<string, unknown>;
    const body = raw.body as BisSdmxResponse;
    const country = String(params.country ?? 'US').toUpperCase();
    const maxSeries = Math.min(Number(params.max_series) || 20, 100);

    if (body.errors?.length) {
      const err = body.errors[0];
      if (err.code === 404) {
        // No data for this key — return an empty result rather than erroring,
        // matching the OECD adapter's convention for a valid-but-empty query.
        const output: BisToolOutput = {
          dataset: DATASET_NAMES[req.toolId] ?? req.toolId,
          country,
          start_period: String(params.start_period ?? ''),
          end_period: String(params.end_period ?? ''),
          series: [],
          total_series: 0,
          returned_series: 0,
        };
        return output;
      }
    }

    const { series, total } = parseSdmxSeries(body, maxSeries);

    const output: BisToolOutput = {
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
