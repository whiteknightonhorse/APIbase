import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { ValetObservationsResponse, ValetObservation, ValetSeriesDetail } from './types';

/**
 * Bank of Canada Valet API adapter (UC-503).
 *
 * Supported tools:
 *   bankofcanada.fx_rates      → GET /observations/{fx_series}/json  (CAD FX rates)
 *   bankofcanada.policy_rate   → GET /observations/V39079,V80691311/json  (overnight + prime)
 *   bankofcanada.inflation     → GET /observations/{cpi_series}/json  (CPI measures)
 *   bankofcanada.series        → GET /observations/{series_codes}/json  (general lookup)
 *
 * Auth: none. Bank of Canada open data — attribution required.
 * Docs: https://www.bankofcanada.ca/valet/docs
 */
export class BankOfCanadaAdapter extends BaseAdapter {
  private static readonly VALET_BASE = 'https://www.bankofcanada.ca/valet';

  private static readonly FX_SERIES = [
    'FXCADUSD',
    'FXCADEUR',
    'FXCADGBP',
    'FXCADJPY',
    'FXCADAUD',
    'FXCADCHF',
    'FXCADMXN',
    'FXCADSEK',
    'FXCADNOK',
    'FXCADHKD',
  ];

  private static readonly POLICY_SERIES = 'V39079,V80691311';

  private static readonly INFLATION_SERIES =
    'STATIC_TOTALCPICHANGE,STATIC_CORECPICHANGE,CPIW,CPI_MEDIAN';

