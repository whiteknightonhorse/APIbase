import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  DelphiFluViewRecord,
  DelphiFluViewOutput,
  DelphiFluSurvRecord,
  DelphiFluSurvOutput,
  DelphiCovidCastRecord,
  DelphiCovidCastOutput,
  DelphiCovidHospRecord,
  DelphiCovidHospOutput,
} from './types';

const DELPHI_BASE = 'https://api.delphi.cmu.edu/epidata';

/**
 * CMU Delphi Epidata adapter (UC-559).
 *
 * Real-time epidemiological surveillance data: CDC ILINet flu, FluSurv-NET
 * hospitalization rates, COVID-19 signals (JHU-CSSE, CDC) and COVID
 * hospitalization state timeseries. No auth. Open access.
 */
export class DelphiAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'delphi', baseUrl: DELPHI_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'delphi.fluview': {
        const qp = new URLSearchParams();
        qp.set('regions', String(params.regions));
        qp.set('epiweeks', String(params.epiweeks));
        if (params.issues) qp.set('issues', String(params.issues));
        return { url: `${DELPHI_BASE}/fluview/?${qp.toString()}`, method: 'GET', headers };
      }

      case 'delphi.flusurv': {
        const qp = new URLSearchParams();
        qp.set('locations', String(params.locations));
        qp.set('epiweeks', String(params.epiweeks));
        return { url: `${DELPHI_BASE}/flusurv/?${qp.toString()}`, method: 'GET', headers };
      }

      case 'delphi.covidcast': {
        const qp = new URLSearchParams();
        qp.set('data_source', String(params.data_source));
        qp.set('signal', String(params.signal));
        qp.set('time_type', String(params.time_type ?? 'day'));
        qp.set('geo_type', String(params.geo_type ?? 'state'));
        qp.set('time_values', String(params.time_values));
        qp.set('geo_value', String(params.geo_value));
        return { url: `${DELPHI_BASE}/covidcast/?${qp.toString()}`, method: 'GET', headers };
      }

      case 'delphi.covid_hosp': {
        const qp = new URLSearchParams();
        qp.set('states', String(params.states));
        qp.set('dates', String(params.dates));
        return {
          url: `${DELPHI_BASE}/covid_hosp_state_timeseries/?${qp.toString()}`,
          method: 'GET',
          headers,
        };
      }

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
    const body = raw.body as Record<string, unknown>;

    // Delphi API always returns {result, message, epidata}
    // result=1 → success, result=-1 → error/no data
    if (body.result !== 1) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: `Delphi API: ${String(body.message ?? 'no data returned')}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    const epidata = (body.epidata ?? []) as Record<string, unknown>[];

    switch (req.toolId) {
      case 'delphi.fluview':
        return this.parseFluView(epidata);
      case 'delphi.flusurv':
        return this.parseFluSurv(epidata);
      case 'delphi.covidcast':
        return this.parseCovidCast(epidata);
      case 'delphi.covid_hosp':
        return this.parseCovidHosp(epidata);
      default:
        return { count: epidata.length, records: epidata };
    }
  }

  private parseFluView(epidata: Record<string, unknown>[]): DelphiFluViewOutput {
    const records: DelphiFluViewRecord[] = epidata.map((r) => ({
      region: String(r.region ?? ''),
      epiweek: Number(r.epiweek ?? 0),
      season: this.epiweekToSeason(Number(r.epiweek ?? 0)),
      wili: r.wili != null ? Number(r.wili) : null,
      ili: r.ili != null ? Number(r.ili) : null,
      num_ili: r.num_ili != null ? Number(r.num_ili) : null,
      num_patients: r.num_patients != null ? Number(r.num_patients) : null,
      num_providers: r.num_providers != null ? Number(r.num_providers) : null,
      age_0_4: r.num_age_0 != null ? Number(r.num_age_0) : null,
      age_5_24: r.num_age_1 != null ? Number(r.num_age_1) : null,
      age_25_49: r.num_age_2 != null ? Number(r.num_age_2) : null,
      age_50_64: r.num_age_3 != null ? Number(r.num_age_3) : null,
      age_65_plus: r.num_age_4 != null ? Number(r.num_age_4) : null,
      issue: Number(r.issue ?? 0),
      lag: Number(r.lag ?? 0),
    }));
    return { count: records.length, records };
  }

  private parseFluSurv(epidata: Record<string, unknown>[]): DelphiFluSurvOutput {
    const records: DelphiFluSurvRecord[] = epidata.map((r) => ({
      location: String(r.location ?? ''),
      epiweek: Number(r.epiweek ?? 0),
      season: this.epiweekToSeason(Number(r.epiweek ?? 0)),
      rate_overall: r.rate_overall != null ? Number(r.rate_overall) : null,
      rate_age_0: r.rate_age_0 != null ? Number(r.rate_age_0) : null,
      rate_age_1: r.rate_age_1 != null ? Number(r.rate_age_1) : null,
      rate_age_2: r.rate_age_2 != null ? Number(r.rate_age_2) : null,
      rate_age_3: r.rate_age_3 != null ? Number(r.rate_age_3) : null,
      rate_age_4: r.rate_age_4 != null ? Number(r.rate_age_4) : null,
      rate_sex_male: r.rate_sex_male != null ? Number(r.rate_sex_male) : null,
      rate_sex_female: r.rate_sex_female != null ? Number(r.rate_sex_female) : null,
      issue: Number(r.issue ?? 0),
      lag: Number(r.lag ?? 0),
    }));
    return { count: records.length, records };
  }

  private parseCovidCast(epidata: Record<string, unknown>[]): DelphiCovidCastOutput {
    const records: DelphiCovidCastRecord[] = epidata.map((r) => ({
      geo_value: String(r.geo_value ?? ''),
      geo_type: String(r.geo_type ?? ''),
      signal: String(r.signal ?? ''),
      source: String(r.source ?? ''),
      time_value: Number(r.time_value ?? 0),
      value: r.value != null ? Number(r.value) : null,
      stderr: r.stderr != null ? Number(r.stderr) : null,
      sample_size: r.sample_size != null ? Number(r.sample_size) : null,
      direction: r.direction != null ? Number(r.direction) : null,
      issue: Number(r.issue ?? 0),
      lag: Number(r.lag ?? 0),
    }));
    return { count: records.length, records };
  }

  private parseCovidHosp(epidata: Record<string, unknown>[]): DelphiCovidHospOutput {
    const records: DelphiCovidHospRecord[] = epidata.map((r) => ({
      state: String(r.state ?? ''),
      date: Number(r.date ?? 0),
      adult_icu:
        r.staffed_adult_icu_beds_utilization_covid != null
          ? Number(r.staffed_adult_icu_beds_utilization_covid)
          : null,
      adult_hosp:
        r.total_adult_patients_hosp_confirmed_covid != null
          ? Number(r.total_adult_patients_hosp_confirmed_covid)
          : null,
      ped_icu:
        r.staffed_icu_pediatric_patients_confirmed_covid != null
          ? Number(r.staffed_icu_pediatric_patients_confirmed_covid)
          : null,
      ped_hosp:
        r.total_pediatric_patients_hosp_confirmed_covid != null
          ? Number(r.total_pediatric_patients_hosp_confirmed_covid)
          : null,
      total_icu:
        r.staffed_icu_adult_patients_confirmed_covid != null
          ? Number(r.staffed_icu_adult_patients_confirmed_covid)
          : null,
      total_hosp:
        r.inpatient_bed_covid_utilization_numerator != null
          ? Number(r.inpatient_bed_covid_utilization_numerator)
          : null,
      new_adult_hosp:
        r.previous_day_admission_adult_covid_confirmed != null
          ? Number(r.previous_day_admission_adult_covid_confirmed)
          : null,
      new_ped_hosp:
        r.previous_day_admission_pediatric_covid_confirmed != null
          ? Number(r.previous_day_admission_pediatric_covid_confirmed)
          : null,
    }));
    return { count: records.length, records };
  }

  // Convert epiweek YYYYWW to flu season string (e.g. 202001 → "2019-20")
  private epiweekToSeason(epiweek: number): string {
    const year = Math.floor(epiweek / 100);
    const week = epiweek % 100;
    // Flu season starts around week 40; weeks 40-53 → season "YYYY-YY+1", weeks 1-39 → "YYYY-1-YYYY"
    if (week >= 40) {
      return `${year}-${String(year + 1).slice(2)}`;
    }
    return `${year - 1}-${String(year).slice(2)}`;
  }
}
