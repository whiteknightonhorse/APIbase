import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { AbsSdmxResponse, AbsObservation, AbsSeriesResult } from './types';

/**
 * Australian Bureau of Statistics (ABS) — SDMX REST API adapter (UC-532).
 *
 * Base URL: https://data.api.abs.gov.au/rest/data
 * Auth: none — CC BY 4.0, commercial use permitted.
 *
 * Tools:
 *   abs.gdp            → ANA_AGG (National Accounts key aggregates)
 *   abs.cpi            → CPI 2.0.0 (Consumer Price Index, All Groups)
 *   abs.labour_force   → LF 1.0.0 (Labour Force Statistics)
 *   abs.population     → ERP_Q 1.0.0 (Estimated Resident Population, quarterly)
 *   abs.trade          → BOP 1.0.0 (Balance of Payments)
 */

const API_BASE = 'https://data.api.abs.gov.au/rest/data';

// ─── ANA_AGG (GDP) code maps ───────────────────────────────────────────────
const GDP_MEASURE: Record<string, string> = {
  chain_volume: 'M1',
  current_prices: 'M3',
  chain_volume_change: 'M2',
  index: 'M5',
};

const GDP_ITEM: Record<string, string> = {
  gdp: 'GPM',
  gdp_per_capita: 'GPM_PCA',
  gdp_per_hour_worked: 'GPM_PHW',
  gva_per_hour_worked: 'GVA_MKT_PHW',
  hours_worked: 'GPM_MKT_HRW',
};

// ─── CPI code maps ─────────────────────────────────────────────────────────
const CPI_MEASURE: Record<string, string> = {
  annual_change: '3', // % change from previous year — monthly only
  index: '1', // index numbers
  period_change: '2', // % change from previous period
};

const CPI_REGION: Record<string, string> = {
  australia: '50',
  sydney: '1',
  melbourne: '2',
  brisbane: '3',
  adelaide: '4',
  perth: '5',
  hobart: '6',
  darwin: '7',
  canberra: '8',
};

// ─── Labour Force code maps ────────────────────────────────────────────────
const LF_MEASURE: Record<string, string> = {
  unemployment_rate: 'M13',
  employed: 'M3',
  participation_rate: 'M12',
  labour_force: 'M9',
  civilian_population: 'M11',
};

const LF_SEX: Record<string, string> = {
  persons: '3',
  males: '1',
  females: '2',
};

const LF_REGION: Record<string, string> = {
  australia: 'AUS',
  nsw: '1',
  vic: '2',
  qld: '3',
  sa: '4',
  wa: '5',
  tas: '6',
  nt: '7',
  act: '8',
};

// ─── ERP_Q (Population) code maps ─────────────────────────────────────────
const POP_MEASURE: Record<string, string> = {
  estimated_resident_population: '1',
  annual_change: '2',
  annual_pct_change: '3',
};

const POP_SEX: Record<string, string> = {
  persons: '3',
  males: '1',
  females: '2',
};

const POP_REGION: Record<string, string> = {
  australia: 'AUS',
  nsw: '1',
  vic: '2',
  qld: '3',
  sa: '4',
  wa: '5',
  tas: '6',
  nt: '7',
  act: '8',
};

// ─── TSEST (seasonal adjustment) code map ─────────────────────────────────
const TSEST: Record<string, string> = {
  seasonally_adjusted: '20',
  trend: '30',
  original: '10',
};

// ─── BOP code maps ─────────────────────────────────────────────────────────
const BOP_MEASURE: Record<string, string> = {
  current_prices: '1',
  chain_volume: '2',
  implicit_price_index: '3',
  terms_of_trade: '4',
};

const BOP_ITEM: Record<string, string> = {
  current_account: '100',
  goods_services_credits: '110',
  goods_services_debits: '120',
  goods_credits: '1000',
  goods_debits: '2050',
  primary_income_credits: '8710',
};

