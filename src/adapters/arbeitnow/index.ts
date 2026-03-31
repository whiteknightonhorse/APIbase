import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { ArbeitnowJob, ArbeitnowJobsOutput } from './types';

/**
 * Arbeitnow adapter (UC-256).
 *
 * Supported tools:
 *   arbeitnow.jobs → GET /api/job-board-api?page=N
 *
 * Auth: None (open public API). EU-focused job listings.
 * Updated hourly. Pagination only (no server-side search).
 */
export class ArbeitnowAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'arbeitnow',
      baseUrl: 'https://www.arbeitnow.com/api',
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
      case 'arbeitnow.jobs': {
        const page = Math.max(1, Number(params.page) || 1);
        return {
          url: `${this.baseUrl}/job-board-api?page=${page}`,
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
      case 'arbeitnow.jobs':
        return this.parseJobs(body);
      default:
        return body;
    }
  }

  private parseJobs(body: Record<string, unknown>): ArbeitnowJobsOutput {
    const data = (body.data ?? []) as ArbeitnowJob[];
    const meta = (body.meta ?? {}) as Record<string, unknown>;

    return {
      jobs: data.map((j) => ({
        title: j.title ?? '',
        company: j.company_name ?? '',
        location: j.location ?? '',
        remote: j.remote ?? false,
        tags: j.tags ?? [],
        job_types: j.job_types ?? [],
        url: j.url ?? '',
        posted: j.created_at ?? '',
      })),
      page: Number(meta.current_page) || 1,
      count: data.length,
    };
  }
}
