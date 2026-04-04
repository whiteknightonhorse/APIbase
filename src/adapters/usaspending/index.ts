import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  SpendingAwardsOutput,
  SpendingAgencyOutput,
  SpendingGeographyOutput,
  AwardResult,
  GeoSpendingResult,
} from './types';

const API_BASE = 'https://api.usaspending.gov/api/v2';

const AWARD_TYPE_MAP: Record<string, string[]> = {
  contracts: ['A', 'B', 'C', 'D'],
  grants: ['02', '03', '04', '05'],
  all: ['A', 'B', 'C', 'D', '02', '03', '04', '05'],
};

const FIELDS = [
  'Award ID',
  'Recipient Name',
  'Award Amount',
  'Awarding Agency',
  'Award Type',
  'Start Date',
  'End Date',
  'Description',
];

/**
 * USAspending adapter (UC-335).
 *
 * US federal spending — contracts, grants, loans. 60M+ awards, $10+ trillion.
 * Auth: None. US Gov open data (DATA Act), unlimited, explicit commercial use.
 * POST-based search endpoints.
 */
export class UsaSpendingAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'spending', baseUrl: API_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const currentFY = new Date().getFullYear();

    switch (req.toolId) {
      case 'spending.awards': {
        const fy = Number(params.fiscal_year) || currentFY;
        const awardType = String(params.award_type || 'all');
        const limit = Math.min(Number(params.limit) || 10, 25);

        return {
          url: `${API_BASE}/search/spending_by_award/`,
          method: 'POST',
          headers,
          body: JSON.stringify({
            filters: {
              keywords: [String(params.keyword)],
              time_period: [
                {
                  start_date: `${fy - 1}-10-01`,
                  end_date: `${fy}-09-30`,
                },
              ],
              award_type_codes: AWARD_TYPE_MAP[awardType] ?? AWARD_TYPE_MAP.all,
            },
            fields: FIELDS,
            limit,
            page: 1,
            sort: 'Award Amount',
            order: 'desc',
          }),
        };
      }

      case 'spending.agency': {
        const fy = Number(params.fiscal_year) || currentFY;
        const limit = Math.min(Number(params.limit) || 10, 25);

        return {
          url: `${API_BASE}/search/spending_by_award/`,
          method: 'POST',
          headers,
          body: JSON.stringify({
            filters: {
              keywords: [String(params.agency_name)],
              time_period: [
                {
                  start_date: `${fy - 1}-10-01`,
                  end_date: `${fy}-09-30`,
                },
              ],
              award_type_codes: AWARD_TYPE_MAP.all,
            },
            fields: FIELDS,
            limit,
            page: 1,
            sort: 'Award Amount',
            order: 'desc',
          }),
        };
      }

      case 'spending.geography': {
        const fy = Number(params.fiscal_year) || currentFY;
        const awardType = String(params.award_type || 'all');

        return {
          url: `${API_BASE}/search/spending_by_geography/`,
          method: 'POST',
          headers,
          body: JSON.stringify({
            scope: 'place_of_performance',
            geo_layer: 'state',
            filters: {
              time_period: [
                {
                  start_date: `${fy - 1}-10-01`,
                  end_date: `${fy}-09-30`,
                },
              ],
              award_type_codes: AWARD_TYPE_MAP[awardType] ?? AWARD_TYPE_MAP.all,
            },
          }),
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

    switch (req.toolId) {
      case 'spending.awards':
        return this.parseAwards(body, req.params as Record<string, unknown>);
      case 'spending.agency':
        return this.parseAgency(body, req.params as Record<string, unknown>);
      case 'spending.geography':
        return this.parseGeography(body, req.params as Record<string, unknown>);
      default:
        return body;
    }
  }

  private parseAwards(
    body: Record<string, unknown>,
    params: Record<string, unknown>,
  ): SpendingAwardsOutput {
    const results = (body.results ?? []) as Record<string, unknown>[];
    const meta = (body.page_metadata ?? {}) as Record<string, unknown>;

    return {
      total: Number(meta.total ?? results.length),
      page: Number(meta.page ?? 1),
      limit: Number(params.limit ?? 10),
      results: results.map((r) => this.toAwardResult(r)),
    };
  }

  private parseAgency(
    body: Record<string, unknown>,
    params: Record<string, unknown>,
  ): SpendingAgencyOutput {
    const results = (body.results ?? []) as Record<string, unknown>[];
    const meta = (body.page_metadata ?? {}) as Record<string, unknown>;
    const fy = Number(params.fiscal_year) || new Date().getFullYear();

    return {
      agency_name: String(params.agency_name),
      toptier_code: '',
      fiscal_year: fy,
      total: Number(meta.total ?? results.length),
      page: Number(meta.page ?? 1),
      results: results.map((r) => this.toAwardResult(r)),
    };
  }

  private parseGeography(
    body: Record<string, unknown>,
    params: Record<string, unknown>,
  ): SpendingGeographyOutput {
    const results = (body.results ?? []) as Record<string, unknown>[];
    const fy = Number(params.fiscal_year) || new Date().getFullYear();

    const sorted = results
      .map(
        (r): GeoSpendingResult => ({
          state: String(r.display_name ?? ''),
          amount: Number(r.aggregated_amount ?? 0),
          award_count: r.award_count != null ? Number(r.award_count) : null,
          population: r.population != null ? Number(r.population) : null,
          per_capita: r.per_capita != null ? Number(r.per_capita) : null,
        }),
      )
      .sort((a, b) => b.amount - a.amount);

    return {
      scope: 'place_of_performance',
      fiscal_year: `FY${fy}`,
      total_states: sorted.length,
      results: sorted,
    };
  }

  private toAwardResult(r: Record<string, unknown>): AwardResult {
    return {
      award_id: String(r['Award ID'] ?? ''),
      recipient: String(r['Recipient Name'] ?? ''),
      amount: Number(r['Award Amount'] ?? 0),
      agency: String(r['Awarding Agency'] ?? ''),
      award_type: String(r['Award Type'] ?? ''),
      start_date: String(r['Start Date'] ?? ''),
      end_date: String(r['End Date'] ?? ''),
      description: String(r['Description'] ?? '').slice(0, 500),
    };
  }
}
