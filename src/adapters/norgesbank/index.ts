import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  SdmxJsonResponse,
  SdmxDimension,
  NorgesBankFxLatestResult,
  NorgesBankFxHistoryResult,
  NorgesBankRatesResult,
  NorgesBankRatesHistoryResult,
} from './types';

/**
 * Norges Bank adapter (UC-525).
 *
 * Uses the SDMX REST API at https://data.norges-bank.no/api/data
 * No authentication required — open government data.
 *
 *   norgesbank.fx.latest        -> EXR B..NOK.SP (latest rates, 41 currencies)
 *   norgesbank.fx.history       -> EXR B.{CUR}.NOK.SP (historical rates)
 *   norgesbank.rates.current    -> IR (key policy rate, overnight rate, reserve rate)
 *   norgesbank.rates.history    -> IR with date range (historical interest rates)
 */
export class NorgesBankAdapter extends BaseAdapter {
  private static readonly API_BASE = 'https://data.norges-bank.no/api/data';

  private static readonly TENOR_LABELS: Record<string, string> = {
    SD: 'Key policy rate',
    OL: 'Overnight lending rate',
    RR: 'Reserve rate',
  };

  constructor() {
    super({
      provider: 'norgesbank',
      baseUrl: 'https://data.norges-bank.no',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.sdmx.data+json;version=1.0',
    };

    switch (req.toolId) {
      case 'norgesbank.fx.latest':
        return this.buildFxLatest(p, headers);
      case 'norgesbank.fx.history':
        return this.buildFxHistory(p, headers);
      case 'norgesbank.rates.current':
        return this.buildRatesCurrent(headers);
      case 'norgesbank.rates.history':
        return this.buildRatesHistory(p, headers);
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

  private buildFxLatest(
    p: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const currencies = (p.currencies as string | undefined) ?? '';
    const curKey = currencies
      ? currencies
          .split(',')
          .map((c) => encodeURIComponent(c.trim().toUpperCase()))
          .join('+')
      : '';
    const key = `B.${curKey}.NOK.SP`;
    const url = `${NorgesBankAdapter.API_BASE}/EXR/${key}?format=sdmx-json&lastNObservations=1`;
    return { url, method: 'GET', headers };
  }

  private buildFxHistory(
    p: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const currency = encodeURIComponent(((p.currency as string) ?? 'USD').toUpperCase());
    const startDate = (p.start_date as string | undefined) ?? '';
    const endDate = (p.end_date as string | undefined) ?? '';
    let url = `${NorgesBankAdapter.API_BASE}/EXR/B.${currency}.NOK.SP?format=sdmx-json`;
    if (startDate) url += `&startPeriod=${encodeURIComponent(startDate)}`;
    if (endDate) url += `&endPeriod=${encodeURIComponent(endDate)}`;
    return { url, method: 'GET', headers };
  }

  private buildRatesCurrent(headers: Record<string, string>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const url = `${NorgesBankAdapter.API_BASE}/IR?format=sdmx-json&lastNObservations=1`;
    return { url, method: 'GET', headers };
  }

  private buildRatesHistory(
    p: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const rateType = (p.rate_type as string | undefined) ?? '';
    const freq = (p.frequency as string | undefined) ?? 'B';
    const startDate = (p.start_date as string | undefined) ?? '';
    const endDate = (p.end_date as string | undefined) ?? '';

    // Build key filter: FREQ.INSTRUMENT_TYPE.TENOR.UNIT_MEASURE
    // SD=policy rate, OL=overnight, RR=reserve; leave blank to get all
    const tenorKey = rateType ? encodeURIComponent(rateType.toUpperCase()) : '';
    const freqKey = encodeURIComponent(freq.toUpperCase());
    const key = `${freqKey}.KPRA.${tenorKey}.R`;
    let url = `${NorgesBankAdapter.API_BASE}/IR/${key}?format=sdmx-json`;
    if (startDate) url += `&startPeriod=${encodeURIComponent(startDate)}`;
    if (endDate) url += `&endPeriod=${encodeURIComponent(endDate)}`;
    return { url, method: 'GET', headers };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    switch (req.toolId) {
      case 'norgesbank.fx.latest':
        return this.parseFxLatest(raw);
      case 'norgesbank.fx.history':
        return this.parseFxHistory(raw, req);
      case 'norgesbank.rates.current':
        return this.parseRatesCurrent(raw);
      case 'norgesbank.rates.history':
        return this.parseRatesHistory(raw, req);
      default:
        return raw.body;
    }
  }

  private parseSdmx(raw: ProviderRawResponse): SdmxJsonResponse {
    return raw.body as SdmxJsonResponse;
  }

  private resolveDimLabel(dim: SdmxDimension, idx: number): string {
    const val = dim.values[idx];
    if (!val) return String(idx);
    return val.id;
  }

  private resolveDateLabel(obsDim: SdmxDimension, idx: number): string {
    const val = obsDim?.values?.[idx];
    return val?.id ?? String(idx);
  }

  private parseFxLatest(raw: ProviderRawResponse): NorgesBankFxLatestResult {
    const sdmx = this.parseSdmx(raw);
    const struct = sdmx.data.structure;
    const dataSet = sdmx.data.dataSets[0];
    if (!dataSet) {
      return { base: 'NOK', date: '', rates: [] };
    }

    const seriesDims = struct.dimensions?.series ?? [];
    const obsDims = struct.dimensions?.observation ?? [];
    const obsDim = obsDims[0];

    // Find BASE_CUR dimension (index 1)
    const baseCurDim = seriesDims.find((d) => d.id === 'BASE_CUR') ?? seriesDims[1];

    let latestDate = '';
    const rates: NorgesBankFxLatestResult['rates'] = [];

    for (const [key, series] of Object.entries(dataSet.series)) {
      const idxs = key.split(':').map(Number);
      const baseCurIdx = baseCurDim ? idxs[seriesDims.indexOf(baseCurDim)] : idxs[1];
      const currency = baseCurDim
        ? this.resolveDimLabel(baseCurDim, baseCurIdx)
        : String(baseCurIdx);

      const obs = series.observations;
      const obsKeys = Object.keys(obs).sort((a, b) => Number(a) - Number(b));
      if (obsKeys.length === 0) continue;

      const lastObsIdx = obsKeys[obsKeys.length - 1];
      const dateLabel = obsDim ? this.resolveDateLabel(obsDim, Number(lastObsIdx)) : lastObsIdx;
      if (!latestDate || dateLabel > latestDate) latestDate = dateLabel;

      const rateVal = obs[lastObsIdx]?.[0];
      if (rateVal == null) continue;

      rates.push({ currency, rate: rateVal, unit: 'NOK' });
    }

    rates.sort((a, b) => a.currency.localeCompare(b.currency));
    return { base: 'NOK', date: latestDate, rates };
  }

  private parseFxHistory(
    raw: ProviderRawResponse,
    req: ProviderRequest,
  ): NorgesBankFxHistoryResult {
    const p = req.params as Record<string, unknown>;
    const currency = ((p.currency as string) ?? 'USD').toUpperCase();

    const sdmx = this.parseSdmx(raw);
    const struct = sdmx.data.structure;
    const dataSet = sdmx.data.dataSets[0];
    if (!dataSet) {
      return { currency, base: 'NOK', series: [] };
    }

    const obsDims = struct.dimensions?.observation ?? [];
    const obsDim = obsDims[0];

    const seriesKeys = Object.keys(dataSet.series);
    if (seriesKeys.length === 0) {
      return { currency, base: 'NOK', series: [] };
    }

    const series = dataSet.series[seriesKeys[0]];
    const obs = series.observations;
    const points: NorgesBankFxHistoryResult['series'] = [];

    for (const [idxStr, vals] of Object.entries(obs)) {
      const dateLabel = obsDim ? this.resolveDateLabel(obsDim, Number(idxStr)) : idxStr;
      const rate = vals?.[0];
      if (rate != null) {
        points.push({ date: dateLabel, rate });
      }
    }

    points.sort((a, b) => a.date.localeCompare(b.date));
    return { currency, base: 'NOK', series: points };
  }

  private parseRatesCurrent(raw: ProviderRawResponse): NorgesBankRatesResult {
    const sdmx = this.parseSdmx(raw);
    const struct = sdmx.data.structure;
    const dataSet = sdmx.data.dataSets[0];
    if (!dataSet) return { rates: [] };

    const seriesDims = struct.dimensions?.series ?? [];
    const obsDims = struct.dimensions?.observation ?? [];
    const obsDim = obsDims[0];

    const freqDim = seriesDims.find((d) => d.id === 'FREQ');
    const tenorDim = seriesDims.find((d) => d.id === 'TENOR');

    const rates: NorgesBankRatesResult['rates'] = [];

    for (const [key, series] of Object.entries(dataSet.series)) {
      const idxs = key.split(':').map(Number);
      const freqIdx = freqDim ? idxs[seriesDims.indexOf(freqDim)] : idxs[0];
      const tenorIdx = tenorDim ? idxs[seriesDims.indexOf(tenorDim)] : idxs[2];

      const freq = freqDim ? this.resolveDimLabel(freqDim, freqIdx) : 'B';
      const tenor = tenorDim ? this.resolveDimLabel(tenorDim, tenorIdx) : '';

      const obs = series.observations;
      const obsKeys = Object.keys(obs).sort((a, b) => Number(a) - Number(b));
      if (obsKeys.length === 0) continue;

      const lastKey = obsKeys[obsKeys.length - 1];
      const dateLabel = obsDim ? this.resolveDateLabel(obsDim, Number(lastKey)) : lastKey;
      const rate = obs[lastKey]?.[0];
      if (rate == null) continue;

      rates.push({
        type: tenor,
        type_label: NorgesBankAdapter.TENOR_LABELS[tenor] ?? tenor,
        frequency: freq,
        rate,
        date: dateLabel,
      });
    }

    return { rates };
  }

  private parseRatesHistory(
    raw: ProviderRawResponse,
    req: ProviderRequest,
  ): NorgesBankRatesHistoryResult {
    const p = req.params as Record<string, unknown>;
    const rateType = ((p.rate_type as string) ?? 'SD').toUpperCase();
    const freq = ((p.frequency as string) ?? 'B').toUpperCase();

    const sdmx = this.parseSdmx(raw);
    const struct = sdmx.data.structure;
    const dataSet = sdmx.data.dataSets[0];
    if (!dataSet) {
      return {
        type: rateType,
        type_label: NorgesBankAdapter.TENOR_LABELS[rateType] ?? rateType,
        frequency: freq,
        series: [],
      };
    }

    const obsDims = struct.dimensions?.observation ?? [];
    const obsDim = obsDims[0];

    const seriesKeys = Object.keys(dataSet.series);
    if (seriesKeys.length === 0) {
      return {
        type: rateType,
        type_label: NorgesBankAdapter.TENOR_LABELS[rateType] ?? rateType,
        frequency: freq,
        series: [],
      };
    }

    // Merge all series (in case multiple returned)
    const points: NorgesBankRatesHistoryResult['series'] = [];
    for (const seriesKey of seriesKeys) {
      const series = dataSet.series[seriesKey];
      for (const [idxStr, vals] of Object.entries(series.observations)) {
        const dateLabel = obsDim ? this.resolveDateLabel(obsDim, Number(idxStr)) : idxStr;
        const rate = vals?.[0];
        if (rate != null) {
          points.push({ date: dateLabel, rate });
        }
      }
    }

    points.sort((a, b) => a.date.localeCompare(b.date));

    return {
      type: rateType,
      type_label: NorgesBankAdapter.TENOR_LABELS[rateType] ?? rateType,
      frequency: freq,
      series: points,
    };
  }
}
