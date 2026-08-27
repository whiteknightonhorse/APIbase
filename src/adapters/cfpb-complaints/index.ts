import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { CfpbSearchResponse, CfpbTrendsResponse, CfpbGeoStatesResponse } from './types';

const CFPB_BASE = 'https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1';

/**
 * CFPB Consumer Complaint Database API adapter (UC-614).
 *
 * Supported tools (read-only):
 *   cfpb-complaints.search      → GET /  (full-text + parametric complaint search)
 *   cfpb-complaints.trends      → GET /trends  (complaint volume trend over time)
 *   cfpb-complaints.geo_states  → GET /geo/states  (per-state complaint aggregation)
 *
 * Auth: None (US Government open data, public domain — Consumer Financial Protection Bureau).
 *
 * UPSTREAM QUIRK: `product`/`company`/`issue` filters require an EXACT match against CFPB's
 * taxonomy strings (e.g. "Credit reporting or other personal consumer reports", not "credit
 * reporting" or "Mortgage report"). A non-matching value silently returns zero results rather
 * than an error, so schema descriptions list the real taxonomy values verbatim.
 *
 * UPSTREAM QUIRK: on /trends, `hits.total` is always the full ~17M-document corpus size
 * regardless of filters — filters DO work (verified live: aggregation bucket doc_counts change
 * correctly with `product`/`state` filters applied), but `hits.total` itself is not filtered by
 * upstream. parseResponse omits the misleading `hits.total` field from the trends response.
 */
export class CfpbComplaintsAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'cfpb-complaints',
      baseUrl: CFPB_BASE,
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
      case 'cfpb-complaints.search':
        return this.buildSearchRequest(params, headers);
      case 'cfpb-complaints.trends':
        return this.buildTrendsRequest(params, headers);
      case 'cfpb-complaints.geo_states':
        return this.buildGeoStatesRequest(params, headers);
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
    switch (req.toolId) {
      case 'cfpb-complaints.search': {
        const data = raw.body as unknown as CfpbSearchResponse;
        return {
          total_found: data.hits.total.value,
          complaints: (data.hits.hits ?? []).map((h) => ({
            complaint_id: h._source.complaint_id,
            product: h._source.product,
            sub_product: h._source.sub_product,
            issue: h._source.issue,
            sub_issue: h._source.sub_issue,
            complaint_what_happened: h._source.complaint_what_happened || null,
            date_received: h._source.date_received,
            date_sent_to_company: h._source.date_sent_to_company,
            company: h._source.company,
            state: h._source.state,
            zip_code: h._source.zip_code,
            company_response: h._source.company_response,
            company_public_response: h._source.company_public_response,
            timely: h._source.timely,
            tags: h._source.tags,
            submitted_via: h._source.submitted_via,
            has_narrative: h._source.has_narrative,
          })),
        };
      }
      case 'cfpb-complaints.trends': {
        const data = raw.body as unknown as CfpbTrendsResponse;
        const buckets = data.aggregations.dateRangeBrush?.dateRangeBrush.buckets ?? [];
        return {
          interval_counts: buckets.map((b) => ({
            period: b.key_as_string,
            complaint_count: b.doc_count,
          })),
        };
      }
      case 'cfpb-complaints.geo_states': {
        const data = raw.body as unknown as CfpbGeoStatesResponse;
        const buckets = data.aggregations.state.state.buckets ?? [];
        return {
          states: buckets.map((b) => ({
            state: b.key,
            complaint_count: b.doc_count,
            top_products: (b.product?.buckets ?? []).map((p) => ({
              product: p.key,
              count: p.doc_count,
            })),
            top_issues: (b.issue?.buckets ?? []).map((i) => ({
              issue: i.key,
              count: i.doc_count,
            })),
          })),
        };
      }
      default:
        return raw.body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildSearchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    // no_aggs=true: the default aggregation payload is ~400KB regardless of `size` —
    // this tool serves the complaint records only, not category breakdowns.
    qs.set('no_aggs', 'true');
    if (params.search_term) {
      qs.set('search_term', String(params.search_term));
      qs.set('field', params.field ? String(params.field) : 'complaint_what_happened');
    }
    if (params.product) qs.set('product', String(params.product));
    if (params.company) qs.set('company', String(params.company));
    if (params.state) qs.set('state', String(params.state));
    if (params.issue) qs.set('issue', String(params.issue));
    if (params.company_response) qs.set('company_response', String(params.company_response));
    if (params.timely) qs.set('timely', String(params.timely));
    if (params.has_narrative !== undefined) {
      qs.set('has_narrative', String(params.has_narrative));
    }
    if (params.date_received_min) qs.set('date_received_min', String(params.date_received_min));
    if (params.date_received_max) qs.set('date_received_max', String(params.date_received_max));
    qs.set('size', String(params.size ?? 10));
    if (params.frm) qs.set('frm', String(params.frm));
    qs.set('sort', params.sort ? String(params.sort) : 'created_date_desc');

    return {
      url: `${this.baseUrl}/?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildTrendsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('lens', params.lens ? String(params.lens) : 'overview');
    if (params.sub_lens) qs.set('sub_lens', String(params.sub_lens));
    qs.set('trend_interval', params.trend_interval ? String(params.trend_interval) : 'month');
    if (params.date_min) qs.set('date_min', String(params.date_min));
    if (params.date_max) qs.set('date_max', String(params.date_max));
    if (params.product) qs.set('product', String(params.product));
    if (params.company) qs.set('company', String(params.company));
    if (params.state) qs.set('state', String(params.state));

    return {
      url: `${this.baseUrl}/trends?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildGeoStatesRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (params.date_received_min) qs.set('date_received_min', String(params.date_received_min));
    if (params.date_received_max) qs.set('date_received_max', String(params.date_received_max));
    if (params.product) qs.set('product', String(params.product));
    if (params.company) qs.set('company', String(params.company));

    return {
      url: `${this.baseUrl}/geo/states?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }
}
