import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { SnbCubeResponse, SnbTimeseriesEntry } from './types';

/**
 * Swiss National Bank (SNB) data adapter (UC-541).
 *
 * Supported tools (read-only, no auth — Swiss open government data):
 *   swissnbm.fx_rates            → /api/cube/devkum/data/json/en   (CHF FX rates, 54 currencies)
 *   swissnbm.policy_rate         → /api/cube/snbgwdzid/data/json/en (SNB policy rate + SARON)
 *   swissnbm.saron_rates         → /api/cube/zirepo/data/json/en    (SARON compound rates)
 *   swissnbm.monetary_aggregates → /api/cube/snbmonagg/data/json/en (M0-M3 aggregates)
 *
 * Notes:
 * - SNB API returns full historical series; we slice to last N observations.
 * - zirepo is ~2.1 MB raw, so maxResponseBytes is set to 3 MB.
 * - No auth, no API key — open Swiss government data.
 */
export class SwissNbmAdapter extends BaseAdapter {
  private static readonly CUBE_MAP: Record<string, string> = {
    'swissnbm.fx_rates': 'devkum',
    'swissnbm.policy_rate': 'snbgwdzid',
    'swissnbm.saron_rates': 'zirepo',
    'swissnbm.monetary_aggregates': 'snbmonagg',
  };

  constructor() {
    super({
      provider: 'swissnbm',
      baseUrl: 'https://data.snb.ch',
      maxResponseBytes: 3_000_000,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const cubeId = SwissNbmAdapter.CUBE_MAP[req.toolId];
    if (!cubeId) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Unsupported tool: ${req.toolId}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    return {
      url: `${this.baseUrl}/api/cube/${cubeId}/data/json/en`,
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'APIbase/1.0 (https://apibase.pro)',
      },
    };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as SnbCubeResponse;
    const timeseries = body?.timeseries ?? [];
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'swissnbm.fx_rates':
        return this.parseFxRates(timeseries, params);
      case 'swissnbm.policy_rate':
        return this.parsePolicyRate(timeseries, params);
      case 'swissnbm.saron_rates':
        return this.parseSaronRates(timeseries, params);
      case 'swissnbm.monetary_aggregates':
        return this.parseMonetaryAggregates(timeseries, params);
      default:
        throw new Error(`Unsupported tool: ${req.toolId}`);
    }
  }

  private sliceValues(
    ts: SnbTimeseriesEntry,
    limit: number,
  ): Array<{ date: string; value: number | null }> {
    return ts.values.slice(-limit);
  }

  private parseFxRates(timeseries: SnbTimeseriesEntry[], params: Record<string, unknown>): unknown {
    const limit = Math.max(1, Math.min(120, Number(params.limit ?? 24)));
    const period = String(params.period ?? 'monthly_avg');

    const periodFilter = period === 'end_of_month' ? 'End of month' : 'Monthly average';

    const filtered = timeseries.filter((ts) => {
      const headers = Object.fromEntries(ts.header.map((h) => [h.dim, h.dimItem]));
      return headers['Monthly average/End of month'] === periodFilter;
    });

    const rates = filtered.map((ts) => {
      const headers = Object.fromEntries(ts.header.map((h) => [h.dim, h.dimItem]));
      return {
        currency: headers['Currency'] ?? '',
        unit: ts.metadata.unit ?? 'Rates at 11 am. in CHF',
        frequency: ts.metadata.frequency,
        series_key: ts.metadata.key,
        observations: this.sliceValues(ts, limit),
      };
    });

    const allDates = filtered
      .flatMap((ts) => ts.values.slice(-limit).map((v) => v.date))
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort();
    const latest_date = allDates.at(-1) ?? null;

    return {
      period_type: periodFilter,
      limit,
      currency_count: rates.length,
      latest_date,
      rates,
      source: 'Swiss National Bank — data.snb.ch (cube: devkum)',
      license: 'Swiss Open Government Data (OGD)',
    };
  }

  private parsePolicyRate(
    timeseries: SnbTimeseriesEntry[],
    params: Record<string, unknown>,
  ): unknown {
    const limit = Math.max(1, Math.min(365, Number(params.limit ?? 90)));

    const series = timeseries.map((ts) => {
      const headers = Object.fromEntries(ts.header.map((h) => [h.dim, h.dimItem]));
      return {
        label: headers['Overview'] ?? ts.metadata.key,
        unit: ts.metadata.unit ?? 'In percent',
        frequency: ts.metadata.frequency,
        series_key: ts.metadata.key,
        observations: this.sliceValues(ts, limit),
        latest: ts.values.at(-1) ?? null,
      };
    });

    const policyRate = series.find((s) => s.label === 'SNB policy rate');

    return {
      limit,
      policy_rate_current: policyRate?.latest ?? null,
      series,
      source: 'Swiss National Bank — data.snb.ch (cube: snbgwdzid)',
      license: 'Swiss Open Government Data (OGD)',
    };
  }

  private parseSaronRates(
    timeseries: SnbTimeseriesEntry[],
    params: Record<string, unknown>,
  ): unknown {
    const limit = Math.max(1, Math.min(365, Number(params.limit ?? 90)));

    const series = timeseries.map((ts) => {
      const headers = Object.fromEntries(ts.header.map((h) => [h.dim, h.dimItem]));
      return {
        label: headers['Overview'] ?? ts.metadata.key,
        unit: ts.metadata.unit ?? 'In percent',
        frequency: ts.metadata.frequency,
        series_key: ts.metadata.key,
        observations: this.sliceValues(ts, limit),
        latest: ts.values.at(-1) ?? null,
      };
    });

    const overnight = series.find((s) => s.label.includes('Overnight'));

    return {
      limit,
      saron_overnight_latest: overnight?.latest ?? null,
      series,
      source: 'Swiss National Bank — data.snb.ch (cube: zirepo)',
      license: 'Swiss Open Government Data (OGD)',
    };
  }

  private parseMonetaryAggregates(
    timeseries: SnbTimeseriesEntry[],
    params: Record<string, unknown>,
  ): unknown {
    const limit = Math.max(1, Math.min(120, Number(params.limit ?? 24)));
    const level_type = String(params.level_type ?? 'level');
    const levelFilter = level_type === 'change' ? 'Change' : 'Level';

    const filtered = timeseries.filter((ts) => {
      const headers = Object.fromEntries(ts.header.map((h) => [h.dim, h.dimItem]));
      return headers['Level/change'] === levelFilter;
    });

    const aggregates = filtered.map((ts) => {
      const headers = Object.fromEntries(ts.header.map((h) => [h.dim, h.dimItem]));
      return {
        aggregate: headers['Monetary aggregates'] ?? ts.metadata.key,
        unit: ts.metadata.unit ?? 'In CHF millions',
        frequency: ts.metadata.frequency,
        series_key: ts.metadata.key,
        observations: this.sliceValues(ts, limit),
        latest: ts.values.at(-1) ?? null,
      };
    });

    const m3 = aggregates.find((a) => a.aggregate.includes('M3'));
    const m1 = aggregates.find((a) => a.aggregate.includes('M1'));

    return {
      level_type: levelFilter,
      limit,
      m1_latest: m1?.latest ?? null,
      m3_latest: m3?.latest ?? null,
      aggregates,
      source: 'Swiss National Bank — data.snb.ch (cube: snbmonagg)',
      license: 'Swiss Open Government Data (OGD)',
    };
  }
}