  constructor() {
    super({
      provider: 'bankofcanada',
      baseUrl: BankOfCanadaAdapter.VALET_BASE,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'bankofcanada.fx_rates':
        return this.buildFxRatesRequest(params, headers);
      case 'bankofcanada.policy_rate':
        return this.buildPolicyRateRequest(params, headers);
      case 'bankofcanada.inflation':
        return this.buildInflationRequest(params, headers);
      case 'bankofcanada.series':
        return this.buildSeriesRequest(params, headers);
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
    const body = raw.body as ValetObservationsResponse;

    if (!body || !Array.isArray(body.observations)) {
      throw new Error('Missing observations array in Valet API response');
    }

    const observations = body.observations;
    const seriesDetail: Record<string, ValetSeriesDetail> = body.seriesDetail ?? {};

    switch (req.toolId) {
      case 'bankofcanada.fx_rates':
        return this.parseFxRates(observations, seriesDetail);
      case 'bankofcanada.policy_rate':
        return this.parsePolicyRate(observations, seriesDetail);
      case 'bankofcanada.inflation':
        return this.parseInflation(observations, seriesDetail);
      case 'bankofcanada.series':
        return this.parseGenericSeries(observations, seriesDetail);
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildFxRatesRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const currencies = params.currencies as string[] | undefined;
    let seriesCodes: string;

    if (currencies && currencies.length > 0) {
      seriesCodes = currencies
        .map((c) => `FXCAD${encodeURIComponent(String(c).toUpperCase())}`)
        .join(',');
    } else {
      seriesCodes = BankOfCanadaAdapter.FX_SERIES.join(',');
    }

    const qs = this.buildDateParams(params);
    return {
      url: `${BankOfCanadaAdapter.VALET_BASE}/observations/${seriesCodes}/json?${qs}`,
      method: 'GET',
      headers,
    };
  }

  private buildPolicyRateRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = this.buildDateParams(params, 10);
    return {
      url: `${BankOfCanadaAdapter.VALET_BASE}/observations/${BankOfCanadaAdapter.POLICY_SERIES}/json?${qs}`,
      method: 'GET',
      headers,
    };
  }

  private buildInflationRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = this.buildDateParams(params, 12);
    return {
      url: `${BankOfCanadaAdapter.VALET_BASE}/observations/${BankOfCanadaAdapter.INFLATION_SERIES}/json?${qs}`,
      method: 'GET',
      headers,
    };
  }

  private buildSeriesRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const raw = String(params.series_codes ?? '').trim();
    if (!raw) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: 'series_codes is required',
        provider: this.provider,
        toolId: 'bankofcanada.series',
        durationMs: 0,
      };
    }
    // Allow comma-separated codes; pass through as-is (Valet handles multiple codes natively)
    const codes = raw
      .split(',')
      .map((s) => encodeURIComponent(s.trim()))
      .join(',');
    const qs = this.buildDateParams(params, 10);
    return {
      url: `${BankOfCanadaAdapter.VALET_BASE}/observations/${codes}/json?${qs}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // Response parsers
  // ---------------------------------------------------------------------------

  private parseFxRates(
    observations: ValetObservation[],
    seriesDetail: Record<string, ValetSeriesDetail>,
  ): unknown {
    const latest = observations[observations.length - 1] as ValetObservation | undefined;
    const rates: Record<string, string | null> = {};

    if (latest) {
      for (const [key, val] of Object.entries(latest)) {
        if (key === 'd') continue;
        const entry = val as { v: string };
        const currency = key.replace(/^FXCAD/, '');
        rates[currency] = entry?.v ?? null;
      }
    }

    const history = observations.map((obs) => {
      const row: Record<string, string | null> = { date: obs.d as string };
      for (const [key, val] of Object.entries(obs)) {
        if (key === 'd') continue;
        const entry = val as { v: string };
        const currency = key.replace(/^FXCAD/, '');
        row[currency] = entry?.v ?? null;
      }
      return row;
    });

    const series = Object.fromEntries(
      Object.entries(seriesDetail).map(([k, v]) => [
        k.replace(/^FXCAD/, ''),
        { label: v.label, description: v.description },
      ]),
    );

    return {
      base: 'CAD',
      latest_date: latest?.d ?? null,
      rates,
      series,
      count: observations.length,
      history: observations.length > 1 ? history : undefined,
      attribution: 'Bank of Canada, www.bankofcanada.ca',
    };
  }

  private parsePolicyRate(
    observations: ValetObservation[],
    seriesDetail: Record<string, ValetSeriesDetail>,
  ): unknown {
    const history = observations.map((obs) => {
      const row: Record<string, unknown> = { date: obs.d as string };
      const overnight = (obs['V39079'] as { v: string } | undefined)?.v ?? null;
      const prime = (obs['V80691311'] as { v: string } | undefined)?.v ?? null;
      if (overnight !== null) row['overnight_rate_pct'] = parseFloat(overnight);
      if (prime !== null) row['prime_rate_pct'] = parseFloat(prime);
      return row;
    });

    const latest = history[history.length - 1];
    return {
      latest_date: (observations[observations.length - 1]?.d as string) ?? null,
      overnight_rate_pct: latest?.overnight_rate_pct ?? null,
      prime_rate_pct: latest?.prime_rate_pct ?? null,
      series: {
        V39079: seriesDetail['V39079'] ?? { label: 'Target for the overnight rate' },
        V80691311: seriesDetail['V80691311'] ?? { label: 'Prime rate' },
      },
      count: observations.length,
      history,
      attribution: 'Bank of Canada, www.bankofcanada.ca',
    };
  }

  private parseInflation(
    observations: ValetObservation[],
    seriesDetail: Record<string, ValetSeriesDetail>,
  ): unknown {
    const history = observations.map((obs) => {
      const row: Record<string, unknown> = { date: obs.d as string };
      const total = (obs['STATIC_TOTALCPICHANGE'] as { v: string } | undefined)?.v ?? null;
      const core = (obs['STATIC_CORECPICHANGE'] as { v: string } | undefined)?.v ?? null;
      const cpiw = (obs['CPIW'] as { v: string } | undefined)?.v ?? null;
      const median = (obs['CPI_MEDIAN'] as { v: string } | undefined)?.v ?? null;
      if (total !== null) row['total_cpi_yoy_pct'] = parseFloat(total);
      if (core !== null) row['core_cpi_yoy_pct'] = parseFloat(core);
      if (cpiw !== null) row['cpiw_yoy_pct'] = parseFloat(cpiw);
      if (median !== null) row['cpi_median_yoy_pct'] = parseFloat(median);
      return row;
    });

    const latest = history[history.length - 1];
    return {
      latest_date: (observations[observations.length - 1]?.d as string) ?? null,
      total_cpi_yoy_pct: latest?.total_cpi_yoy_pct ?? null,
      core_cpi_yoy_pct: latest?.core_cpi_yoy_pct ?? null,
      cpiw_yoy_pct: latest?.cpiw_yoy_pct ?? null,
      cpi_median_yoy_pct: latest?.cpi_median_yoy_pct ?? null,
      series: {
        STATIC_TOTALCPICHANGE: seriesDetail['STATIC_TOTALCPICHANGE'] ?? {
          label: 'Total CPI, % change year-over-year',
        },
        STATIC_CORECPICHANGE: seriesDetail['STATIC_CORECPICHANGE'] ?? {
          label: 'Core CPI, % change year-over-year',
        },
        CPIW: seriesDetail['CPIW'] ?? { label: 'CPIW, % change year-over-year' },
        CPI_MEDIAN: seriesDetail['CPI_MEDIAN'] ?? { label: 'CPI-median' },
      },
      count: observations.length,
      history,
      attribution: 'Bank of Canada, www.bankofcanada.ca',
    };
  }

  private parseGenericSeries(
    observations: ValetObservation[],
    seriesDetail: Record<string, ValetSeriesDetail>,
  ): unknown {
    const seriesCodes = Object.keys(seriesDetail);

    const history = observations.map((obs) => {
      const row: Record<string, unknown> = { date: obs.d as string };
      for (const code of seriesCodes) {
        const entry = (obs[code] as { v: string } | undefined)?.v ?? null;
        row[code] = entry !== null ? (isNaN(Number(entry)) ? entry : parseFloat(entry)) : null;
      }
      return row;
    });

    const latest = history[history.length - 1];
    return {
      latest_date: (observations[observations.length - 1]?.d as string) ?? null,
      series_codes: seriesCodes,
      latest,
      series_detail: seriesDetail,
      count: observations.length,
      history: observations.length > 1 ? history : undefined,
      attribution: 'Bank of Canada, www.bankofcanada.ca',
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private buildDateParams(params: Record<string, unknown>, defaultRecent = 1): string {
    const qs = new URLSearchParams();
    if (params.start_date) {
      qs.set('start_date', String(params.start_date));
    }
    if (params.end_date) {
      qs.set('end_date', String(params.end_date));
    }
    if (!params.start_date && !params.end_date) {
      const recent = params.recent ? parseInt(String(params.recent), 10) : defaultRecent;
      qs.set('recent', String(Math.min(Math.max(recent, 1), 1000)));
    }
    return qs.toString();
  }
}
