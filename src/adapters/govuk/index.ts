import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  GovukSearchResponse,
  GovukContentResponse,
  GovukOrganisationsResponse,
} from './types';

/**
 * GOV.UK Content API adapter (UC-430).
 *
 * Supported tools:
 *   govuk.search        → GET /api/search.json?q=...
 *   govuk.content       → GET /api/content{base_path}
 *   govuk.organisations → GET /api/organisations?page=...
 *
 * Auth: none — open public API under Open Government Licence v3.0.
 * All string params are URL-encoded per flywheel [2026-04-05].
 * base_path traversal protection: reject any path containing '..' or '//'.
 */
export class GovukAdapter extends BaseAdapter {
  private static readonly GOVUK_BASE = 'https://www.gov.uk/api';

  constructor() {
    super({
      provider: 'govuk',
      baseUrl: GovukAdapter.GOVUK_BASE,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    switch (req.toolId) {
      case 'govuk.search':
        return this.buildSearch(req.params as Record<string, unknown>);
      case 'govuk.content':
        return this.buildContent(req.params as Record<string, unknown>);
      case 'govuk.organisations':
        return this.buildOrganisations(req.params as Record<string, unknown>);
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
      case 'govuk.search': {
        const data = raw.body as GovukSearchResponse;
        if (!data || !Array.isArray(data.results)) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'Invalid GOV.UK search response',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return data;
      }
      case 'govuk.content': {
        const data = raw.body as GovukContentResponse;
        if (!data || typeof data !== 'object' || !data.content_id) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'GOV.UK path not found or invalid response',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return data;
      }
      case 'govuk.organisations': {
        const data = raw.body as GovukOrganisationsResponse;
        if (!data || !Array.isArray(data.results)) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'Invalid GOV.UK organisations response',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return data;
      }
      default:
        return raw.body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private govukHeaders(): Record<string, string> {
    return {
      Accept: 'application/json',
      'User-Agent': 'APIbase-Gateway/1.0 (https://apibase.pro)',
    };
  }

  private buildSearch(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const qs = new URLSearchParams();

    if (params.q !== undefined && params.q !== '') {
      qs.set('q', encodeURIComponent(String(params.q)));
    }
    if (params.count !== undefined) {
      qs.set('count', String(params.count));
    }
    if (params.start !== undefined) {
      qs.set('start', String(params.start));
    }
    if (params.order !== undefined && params.order !== '') {
      qs.set('order', encodeURIComponent(String(params.order)));
    }

    return {
      url: `${GovukAdapter.GOVUK_BASE}/search.json?${qs.toString()}`,
      method: 'GET',
      headers: this.govukHeaders(),
    };
  }

  private buildContent(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const basePath = String(params.base_path ?? '');

    // Sanitize against path traversal: reject '..' or '//'
    if (basePath.includes('..') || basePath.includes('//')) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'Invalid base_path: path traversal sequences are not allowed',
        provider: this.provider,
        toolId: 'govuk.content',
        durationMs: 0,
      };
    }

    // base_path already starts with '/' — do NOT encodeURIComponent the whole path
    // (it would break the slash). Path segments are already safe after traversal check.
    const url = `${GovukAdapter.GOVUK_BASE}/content${basePath}`;

    return {
      url,
      method: 'GET',
      headers: this.govukHeaders(),
    };
  }

  private buildOrganisations(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const qs = new URLSearchParams();

    if (params.page !== undefined) {
      qs.set('page', String(params.page));
    }

    return {
      url: `${GovukAdapter.GOVUK_BASE}/organisations?${qs.toString()}`,
      method: 'GET',
      headers: this.govukHeaders(),
    };
  }
}
