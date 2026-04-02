import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  GitHubRepo,
  GitHubUser,
  GitHubSearchOutput,
  GitHubUserOutput,
  GitHubRepoOutput,
} from './types';

/**
 * GitHub API adapter (UC-332).
 *
 * Supported tools:
 *   github.search_repos → GET /search/repositories
 *   github.user         → GET /users/{username}
 *   github.repo         → GET /repos/{owner}/{repo}
 *
 * Auth: token (PAT) in Authorization header. 5,000 req/hour.
 * Read-only public data. #1 demand category in MCP ecosystem.
 */
export class GitHubApiAdapter extends BaseAdapter {
  private readonly token: string;

  constructor(token: string) {
    super({
      provider: 'github-api',
      baseUrl: 'https://api.github.com',
    });
    this.token = token;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Authorization: `token ${this.token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'APIbase-MCP/1.0',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    switch (req.toolId) {
      case 'github.search_repos': {
        const q = encodeURIComponent(String(params.query || ''));
        const sort = String(params.sort || 'stars');
        const perPage = Math.min(Number(params.limit) || 10, 30);
        return {
          url: `${this.baseUrl}/search/repositories?q=${q}&sort=${sort}&per_page=${perPage}`,
          method: 'GET',
          headers,
        };
      }

      case 'github.user': {
        const username = encodeURIComponent(String(params.username));
        return {
          url: `${this.baseUrl}/users/${username}`,
          method: 'GET',
          headers,
        };
      }

      case 'github.repo': {
        const owner = encodeURIComponent(String(params.owner));
        const repo = encodeURIComponent(String(params.repo));
        return {
          url: `${this.baseUrl}/repos/${owner}/${repo}`,
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
      case 'github.search_repos':
        return this.parseSearch(body);
      case 'github.user':
        return this.parseUser(body);
      case 'github.repo':
        return this.parseRepo(body);
      default:
        return body;
    }
  }

  private parseSearch(body: Record<string, unknown>): GitHubSearchOutput {
    const items = (body.items ?? []) as GitHubRepo[];
    return {
      repos: items.map((r) => ({
        name: r.full_name ?? '',
        description: r.description ?? '',
        url: r.html_url ?? '',
        stars: r.stargazers_count ?? 0,
        forks: r.forks_count ?? 0,
        language: r.language ?? '',
        topics: r.topics ?? [],
        updated: r.updated_at ?? '',
        license: r.license?.spdx_id ?? '',
        owner: r.owner?.login ?? '',
      })),
      total: Number(body.total_count) || 0,
      count: items.length,
    };
  }

  private parseUser(body: Record<string, unknown>): GitHubUserOutput {
    const u = body as unknown as GitHubUser;
    return {
      login: u.login ?? '',
      name: u.name ?? '',
      bio: u.bio ?? '',
      repos: u.public_repos ?? 0,
      followers: u.followers ?? 0,
      following: u.following ?? 0,
      url: u.html_url ?? '',
      avatar: u.avatar_url ?? '',
      company: u.company ?? '',
      location: u.location ?? '',
      joined: u.created_at ?? '',
    };
  }

  private parseRepo(body: Record<string, unknown>): GitHubRepoOutput {
    const r = body as unknown as GitHubRepo;
    return {
      name: r.full_name ?? '',
      description: r.description ?? '',
      url: r.html_url ?? '',
      stars: r.stargazers_count ?? 0,
      forks: r.forks_count ?? 0,
      language: r.language ?? '',
      topics: r.topics ?? [],
      license: r.license?.spdx_id ?? '',
      owner: r.owner?.login ?? '',
      updated: r.updated_at ?? '',
    };
  }
}
