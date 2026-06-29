import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { LmprReportSection } from './types';

/**
 * USDA Livestock Mandatory Price Reporting (LMPR) Datamart adapter (UC-535).
 *
 * Supported tools:
 *   lmpr.cattle_slaughter_prices → /services/v1.1/reports/2466 (LM_CT100)
 *   lmpr.hog_slaughter_prices    → /services/v1.1/reports/2511 (LM_HG201)
 *   lmpr.boxed_beef_cutout       → /services/v1.1/reports/2461 (LM_XB459)
 *   lmpr.dairy_product_prices    → /services/v1.1/reports/2993 (DYWDAIRYPRODUCTSSALES)
 *   lmpr.lamb_carcass_cutout     → /services/v1.1/reports/2649 (LM_XL502)
 *
 * Auth: none — US Government public domain (7 U.S.C. § 198–198b).
 * Reports published daily (cattle/hogs/lamb) and weekly (beef/dairy).
 */
export class LmprAdapter extends BaseAdapter {
  // Report numeric IDs on the LMPR Datamart
  private static readonly REPORT_IDS: Record<string, string> = {
    'lmpr.cattle_slaughter_prices': '2466',
    'lmpr.hog_slaughter_prices': '2511',
    'lmpr.boxed_beef_cutout': '2461',
    'lmpr.dairy_product_prices': '2993',
    'lmpr.lamb_carcass_cutout': '2649',
  };

  constructor() {
    super({
      provider: 'lmpr',
      baseUrl: 'https://mpr.datamart.ams.usda.gov',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const reportId = LmprAdapter.REPORT_IDS[req.toolId];

    if (!reportId) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Unsupported tool: ${req.toolId}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    const reportDate = params.report_date as string | undefined;
    const allSections = params.all_sections !== false;

    let query: string;
    if (reportDate) {
      // Convert YYYY-MM-DD → M/D/YYYY as required by the API
      const formatted = this.formatDate(reportDate);
      query = `?q=report_date=${encodeURIComponent(formatted)}`;
      if (allSections) query += '&allSections=true';
    } else {
      // Default: most recent report
      query = '?lastReports=1';
      if (allSections) query += '&allSections=true';
    }

    const url = `${this.baseUrl}/services/v1.1/reports/${reportId}${query}`;

    return {
      url,
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'APIbase/1.0 (https://apibase.pro; contact@apibase.pro)',
      },
    };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body;

    if (typeof body === 'string') {
      const trimmed = (body as string).trim();
      if (trimmed === '"No Results Found. "' || trimmed.includes('No Results Found')) {
        return {
          data: [],
          total: 0,
          message: 'No data found for the specified date. Try a recent weekday.',
        };
      }
    }

    if (!Array.isArray(body)) {
      throw new Error('Unexpected response format from LMPR API');
    }

    const sections = body as LmprReportSection[];
    if (sections.length === 0) {
      return { data: [], total: 0, message: 'No data available' };
    }

    return this.formatResponse(sections, req.toolId);
  }

  private formatResponse(sections: LmprReportSection[], toolId: string): unknown {
    const meta = this.extractMeta(sections);
    const data = this.extractSections(sections);

    switch (toolId) {
      case 'lmpr.cattle_slaughter_prices':
        return {
          report: 'LM_CT100 — 5 Area Daily Weighted Average Direct Slaughter Cattle',
          ...meta,
          sections: data,
        };
      case 'lmpr.hog_slaughter_prices':
        return {
          report: 'LM_HG201 — National Daily Direct Prior Day Slaughtered Swine',
          ...meta,
          sections: data,
        };
      case 'lmpr.boxed_beef_cutout':
        return {
          report: 'LM_XB459 — National Weekly Boxed Beef Cutout & Boxed Beef Cuts',
          ...meta,
          sections: data,
        };
      case 'lmpr.dairy_product_prices':
        return {
          report: 'National Dairy Products Sales Report',
          ...meta,
          sections: data,
        };
      case 'lmpr.lamb_carcass_cutout':
        return {
          report: 'LM_XL502 — National Estimated Lamb Carcass Cutout',
          ...meta,
          sections: data,
        };
      default:
        return { sections: data };
    }
  }

  private extractMeta(sections: LmprReportSection[]): Record<string, unknown> {
    const first = sections[0]?.results?.[0];
    if (!first) return {};
    return {
      report_date: first.report_date ?? first.week_ending_date ?? first.for_date_begin,
      published_date: first.published_date,
      office: first.office_name,
      available_sections: sections[0]?.reportSections ?? [],
    };
  }

  private extractSections(sections: LmprReportSection[]): Record<string, unknown[]> {
    const out: Record<string, unknown[]> = {};
    for (const sec of sections) {
      // Strip redundant metadata fields from each row
      const rows = sec.results.map((r) => {
        const clean: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) {
          if (
            ![
              'report_title',
              'slug_name',
              'slug_id',
              'office_name',
              'office_code',
              'office_city',
              'office_state',
              'market_location_name',
              'market_location_city',
              'market_location_state',
              'market_type',
              'market_type_category',
              'published_date',
              'is_correction',
            ].includes(k)
          ) {
            clean[k] = v;
          }
        }
        return clean;
      });
      out[sec.reportSection] = rows;
    }
    return out;
  }

  /** Convert YYYY-MM-DD or M/D/YYYY to M/D/YYYY (API requires this format). */
  private formatDate(input: string): string {
    // Already in M/D/YYYY
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(input)) return input;
    // Convert YYYY-MM-DD
    const m = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      return `${parseInt(m[2])}/${parseInt(m[3])}/${m[1]}`;
    }
    return input;
  }
}
