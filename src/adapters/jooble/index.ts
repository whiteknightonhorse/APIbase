import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import { stripHtml } from '../../utils/strip-html';
import type { JoobleJob, JoobleSearchOutput } from './types';

/**
 * Jooble adapter (UC-255).
 *
 * Supported tools:
 *   jooble.search → POST /api/{key}
 *
 * Auth: API key in URL path. 500 requests default limit.
 * Aggregated job search across 70+ countries.
 */
export class JoobleAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'jooble',
      baseUrl: 'https://jooble.org/api',
    });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'jooble.search': {
        const body: Record<string, unknown> = {};
        if (params.keywords) body.keywords = String(params.keywords);
        if (params.location) body.location = String(params.location);
        if (params.radius) body.radius = String(params.radius);
        if (params.salary) body.salary = Number(params.salary);
        if (params.page) body.page = Number(params.page);
        body.ResultOnPage = Math.min(Number(params.limit) || 10, 20);
        if (params.company_search) body.companysearch = true;
        return {
          url: `${this.baseUrl}/${encodeURIComponent(this.apiKey)}`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
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
      case 'jooble.search':
        return this.parseJobs(body);
      default:
        return body;
    }
  }

  private parseJobs(body: Record<string, unknown>): JoobleSearchOutput {
    const jobs = (body.jobs ?? []) as JoobleJob[];
    const totalCount = Number(body.totalCount) || 0;

    return {
      jobs: jobs.map((j) => ({
        title: j.title ?? '',
        company: j.company ?? '',
        location: j.location ?? '',
        salary: j.salary ?? '',
        type: j.type ?? '',
        source: j.source ?? '',
        url: j.link ?? '',
        posted: j.updated ?? '',
        ...(j.snippet ? { snippet: stripHtml(j.snippet).slice(0, 300) } : {}),
      })),
      total: totalCount,
      count: jobs.length,
    };
  }
}
