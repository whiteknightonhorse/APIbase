import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import { stripHtml } from '../../utils/strip-html';
import type { ReedSearchJob, ReedJobDetail, ReedSearchOutput, ReedDetailOutput } from './types';

/**
 * Reed.co.uk adapter (UC-257).
 *
 * Supported tools:
 *   reed.search  → GET /api/1.0/search
 *   reed.details → GET /api/1.0/jobs/{jobId}
 *
 * Auth: HTTP Basic Auth (API key as username, empty password).
 * UK largest job board. Jobseeker API is free (read-only).
 */
export class ReedAdapter extends BaseAdapter {
  private readonly authHeader: string;

  constructor(apiKey: string) {
    super({
      provider: 'reed',
      baseUrl: 'https://www.reed.co.uk/api/1.0',
    });
    this.authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
    };

    switch (req.toolId) {
      case 'reed.search': {
        const qp = new URLSearchParams();
        if (params.keywords) qp.set('keywords', String(params.keywords));
        if (params.location) qp.set('locationName', String(params.location));
        if (params.distance) qp.set('distanceFromLocation', String(params.distance));
        if (params.salary_min) qp.set('minimumSalary', String(params.salary_min));
        if (params.salary_max) qp.set('maximumSalary', String(params.salary_max));
        if (params.permanent !== undefined) qp.set('permanent', String(params.permanent));
        if (params.contract !== undefined) qp.set('contract', String(params.contract));
        if (params.full_time !== undefined) qp.set('fullTime', String(params.full_time));
        if (params.part_time !== undefined) qp.set('partTime', String(params.part_time));
        const take = Math.min(Number(params.limit) || 25, 100);
        qp.set('resultsToTake', String(take));
        if (params.skip) qp.set('resultsToSkip', String(params.skip));
        return {
          url: `${this.baseUrl}/search?${qp.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'reed.details': {
        const jobId = String(params.job_id);
        return {
          url: `${this.baseUrl}/jobs/${encodeURIComponent(jobId)}`,
          method: 'GET',
          headers,
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
      case 'reed.search':
        return this.parseSearch(body);
      case 'reed.details':
        return this.parseDetail(body);
      default:
        return body;
    }
  }

  private parseSearch(body: Record<string, unknown>): ReedSearchOutput {
    const results = (body.results ?? []) as ReedSearchJob[];
    return {
      jobs: results.map((j) => ({
        id: j.jobId,
        title: j.jobTitle ?? '',
        company: j.employerName ?? '',
        location: j.locationName ?? '',
        salary_min: j.minimumSalary,
        salary_max: j.maximumSalary,
        currency: j.currency ?? 'GBP',
        posted: j.date ?? '',
        applications: j.applications ?? 0,
        url: j.jobUrl ?? '',
      })),
      total: Number(body.totalResults) || 0,
      count: results.length,
    };
  }

  private parseDetail(body: Record<string, unknown>): ReedDetailOutput {
    const j = body as unknown as ReedJobDetail;
    return {
      id: j.jobId,
      title: j.jobTitle ?? '',
      company: j.employerName ?? '',
      location: j.locationName ?? '',
      salary: j.salary ?? '',
      salary_type: j.salaryType ?? '',
      salary_min: j.yearlyMinimumSalary ?? j.minimumSalary,
      salary_max: j.yearlyMaximumSalary ?? j.maximumSalary,
      currency: j.currency ?? 'GBP',
      contract_type: j.contractType ?? '',
      full_time: j.fullTime ?? false,
      posted: j.datePosted ?? '',
      expires: j.expirationDate ?? '',
      applications: j.applicationCount ?? 0,
      url: j.jobUrl ?? '',
      external_url: j.externalUrl ?? null,
      description: stripHtml(j.jobDescription ?? '').slice(0, 2000),
    };
  }
}
