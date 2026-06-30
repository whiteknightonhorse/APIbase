import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  FbiSummarizedRaw,
  FbiMonthlyDataPoint,
  FbiStateMonthlyDataPoint,
  FbiNationalOffensesOutput,
  FbiStateOffensesOutput,
  FbiAnnualDataPoint,
  FbiNationalAnnualOutput,
  FbiStateAnnualOutput,
  MonthlyMap,
} from './types';

const FBI_BASE = 'https://api.usa.gov/crime/fbi/cde';

/**
 * FBI Crime Data Explorer (UCR) adapter (UC-540).
 *
 * National and state-level Uniform Crime Reporting statistics.
 * Offense counts, rates per 100k, clearance rates. Monthly granularity 1979-present.
 *
 * Auth: api.data.gov shared key (PROVIDER_KEY_API_DATA_GOV). US Gov public domain.
 * Rate limit: 1,000/hr burst at 10/s.
 */
export class FbiCdeAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ provider: 'fbi', baseUrl: FBI_BASE });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const p = req.params as Record<string, unknown>;

    const offense = String(p.offense_type ?? 'violent-crime');
    const from = p.from_month ? String(p.from_month) : `01-${String(p.from_year ?? 2020)}`;
    const to = p.to_month
      ? String(p.to_month)
      : `12-${String(p.to_year ?? new Date().getFullYear() - 1)}`;

    const qp = new URLSearchParams({ api_key: this.apiKey });

    switch (req.toolId) {
      case 'fbi.national_offenses':
        qp.set('from', from);
        qp.set('to', to);
        return {
          url: `${FBI_BASE}/summarized/national/${encodeURIComponent(offense)}?${qp}`,
          method: 'GET',
          headers: { Accept: 'application/json' },
        };

      case 'fbi.state_offenses':
        qp.set('from', from);
        qp.set('to', to);
        return {
          url: `${FBI_BASE}/summarized/state/${encodeURIComponent(String(p.state ?? 'CA'))}/${encodeURIComponent(offense)}?${qp}`,
          method: 'GET',
          headers: { Accept: 'application/json' },
        };

      case 'fbi.national_annual':
        qp.set('from', `01-${String(p.from_year ?? 2015)}`);
        qp.set('to', `12-${String(p.to_year ?? new Date().getFullYear() - 1)}`);
        return {
          url: `${FBI_BASE}/summarized/national/${encodeURIComponent(offense)}?${qp}`,
          method: 'GET',
          headers: { Accept: 'application/json' },
        };

      case 'fbi.state_annual':
        qp.set('from', `01-${String(p.from_year ?? 2015)}`);
        qp.set('to', `12-${String(p.to_year ?? new Date().getFullYear() - 1)}`);
        return {
          url: `${FBI_BASE}/summarized/state/${encodeURIComponent(String(p.state ?? 'CA'))}/${encodeURIComponent(offense)}?${qp}`,
          method: 'GET',
          headers: { Accept: 'application/json' },
        };

      default:
        throw new Error(`Unknown toolId: ${req.toolId}`);
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    if (!raw.body || typeof raw.body !== 'object') {
      throw Object.assign(new Error('Invalid response from FBI CDE API'), {
        providerErrorCode: ProviderErrorCode.INVALID_RESPONSE,
      });
    }

    const data = raw.body as FbiSummarizedRaw;

    if (!data.offenses || !data.offenses.actuals) {
      throw Object.assign(new Error('Unexpected FBI CDE response structure'), {
        providerErrorCode: ProviderErrorCode.INVALID_RESPONSE,
      });
    }

    const maxDate = data.cde_properties?.max_data_date?.UCR ?? '';
    const lastRefresh = data.cde_properties?.last_refresh_date?.UCR ?? '';

    switch (req.toolId) {
      case 'fbi.national_offenses':
        return this.parseNationalOffenses(data, req, maxDate, lastRefresh);
      case 'fbi.state_offenses':
        return this.parseStateOffenses(data, req, maxDate, lastRefresh);
      case 'fbi.national_annual':
        return this.parseNationalAnnual(data, req);
      case 'fbi.state_annual':
        return this.parseStateAnnual(data, req);
      default:
        return data;
    }
  }

  // -------------------------------------------------------------------------
  // Parse helpers
  // -------------------------------------------------------------------------

  private parseNationalOffenses(
    data: FbiSummarizedRaw,
    req: ProviderRequest,
    maxDate: string,
    lastRefresh: string,
  ): FbiNationalOffensesOutput {
    const p = req.params as Record<string, unknown>;
    const offenseType = String(p.offense_type ?? 'violent-crime');

    const offenseKey =
      Object.keys(data.offenses.actuals).find((k) => k.toLowerCase().includes('offense')) ??
      Object.keys(data.offenses.actuals)[0];

    const clearanceKey =
      Object.keys(data.offenses.actuals).find((k) => k.toLowerCase().includes('clearance')) ?? '';

    const rateKey =
      Object.keys(data.offenses.rates ?? {}).find((k) => k.toLowerCase().includes('offense')) ?? '';

    const actualsMap: MonthlyMap = data.offenses.actuals[offenseKey] ?? {};
    const clearancesMap: MonthlyMap = clearanceKey
      ? (data.offenses.actuals[clearanceKey] ?? {})
      : {};
    const ratesMap: MonthlyMap = rateKey ? (data.offenses.rates[rateKey] ?? {}) : {};

    const months = Object.keys(actualsMap).sort(
      (a, b) => this.monthKeyToDate(a) - this.monthKeyToDate(b),
    );

    const monthly_data: FbiMonthlyDataPoint[] = months.map((m) => {
      const off = actualsMap[m] ?? 0;
      const clr = clearancesMap[m] ?? 0;
      return {
        month: this.monthKeyToIso(m),
        offenses: off,
        rate_per_100k: ratesMap[m] ?? 0,
        clearances: clr,
        clearance_rate_pct: off > 0 ? Math.round((clr / off) * 1000) / 10 : null,
      };
    });

    const totalOffenses = monthly_data.reduce((s, d) => s + d.offenses, 0);
    const totalClearances = monthly_data.reduce((s, d) => s + d.clearances, 0);
    const avgRate =
      monthly_data.length > 0
        ? Math.round(
            (monthly_data.reduce((s, d) => s + d.rate_per_100k, 0) / monthly_data.length) * 100,
          ) / 100
        : 0;

    return {
      offense_type: offenseType,
      from: p.from_month ? String(p.from_month) : `01-${String(p.from_year ?? 2020)}`,
      to: p.to_month ? String(p.to_month) : `12-${String(p.to_year ?? 2024)}`,
      monthly_data,
      total_offenses: totalOffenses,
      total_clearances: totalClearances,
      avg_rate_per_100k: avgRate,
      max_data_date: maxDate,
      last_refresh: lastRefresh,
    };
  }

  private parseStateOffenses(
    data: FbiSummarizedRaw,
    req: ProviderRequest,
    maxDate: string,
    lastRefresh: string,
  ): FbiStateOffensesOutput {
    const p = req.params as Record<string, unknown>;
    const offenseType = String(p.offense_type ?? 'violent-crime');
    const stateCode = String(p.state ?? 'CA').toUpperCase();

    const allActualKeys = Object.keys(data.offenses.actuals);
    const allRateKeys = Object.keys(data.offenses.rates ?? {});

    // State keys contain the state name, national keys contain "United States"
    const stateOffenseKey =
      allActualKeys.find(
        (k) => !k.toLowerCase().includes('united states') && k.toLowerCase().includes('offense'),
      ) ?? allActualKeys[0];

    const stateClearanceKey =
      allActualKeys.find(
        (k) => !k.toLowerCase().includes('united states') && k.toLowerCase().includes('clearance'),
      ) ?? '';

    const stateRateKey =
      allRateKeys.find(
        (k) => !k.toLowerCase().includes('united states') && k.toLowerCase().includes('offense'),
      ) ?? '';

    const natOffenseKey =
      allActualKeys.find(
        (k) => k.toLowerCase().includes('united states') && k.toLowerCase().includes('offense'),
      ) ?? '';

    const natClearanceKey =
      allActualKeys.find(
        (k) => k.toLowerCase().includes('united states') && k.toLowerCase().includes('clearance'),
      ) ?? '';

    const natRateKey =
      allRateKeys.find(
        (k) => k.toLowerCase().includes('united states') && k.toLowerCase().includes('offense'),
      ) ?? '';

    const stateActuals: MonthlyMap = data.offenses.actuals[stateOffenseKey] ?? {};
    const stateClearances: MonthlyMap = stateClearanceKey
      ? (data.offenses.actuals[stateClearanceKey] ?? {})
      : {};
    const stateRates: MonthlyMap = stateRateKey ? (data.offenses.rates[stateRateKey] ?? {}) : {};

    const natActuals: MonthlyMap = natOffenseKey
      ? (data.offenses.actuals[natOffenseKey] ?? {})
      : {};
    const natClearances: MonthlyMap = natClearanceKey
      ? (data.offenses.actuals[natClearanceKey] ?? {})
      : {};
    const natRates: MonthlyMap = natRateKey ? (data.offenses.rates[natRateKey] ?? {}) : {};

    const stateName = stateOffenseKey.replace(/\s*Offenses\s*$/i, '').trim();
    const months = Object.keys(stateActuals).sort(
      (a, b) => this.monthKeyToDate(a) - this.monthKeyToDate(b),
    );

    const state_data: FbiStateMonthlyDataPoint[] = months.map((m) => {
      const off = stateActuals[m] ?? 0;
      const clr = stateClearances[m] ?? 0;
      return {
        month: this.monthKeyToIso(m),
        state_name: stateName,
        offenses: off,
        rate_per_100k: stateRates[m] ?? 0,
        clearances: clr,
        clearance_rate_pct: off > 0 ? Math.round((clr / off) * 1000) / 10 : null,
      };
    });

    const natMonths = Object.keys(natActuals).sort(
      (a, b) => this.monthKeyToDate(a) - this.monthKeyToDate(b),
    );

    const national_data: FbiMonthlyDataPoint[] = natMonths.map((m) => {
      const off = natActuals[m] ?? 0;
      const clr = natClearances[m] ?? 0;
      return {
        month: this.monthKeyToIso(m),
        offenses: off,
        rate_per_100k: natRates[m] ?? 0,
        clearances: clr,
        clearance_rate_pct: off > 0 ? Math.round((clr / off) * 1000) / 10 : null,
      };
    });

    return {
      state: stateCode,
      offense_type: offenseType,
      from: p.from_month ? String(p.from_month) : `01-${String(p.from_year ?? 2020)}`,
      to: p.to_month ? String(p.to_month) : `12-${String(p.to_year ?? 2024)}`,
      state_data,
      national_data,
      max_data_date: maxDate,
      last_refresh: lastRefresh,
    };
  }

  private parseNationalAnnual(
    data: FbiSummarizedRaw,
    req: ProviderRequest,
  ): FbiNationalAnnualOutput {
    const p = req.params as Record<string, unknown>;
    const offenseType = String(p.offense_type ?? 'violent-crime');

    const offenseKey =
      Object.keys(data.offenses.actuals).find((k) => k.toLowerCase().includes('offense')) ??
      Object.keys(data.offenses.actuals)[0];

    const clearanceKey =
      Object.keys(data.offenses.actuals).find((k) => k.toLowerCase().includes('clearance')) ?? '';

    const rateKey =
      Object.keys(data.offenses.rates ?? {}).find((k) => k.toLowerCase().includes('offense')) ?? '';

    const actualsMap: MonthlyMap = data.offenses.actuals[offenseKey] ?? {};
    const clearancesMap: MonthlyMap = clearanceKey
      ? (data.offenses.actuals[clearanceKey] ?? {})
      : {};
    const ratesMap: MonthlyMap = rateKey ? (data.offenses.rates[rateKey] ?? {}) : {};

    const yearMap = new Map<
      number,
      { offenses: number; clearances: number; rates: number[]; count: number }
    >();

    for (const [monthKey, val] of Object.entries(actualsMap)) {
      const year = this.monthKeyYear(monthKey);
      if (!yearMap.has(year))
        yearMap.set(year, { offenses: 0, clearances: 0, rates: [], count: 0 });
      const entry = yearMap.get(year) ?? { offenses: 0, clearances: 0, rates: [], count: 0 };
      entry.offenses += val;
      entry.clearances += clearancesMap[monthKey] ?? 0;
      if (ratesMap[monthKey] != null) entry.rates.push(ratesMap[monthKey]);
      entry.count++;
      yearMap.set(year, entry);
    }

    const annual_data: FbiAnnualDataPoint[] = Array.from(yearMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([year, e]) => ({
        year,
        total_offenses: e.offenses,
        avg_rate_per_100k:
          e.rates.length > 0
            ? Math.round((e.rates.reduce((s, r) => s + r, 0) / e.rates.length) * 100) / 100
            : 0,
        total_clearances: e.clearances,
        clearance_rate_pct:
          e.offenses > 0 ? Math.round((e.clearances / e.offenses) * 1000) / 10 : null,
      }));

    const overallOffenses = annual_data.reduce((s, d) => s + d.total_offenses, 0);
    const overallClearances = annual_data.reduce((s, d) => s + d.total_clearances, 0);

    return {
      offense_type: offenseType,
      from_year: Number(p.from_year ?? 2015),
      to_year: Number(p.to_year ?? new Date().getFullYear() - 1),
      annual_data,
      overall_total_offenses: overallOffenses,
      overall_clearance_rate_pct:
        overallOffenses > 0 ? Math.round((overallClearances / overallOffenses) * 1000) / 10 : null,
    };
  }

  private parseStateAnnual(data: FbiSummarizedRaw, req: ProviderRequest): FbiStateAnnualOutput {
    const p = req.params as Record<string, unknown>;
    const offenseType = String(p.offense_type ?? 'violent-crime');
    const stateCode = String(p.state ?? 'CA').toUpperCase();

    const allActualKeys = Object.keys(data.offenses.actuals);
    const allRateKeys = Object.keys(data.offenses.rates ?? {});

    const stateOffenseKey =
      allActualKeys.find(
        (k) => !k.toLowerCase().includes('united states') && k.toLowerCase().includes('offense'),
      ) ?? allActualKeys[0];
    const stateClearanceKey =
      allActualKeys.find(
        (k) => !k.toLowerCase().includes('united states') && k.toLowerCase().includes('clearance'),
      ) ?? '';
    const stateRateKey =
      allRateKeys.find(
        (k) => !k.toLowerCase().includes('united states') && k.toLowerCase().includes('offense'),
      ) ?? '';
    const natOffenseKey =
      allActualKeys.find(
        (k) => k.toLowerCase().includes('united states') && k.toLowerCase().includes('offense'),
      ) ?? '';
    const natClearanceKey =
      allActualKeys.find(
        (k) => k.toLowerCase().includes('united states') && k.toLowerCase().includes('clearance'),
      ) ?? '';
    const natRateKey =
      allRateKeys.find(
        (k) => k.toLowerCase().includes('united states') && k.toLowerCase().includes('offense'),
      ) ?? '';

    const stateAnnual = this.aggregateAnnual(
      data.offenses.actuals[stateOffenseKey] ?? {},
      stateClearanceKey ? (data.offenses.actuals[stateClearanceKey] ?? {}) : {},
      stateRateKey ? (data.offenses.rates[stateRateKey] ?? {}) : {},
    );

    const natAnnual = this.aggregateAnnual(
      natOffenseKey ? (data.offenses.actuals[natOffenseKey] ?? {}) : {},
      natClearanceKey ? (data.offenses.actuals[natClearanceKey] ?? {}) : {},
      natRateKey ? (data.offenses.rates[natRateKey] ?? {}) : {},
    );

    return {
      state: stateCode,
      offense_type: offenseType,
      from_year: Number(p.from_year ?? 2015),
      to_year: Number(p.to_year ?? new Date().getFullYear() - 1),
      state_annual_data: stateAnnual,
      national_annual_data: natAnnual,
    };
  }

  private aggregateAnnual(
    actuals: MonthlyMap,
    clearances: MonthlyMap,
    rates: MonthlyMap,
  ): FbiAnnualDataPoint[] {
    const yearMap = new Map<number, { offenses: number; clearances: number; rates: number[] }>();
    for (const [mk, val] of Object.entries(actuals)) {
      const year = this.monthKeyYear(mk);
      if (!yearMap.has(year)) yearMap.set(year, { offenses: 0, clearances: 0, rates: [] });
      const e = yearMap.get(year) ?? { offenses: 0, clearances: 0, rates: [] };
      e.offenses += val;
      e.clearances += clearances[mk] ?? 0;
      if (rates[mk] != null) e.rates.push(rates[mk]);
      yearMap.set(year, e);
    }
    return Array.from(yearMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([year, e]) => ({
        year,
        total_offenses: e.offenses,
        avg_rate_per_100k:
          e.rates.length > 0
            ? Math.round((e.rates.reduce((s, r) => s + r, 0) / e.rates.length) * 100) / 100
            : 0,
        total_clearances: e.clearances,
        clearance_rate_pct:
          e.offenses > 0 ? Math.round((e.clearances / e.offenses) * 1000) / 10 : null,
      }));
  }

  /** Convert "MM-YYYY" to sortable timestamp */
  private monthKeyToDate(key: string): number {
    const [mm, yyyy] = key.split('-');
    return parseInt(yyyy, 10) * 100 + parseInt(mm, 10);
  }

  /** Convert "MM-YYYY" to "YYYY-MM" ISO month string */
  private monthKeyToIso(key: string): string {
    const [mm, yyyy] = key.split('-');
    return `${yyyy}-${mm.padStart(2, '0')}`;
  }

  /** Extract year from "MM-YYYY" key */
  private monthKeyYear(key: string): number {
    return parseInt(key.split('-')[1], 10);
  }
}