// Dataset labels
const DATASET_NAMES: Record<string, string> = {
  ANA_AGG: 'Australian National Accounts Key Aggregates',
  CPI: 'Consumer Price Index (CPI)',
  LF: 'Labour Force',
  ERP_Q: 'Estimated Resident Population (Quarterly)',
  BOP: 'Balance of Payments',
};

export class AbsAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'abs',
      baseUrl: API_BASE,
      maxResponseBytes: 5_000_000,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'abs.gdp':
        return { url: this.buildGdpUrl(p), method: 'GET', headers };
      case 'abs.cpi':
        return { url: this.buildCpiUrl(p), method: 'GET', headers };
      case 'abs.labour_force':
        return { url: this.buildLfUrl(p), method: 'GET', headers };
      case 'abs.population':
        return { url: this.buildPopUrl(p), method: 'GET', headers };
      case 'abs.trade':
        return { url: this.buildTradeUrl(p), method: 'GET', headers };
      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported tool: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as AbsSdmxResponse;
    switch (req.toolId) {
      case 'abs.gdp':
        return this.parseSdmx(body, 'ANA_AGG');
      case 'abs.cpi':
        return this.parseSdmx(body, 'CPI');
      case 'abs.labour_force':
        return this.parseSdmx(body, 'LF');
      case 'abs.population':
        return this.parseSdmx(body, 'ERP_Q');
      case 'abs.trade':
        return this.parseSdmx(body, 'BOP');
      default:
        return raw.body;
    }
  }

  // ─── URL builders ──────────────────────────────────────────────────────

  private buildGdpUrl(p: Record<string, unknown>): string {
    const lastN = Math.max(1, Math.min(40, Number(p.last_n ?? 8)));
    const measures = this.resolveMulti(p.measure as string | undefined, GDP_MEASURE, [
      'chain_volume',
      'current_prices',
    ]);
    const items = this.resolveMulti(p.item as string | undefined, GDP_ITEM, ['gdp']);
    const adj = TSEST[p.adjustment as string] ?? '20';
    const key = `${measures}.${items}.${adj}.AUS.Q`;
    return `${API_BASE}/ABS,ANA_AGG,1.0.0/${encodeURIComponent(key)}?format=jsondata&dimensionAtObservation=AllDimensions&detail=dataonly&lastNObservations=${lastN}`;
  }

  private buildCpiUrl(p: Record<string, unknown>): string {
    const lastN = Math.max(1, Math.min(60, Number(p.last_n ?? 12)));
    const measure = CPI_MEASURE[p.measure as string] ?? '3';
    const region = CPI_REGION[p.region as string] ?? '50';
    // annual_change (measure=3) is monthly only; index and period_change support Q too
    const freq = measure === '3' ? 'M' : p.frequency === 'quarterly' ? 'Q' : 'M';
    const key = `${measure}.10001.10.${region}.${freq}`;
    return `${API_BASE}/ABS,CPI,2.0.0/${encodeURIComponent(key)}?format=jsondata&dimensionAtObservation=AllDimensions&detail=dataonly&lastNObservations=${lastN}`;
  }

  private buildLfUrl(p: Record<string, unknown>): string {
    const lastN = Math.max(1, Math.min(60, Number(p.last_n ?? 12)));
    const measures = this.resolveMulti(p.measure as string | undefined, LF_MEASURE, [
      'unemployment_rate',
      'employed',
      'participation_rate',
    ]);
    const sex = LF_SEX[p.sex as string] ?? '3';
    const region = LF_REGION[p.region as string] ?? 'AUS';
    const adj = TSEST[p.adjustment as string] ?? '20';
    // LF is always monthly (M); age 1599 = Total
    const key = `${measures}.${sex}.1599.${adj}.${region}.M`;
    return `${API_BASE}/ABS,LF,1.0.0/${encodeURIComponent(key)}?format=jsondata&dimensionAtObservation=AllDimensions&detail=dataonly&lastNObservations=${lastN}`;
  }

  private buildPopUrl(p: Record<string, unknown>): string {
    const lastN = Math.max(1, Math.min(40, Number(p.last_n ?? 8)));
    const measure = POP_MEASURE[p.measure as string] ?? '1';
    const sex = POP_SEX[p.sex as string] ?? '3';
    const region = POP_REGION[p.region as string] ?? 'AUS';
    // TOT = all ages combined
    const key = `${measure}.${sex}.TOT.${region}.Q`;
    return `${API_BASE}/ABS,ERP_Q,1.0.0/${encodeURIComponent(key)}?format=jsondata&dimensionAtObservation=AllDimensions&detail=dataonly&lastNObservations=${lastN}`;
  }

  private buildTradeUrl(p: Record<string, unknown>): string {
    const lastN = Math.max(1, Math.min(40, Number(p.last_n ?? 8)));
    const measure = BOP_MEASURE[p.measure as string] ?? '1';
    const adj = TSEST[p.adjustment as string] ?? '20';
    const itemsParam = p.items as string | string[] | undefined;
    let itemStr: string;
    if (Array.isArray(itemsParam) && itemsParam.length > 0) {
      itemStr = itemsParam
        .map((x) => BOP_ITEM[x] ?? x)
        .filter(Boolean)
        .join('+');
    } else if (typeof itemsParam === 'string' && itemsParam in BOP_ITEM) {
      itemStr = BOP_ITEM[itemsParam];
    } else {
      itemStr = '100+110+120';
    }
    const key = `${measure}.${itemStr}.${adj}.Q`;
    return `${API_BASE}/ABS,BOP,1.0.0/${encodeURIComponent(key)}?format=jsondata&dimensionAtObservation=AllDimensions&detail=dataonly&lastNObservations=${lastN}`;
  }

  // ─── SDMX parser ───────────────────────────────────────────────────────

  private parseSdmx(body: AbsSdmxResponse, datasetId: string): AbsSeriesResult {
    const struct = body?.data?.structures?.[0];
    const dataSet = body?.data?.dataSets?.[0];

    if (!struct || !dataSet) {
      return {
        dataset: datasetId,
        dataset_name: DATASET_NAMES[datasetId] ?? datasetId,
        observations: [],
        count: 0,
      };
    }

    const dims = struct.dimensions.observation;
    const dimIndex = Object.fromEntries(dims.map((d, i) => [d.id, i]));
    const timeDimIdx = dimIndex['TIME_PERIOD'];

    const observations: AbsObservation[] = [];

    for (const [key, valArr] of Object.entries(dataSet.observations)) {
      const value = valArr?.[0];
      if (value == null) continue;

      const idxs = key.split(':').map(Number);
      const period = dims[timeDimIdx]?.values[idxs[timeDimIdx]]?.id ?? key;

      // Build labelled dimensions (exclude TIME_PERIOD from labels)
      const labelledDims: Record<string, string> = {};
      for (const dim of dims) {
        if (dim.id === 'TIME_PERIOD') continue;
        const dimPos = dimIndex[dim.id];
        const val = dim.values[idxs[dimPos]];
        if (val) labelledDims[dim.id] = val.name;
      }

      observations.push({ period, value, dimensions: labelledDims });
    }

    // Sort by period ascending, then by dimension combo
    observations.sort((a, b) => {
      const pCmp = a.period.localeCompare(b.period);
      if (pCmp !== 0) return pCmp;
      const aKey = JSON.stringify(a.dimensions);
      const bKey = JSON.stringify(b.dimensions);
      return aKey.localeCompare(bKey);
    });

    return {
      dataset: datasetId,
      dataset_name: DATASET_NAMES[datasetId] ?? datasetId,
      observations,
      count: observations.length,
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  /** Resolve one or multiple param values to their SDMX codes joined by '+' */
  private resolveMulti(
    param: string | undefined,
    codeMap: Record<string, string>,
    defaults: string[],
  ): string {
    if (!param) {
      return defaults.map((k) => codeMap[k] ?? k).join('+');
    }
    // Handle comma-separated input
    const parts = param.split(',').map((s) => s.trim());
    return parts.map((k) => codeMap[k] ?? k).join('+');
  }
}
