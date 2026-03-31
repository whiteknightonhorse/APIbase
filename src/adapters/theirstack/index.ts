import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { TSJob, TSCompany, JobsOutput, CompaniesOutput } from './types';

/**
 * TheirStack adapter (UC-254).
 *
 * Supported tools:
 *   theirstack.jobs      → POST /jobs/search
 *   theirstack.companies → POST /companies/search
 *
 * Auth: Bearer JWT. 200 API credits/month free.
 * 181M+ job postings, tech stack analysis.
 */
export class TheirStackAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'theirstack',
      baseUrl: 'https://api.theirstack.com/v1',
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
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    switch (req.toolId) {
      case 'theirstack.jobs': {
        const body: Record<string, unknown> = {
          limit: Math.min(Number(params.limit) || 10, 25),
        };
        if (params.keywords) {
          const kw = String(params.keywords);
          body.job_title_or = kw.split(',').map((s) => s.trim());
        }
        if (params.country) body.job_country_code_or = [String(params.country).toUpperCase()];
        if (params.remote) body.remote = true;
        if (params.days) body.posted_at_max_age_days = Number(params.days);
        if (params.technologies) {
          body.technologies_or = String(params.technologies)
            .split(',')
            .map((s) => s.trim());
        }
        return {
          url: `${this.baseUrl}/jobs/search`,
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        };
      }

      case 'theirstack.companies': {
        const body: Record<string, unknown> = {
          limit: Math.min(Number(params.limit) || 10, 25),
        };
        if (params.technologies) {
          body.technologies_or = String(params.technologies)
            .split(',')
            .map((s) => s.trim());
        }
        if (params.country) body.company_country_code_or = [String(params.country).toUpperCase()];
        if (params.min_jobs) body.min_num_jobs = Number(params.min_jobs);
        return {
          url: `${this.baseUrl}/companies/search`,
          method: 'POST',
          headers,
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
      case 'theirstack.jobs':
        return this.parseJobs(body);
      case 'theirstack.companies':
        return this.parseCompanies(body);
      default:
        return body;
    }
  }

  private parseJobs(body: Record<string, unknown>): JobsOutput {
    const data = (body.data ?? []) as TSJob[];
    return {
      jobs: data.map((j) => ({
        title: j.job_title ?? '',
        company: j.company ?? '',
        location: j.location ?? '',
        country: j.country ?? '',
        remote: j.remote ?? false,
        salary_min_usd: j.min_annual_salary_usd,
        salary_max_usd: j.max_annual_salary_usd,
        posted: j.date_posted ?? '',
        url: j.url ?? '',
      })),
      count: data.length,
    };
  }

  private parseCompanies(body: Record<string, unknown>): CompaniesOutput {
    const data = (body.data ?? []) as TSCompany[];
    return {
      companies: data.map((c) => ({
        name: c.company_name ?? '',
        url: c.company_url ?? '',
        jobs_count: c.num_jobs ?? 0,
        technologies: c.technologies ?? [],
        country: c.country ?? '',
      })),
      count: data.length,
    };
  }
}
