import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  AdzunaSearchResponse,
  AdzunaCategory,
  JobSearchOutput,
  CategoriesOutput,
  SalaryOutput,
} from './types';

/**
 * Adzuna adapter (UC-253).
 *
 * Supported tools:
 *   adzuna.search     → GET /jobs/{country}/search/{page}
 *   adzuna.categories → GET /jobs/{country}/categories
 *   adzuna.salary     → GET /jobs/{country}/histogram
 *
 * Auth: app_id + app_key query params. Free trial, 16+ countries.
 */
export class AdzunaAdapter extends BaseAdapter {
  private readonly appId: string;
  private readonly appKey: string;

  constructor(appId: string, appKey: string) {
    super({
      provider: 'adzuna',
      baseUrl: 'https://api.adzuna.com/v1/api',
    });
    this.appId = appId;
    this.appKey = appKey;
  }

  private authParams(): string {
    return `app_id=${this.appId}&app_key=${this.appKey}`;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const country = String(params.country ?? 'us').toLowerCase();

    switch (req.toolId) {
      case 'adzuna.search': {
        const qp = new URLSearchParams();
        if (params.what) qp.set('what', String(params.what));
        if (params.where) qp.set('where', String(params.where));
        if (params.category) qp.set('category', String(params.category));
        if (params.salary_min) qp.set('salary_min', String(params.salary_min));
        if (params.salary_max) qp.set('salary_max', String(params.salary_max));
        if (params.full_time) qp.set('full_time', '1');
        if (params.permanent) qp.set('permanent', '1');
        qp.set('results_per_page', String(Math.min(Number(params.limit) || 10, 20)));
        const page = Number(params.page) || 1;
        return {
          url: `${this.baseUrl}/jobs/${country}/search/${page}?${this.authParams()}&${qp.toString()}`,
          method: 'GET',
          headers: {},
        };
      }

      case 'adzuna.categories':
        return {
          url: `${this.baseUrl}/jobs/${country}/categories?${this.authParams()}`,
          method: 'GET',
          headers: {},
        };

      case 'adzuna.salary': {
        const qp = new URLSearchParams();
        if (params.what) qp.set('what', String(params.what));
        if (params.where) qp.set('location0', String(params.where));
        return {
          url: `${this.baseUrl}/jobs/${country}/histogram?${this.authParams()}&${qp.toString()}`,
          method: 'GET',
          headers: {},
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
      case 'adzuna.search':
        return this.parseSearch(body as unknown as AdzunaSearchResponse);
      case 'adzuna.categories':
        return this.parseCategories(body);
      case 'adzuna.salary':
        return this.parseSalary(body, req.params as Record<string, unknown>);
      default:
        return body;
    }
  }

  private parseSearch(body: AdzunaSearchResponse): JobSearchOutput {
    return {
      total: body.count ?? 0,
      jobs: (body.results ?? []).map((j) => ({
        title: j.title ?? '',
        company: j.company?.display_name ?? '',
        location: j.location?.display_name ?? '',
        salary_min: j.salary_min,
        salary_max: j.salary_max,
        category: j.category?.label ?? '',
        contract_type: j.contract_type,
        created: j.created ?? '',
        url: j.redirect_url ?? '',
      })),
      mean_salary: body.mean,
    };
  }

  private parseCategories(body: Record<string, unknown>): CategoriesOutput {
    const results = (body.results ?? []) as AdzunaCategory[];
    return {
      categories: results.map((c) => ({ tag: c.tag, label: c.label })),
      total: results.length,
    };
  }

  private parseSalary(
    body: Record<string, unknown>,
    params: Record<string, unknown>,
  ): SalaryOutput {
    const histogram = (body.histogram ?? {}) as Record<string, number>;
    return {
      query: String(params.what ?? ''),
      histogram,
      buckets: Object.keys(histogram).length,
    };
  }
}
