import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { RemotiveJob, RemotiveSearchOutput } from './types';

/**
 * Remotive adapter (UC-258).
 *
 * Supported tools:
 *   remotive.search → GET /api/remote-jobs
 *
 * Auth: None (open public API). Curated remote-only job listings.
 */
export class RemotiveAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'remotive',
      baseUrl: 'https://remotive.com/api',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'remotive.search': {
        const qp = new URLSearchParams();
        if (params.search) qp.set('search', String(params.search));
        if (params.category) qp.set('category', String(params.category));
        const limit = Math.min(Number(params.limit) || 20, 50);
        qp.set('limit', String(limit));
        return {
          url: `${this.baseUrl}/remote-jobs?${qp.toString()}`,
          method: 'GET',
          headers: { Accept: 'application/json' },
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
      case 'remotive.search':
        return this.parseJobs(body);
      default:
        return body;
    }
  }

  private parseJobs(body: Record<string, unknown>): RemotiveSearchOutput {
    const jobs = (body.jobs ?? []) as RemotiveJob[];
    const total = Number(body['total-job-count']) || 0;

    return {
      jobs: jobs.map((j) => ({
        id: j.id,
        title: j.title ?? '',
        company: j.company_name ?? '',
        category: j.category ?? '',
        job_type: j.job_type ?? '',
        salary: j.salary ?? '',
        location_requirement: j.candidate_required_location ?? '',
        tags: j.tags ?? [],
        posted: j.publication_date ?? '',
        url: j.url ?? '',
      })),
      count: jobs.length,
      total,
    };
  }
}
