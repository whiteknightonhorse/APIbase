import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { MarsReportsResponse, MarsReport } from './types';

/**
 * USDA AMS MARS (MyMarketNews) adapter (UC-528).
 *
 * API: https://marsapi.ams.usda.gov/services/v3.1/public
 * Auth: none — US Government public domain data
 * License: Public domain (17 USC §105)
 *
 * Tools:
 *   usdamars.list_reports    → listPublishedReports/{days}    (reports published in last N days)
 *   usdamars.get_report      → listPublishedReport/{id}       (single report metadata by ID)
 *   usdamars.list_corrected  → listCorrectedReports/{days}   (corrected/amended reports)
 *   usdamars.search_reports  → listPublishedReports/{days}    (filtered by commodity keyword)
 */

const BASE = 'https://marsapi.ams.usda.gov/services/v3.1/public';

export class UsdaMarsAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'usdamars',
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
      'User-Agent': 'APIbase-Gateway/1.0 (https://apibase.pro)',
    };

    switch (req.toolId) {
      case 'usdamars.list_reports':
        return this.buildListReports(p, headers);
      case 'usdamars.get_report':
        return this.buildGetReport(p, headers);
      case 'usdamars.list_corrected':
        return this.buildListCorrected(p, headers);
      case 'usdamars.search_reports':
        return this.buildSearchReports(p, headers);
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

  private buildListReports(
    p: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const days = Math.min(30, Math.max(1, Number(p.days ?? 7)));
    return { url: `${BASE}/listPublishedReports/${days}?format=json`, method: 'GET', headers };
  }

  private buildGetReport(
    p: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const id = String(p.report_id ?? '').trim();
    if (!id) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 422,
        message: 'report_id is required',
        provider: this.provider,
        toolId: 'usdamars.get_report',
        durationMs: 0,
      };
    }
    return {
      url: `${BASE}/listPublishedReport/${encodeURIComponent(id)}?format=json`,
      method: 'GET',
      headers,
    };
  }

  private buildListCorrected(
    p: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const days = String(p.days ?? 'all')
      .toLowerCase()
      .trim();
    const validDays = days === 'all' ? 'all' : String(Math.min(90, Math.max(1, Number(days))));
    return { url: `${BASE}/listCorrectedReports/${validDays}?format=json`, method: 'GET', headers };
  }

  private buildSearchReports(
    p: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const days = Math.min(30, Math.max(1, Number(p.days ?? 7)));
    return { url: `${BASE}/listPublishedReports/${days}?format=json`, method: 'GET', headers };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    switch (req.toolId) {
      case 'usdamars.list_reports':
        return this.parseListReports(raw, req);
      case 'usdamars.get_report':
        return this.parseGetReport(raw, req);
      case 'usdamars.list_corrected':
        return this.parseListCorrected(raw, req);
      case 'usdamars.search_reports':
        return this.parseSearchReports(raw, req);
      default:
        return raw.body;
    }
  }

  private normalizeReport(r: MarsReport) {
    return {
      id: r.id,
      title: r.reportTitle,
      file_name: r.fileName,
      file_type: r.fileExtension,
      published_date: r.publishedDate,
      report_begin_date: r.reportBeginDate,
      report_end_date: r.reportEndDate,
      is_correction: r.correction,
      is_final: r.final,
    };
  }

  private parseListReports(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as MarsReportsResponse;
    if (!Array.isArray(body.reports)) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'Missing reports array in MARS response',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }
    const p = req.params as Record<string, unknown>;
    const days = Math.min(30, Math.max(1, Number(p.days ?? 7)));
    return {
      as_of: body.createdDate,
      days_requested: days,
      total_reports: body.numberOfReports,
      reports: body.reports.slice(0, 100).map(this.normalizeReport),
      note: `Showing first 100 of ${body.numberOfReports} published USDA AMS market news reports from the last ${days} day(s).`,
      source: 'USDA Agricultural Marketing Service — MyMarketNews (public domain)',
    };
  }

  private parseGetReport(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as MarsReportsResponse;
    if (!Array.isArray(body.reports) || body.reports.length === 0) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'Report not found or no data returned',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }
    const report = body.reports[0];
    return {
      as_of: body.createdDate,
      report: this.normalizeReport(report),
      source: 'USDA Agricultural Marketing Service — MyMarketNews (public domain)',
    };
  }

  private parseListCorrected(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as MarsReportsResponse;
    if (!Array.isArray(body.reports)) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'Missing reports array in MARS corrected response',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }
    const p = req.params as Record<string, unknown>;
    const days = p.days ?? 'all';
    return {
      as_of: body.createdDate,
      days_requested: String(days),
      total_corrections: body.numberOfReports,
      reports: body.reports.slice(0, 50).map(this.normalizeReport),
      note: `Corrected/amended USDA AMS market news reports. Corrections supersede previous published data.`,
      source: 'USDA Agricultural Marketing Service — MyMarketNews (public domain)',
    };
  }

  private parseSearchReports(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as MarsReportsResponse;
    if (!Array.isArray(body.reports)) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'Missing reports array in MARS search response',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }
    const p = req.params as Record<string, unknown>;
    const keyword = String(p.keyword ?? '')
      .toLowerCase()
      .trim();
    const days = Math.min(30, Math.max(1, Number(p.days ?? 7)));

    const filtered = keyword
      ? body.reports.filter((r) => r.reportTitle.toLowerCase().includes(keyword))
      : body.reports;

    return {
      as_of: body.createdDate,
      days_searched: days,
      keyword: keyword || null,
      total_matching: filtered.length,
      total_in_period: body.numberOfReports,
      reports: filtered.slice(0, 50).map(this.normalizeReport),
      note: keyword
        ? `Reports with "${keyword}" in the title from the last ${days} day(s).`
        : `All published reports from the last ${days} day(s). Provide a keyword to narrow results.`,
      source: 'USDA Agricultural Marketing Service — MyMarketNews (public domain)',
    };
  }
}
