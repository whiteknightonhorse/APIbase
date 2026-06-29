import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  TreasuryFiscalResponse,
  DebtRecord,
  InterestRateRecord,
  QuarterlyYieldRecord,
  DebtExpenseRecord,
} from './types';

/**
 * US Treasury Fiscal Data adapter (UC-527).
 *
 * API: https://api.fiscaldata.treasury.gov/services/api/fiscal_service
 * Auth: none — US Government public data, commercial use explicit (fiscaldata.treasury.gov)
 *
 * Tools:
 *   treasuryfiscal.debt.current     -> /v2/accounting/od/debt_to_penny     (daily national debt)
 *   treasuryfiscal.rates.interest   -> /v2/accounting/od/avg_interest_rates (avg rates by security)
 *   treasuryfiscal.yield.quarterly  -> /v2/accounting/od/utf_qtr_yields     (quarterly portfolio yield)
 *   treasuryfiscal.debt.expense     -> /v2/accounting/od/interest_expense   (monthly interest expense)
 */

const BASE = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service';

export class TreasuryFiscalAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'treasuryfiscal',
      baseUrl: BASE,
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
      Accept: 'application/json',
      'User-Agent': 'APIbase-Gateway/1.0',
    };

    switch (req.toolId) {
      case 'treasuryfiscal.debt.current':
        return this.buildDebtCurrent(p, headers);
      case 'treasuryfiscal.rates.interest':
        return this.buildRatesInterest(p, headers);
      case 'treasuryfiscal.yield.quarterly':
        return this.buildYieldQuarterly(p, headers);
      case 'treasuryfiscal.debt.expense':
        return this.buildDebtExpense(p, headers);
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

  private buildDebtCurrent(
    p: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const days = Math.min(100, Math.max(1, Number(p.days ?? 1)));
    const qs = new URLSearchParams({
      sort: '-record_date',
      'page[size]': String(days),
      'page[number]': '1',
      fields:
        'record_date,debt_held_public_amt,intragov_hold_amt,tot_pub_debt_out_amt,record_fiscal_year,record_calendar_year,record_calendar_month,record_calendar_day',
    });
    return { url: `${BASE}/v2/accounting/od/debt_to_penny?${qs}`, method: 'GET', headers };
  }

  private buildRatesInterest(
    p: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const limit = Math.min(200, Math.max(1, Number(p.limit ?? 30)));
    const securityType = ((p.security_type as string | undefined) ?? '').trim().toLowerCase();

    const qs = new URLSearchParams({
      sort: '-record_date',
      'page[size]': String(limit),
      'page[number]': '1',
      fields: 'record_date,security_type_desc,security_desc,avg_interest_rate_amt',
    });

    if (securityType === 'marketable') {
      qs.set('filter', 'security_type_desc:eq:Marketable');
    } else if (securityType === 'non-marketable' || securityType === 'nonmarketable') {
      qs.set('filter', 'security_type_desc:eq:Non-marketable');
    }

    return {
      url: `${BASE}/v2/accounting/od/avg_interest_rates?${qs}`,
      method: 'GET',
      headers,
    };
  }

  private buildYieldQuarterly(
    p: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const limit = Math.min(40, Math.max(1, Number(p.limit ?? 8)));
    const qs = new URLSearchParams({
      sort: '-record_date',
      'page[size]': String(limit),
      'page[number]': '1',
      fields: 'record_date,quarter_desc,yield_pct',
    });
    return { url: `${BASE}/v2/accounting/od/utf_qtr_yields?${qs}`, method: 'GET', headers };
  }

  private buildDebtExpense(
    p: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const limit = Math.min(200, Math.max(1, Number(p.limit ?? 20)));
    const qs = new URLSearchParams({
      sort: '-record_date',
      'page[size]': String(limit),
      'page[number]': '1',
      fields:
        'record_date,expense_catg_desc,expense_group_desc,expense_type_desc,month_expense_amt,fytd_expense_amt',
    });
    return { url: `${BASE}/v2/accounting/od/interest_expense?${qs}`, method: 'GET', headers };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    switch (req.toolId) {
      case 'treasuryfiscal.debt.current':
        return this.parseDebtCurrent(raw, req);
      case 'treasuryfiscal.rates.interest':
        return this.parseRatesInterest(raw);
      case 'treasuryfiscal.yield.quarterly':
        return this.parseYieldQuarterly(raw, req);
      case 'treasuryfiscal.debt.expense':
        return this.parseDebtExpense(raw, req);
      default:
        return raw.body;
    }
  }

  private parseDebtCurrent(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as TreasuryFiscalResponse<DebtRecord>;
    if (!body.data) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'Missing data in Treasury debt response',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }
    const p = req.params as Record<string, unknown>;
    const days = Math.min(100, Math.max(1, Number(p.days ?? 1)));
    const records = body.data.map((r) => ({
      date: r.record_date,
      fiscal_year: r.record_fiscal_year,
      debt_held_by_public_usd:
        r.debt_held_public_amt === 'null' ? null : Number(r.debt_held_public_amt),
      intragovernmental_holdings_usd:
        r.intragov_hold_amt === 'null' ? null : Number(r.intragov_hold_amt),
      total_debt_outstanding_usd:
        r.tot_pub_debt_out_amt === 'null' ? null : Number(r.tot_pub_debt_out_amt),
    }));

    const latest = records[0] ?? null;
    return {
      latest_date: latest?.date ?? null,
      latest_total_debt_usd: latest?.total_debt_outstanding_usd ?? null,
      latest_total_debt_trillion:
        latest?.total_debt_outstanding_usd != null
          ? Math.round(latest.total_debt_outstanding_usd / 1e10) / 100
          : null,
      days_returned: records.length,
      days_requested: days,
      series: records,
      source: 'US Treasury Fiscal Data — Debt to the Penny (fiscaldata.treasury.gov)',
    };
  }

  private parseRatesInterest(raw: ProviderRawResponse): unknown {
    const body = raw.body as TreasuryFiscalResponse<InterestRateRecord>;
    if (!body.data) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'Missing data in Treasury interest rates response',
        provider: this.provider,
        toolId: 'treasuryfiscal.rates.interest',
        durationMs: raw.durationMs,
      };
    }

    const records = body.data.map((r) => ({
      date: r.record_date,
      security_type: r.security_type_desc,
      security: r.security_desc,
      avg_interest_rate_pct:
        r.avg_interest_rate_amt === 'null' ? null : Number(r.avg_interest_rate_amt),
    }));

    // Group by date for summary
    const byDate: Record<string, typeof records> = {};
    for (const r of records) {
      if (!byDate[r.date]) byDate[r.date] = [];
      byDate[r.date].push(r);
    }

    const dates = Object.keys(byDate).sort().reverse();
    return {
      latest_date: dates[0] ?? null,
      total_returned: records.length,
      rates: records,
      source: 'US Treasury Fiscal Data — Average Interest Rates on US Treasury Securities',
    };
  }

  private parseYieldQuarterly(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as TreasuryFiscalResponse<QuarterlyYieldRecord>;
    if (!body.data) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'Missing data in Treasury quarterly yield response',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }

    const series = body.data.map((r) => ({
      quarter_end_date: r.record_date,
      quarter: r.quarter_desc,
      yield_pct: r.yield_pct === 'null' ? null : Number(r.yield_pct),
    }));

    const latest = series[0] ?? null;
    return {
      latest_quarter: latest?.quarter ?? null,
      latest_yield_pct: latest?.yield_pct ?? null,
      quarters_returned: series.length,
      series,
      note: 'Quarterly yield of the US Treasury securities portfolio (Uniform Treasury Tax and Loan Program)',
      source: 'US Treasury Fiscal Data — Quarterly Yield Data',
    };
  }

  private parseDebtExpense(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as TreasuryFiscalResponse<DebtExpenseRecord>;
    if (!body.data) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'Missing data in Treasury interest expense response',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }

    const records = body.data.map((r) => ({
      date: r.record_date,
      category: r.expense_catg_desc,
      group: r.expense_group_desc,
      security_type: r.expense_type_desc,
      monthly_expense_usd: r.month_expense_amt === 'null' ? null : Number(r.month_expense_amt),
      fiscal_year_to_date_usd: r.fytd_expense_amt === 'null' ? null : Number(r.fytd_expense_amt),
    }));

    const latest = records[0] ?? null;
    return {
      latest_date: latest?.date ?? null,
      total_returned: records.length,
      expense_records: records,
      note: 'Monthly and fiscal-year-to-date interest expense on US federal debt by security type',
      source:
        'US Treasury Fiscal Data — Interest Expense on Federal Debt (fiscaldata.treasury.gov)',
    };
  }
}
