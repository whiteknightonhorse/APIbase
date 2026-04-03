import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  NpmPackageManifest,
  NpmDownloadsResponse,
  NpmSearchResponse,
  NpmAbbreviatedManifest,
  NpmPackageOutput,
  NpmDownloadsOutput,
  NpmSearchOutput,
  NpmVersionsOutput,
} from './types';

/**
 * npm Registry adapter (UC-344).
 *
 * Supported tools:
 *   npm.package_info → package metadata (per-version, ~3KB)
 *   npm.downloads    → download statistics
 *   npm.search       → full-text package search
 *   npm.versions     → all versions list (abbreviated metadata)
 *
 * Auth: None. Fully public API, unlimited, no key required.
 * Two hosts: registry.npmjs.org (metadata) + api.npmjs.org (downloads).
 */
export class NpmAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'npm', baseUrl: 'https://registry.npmjs.org' });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'npm.package_info': {
        const pkg = encodeURIComponent(String(params.package));
        const version = params.version ? String(params.version) : 'latest';
        return {
          url: `https://registry.npmjs.org/${pkg}/${encodeURIComponent(version)}`,
          method: 'GET',
          headers,
        };
      }

      case 'npm.downloads': {
        const pkg = encodeURIComponent(String(params.package));
        const period = String(params.period || 'last-week');
        return {
          url: `https://api.npmjs.org/downloads/point/${period}/${pkg}`,
          method: 'GET',
          headers,
        };
      }

      case 'npm.search': {
        const qp = new URLSearchParams();
        qp.set('text', String(params.query));
        qp.set('size', String(Math.min(Number(params.size) || 10, 20)));
        return {
          url: `https://registry.npmjs.org/-/v1/search?${qp.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'npm.versions': {
        const pkg = encodeURIComponent(String(params.package));
        return {
          url: `https://registry.npmjs.org/${pkg}`,
          method: 'GET',
          headers: {
            ...headers,
            Accept: 'application/vnd.npm.install-v1+json',
          },
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
    switch (req.toolId) {
      case 'npm.package_info':
        return this.parsePackageInfo(raw.body as NpmPackageManifest);
      case 'npm.downloads':
        return this.parseDownloads(raw.body as NpmDownloadsResponse);
      case 'npm.search':
        return this.parseSearch(raw.body as NpmSearchResponse);
      case 'npm.versions':
        return this.parseVersions(raw.body as NpmAbbreviatedManifest);
      default:
        return raw.body;
    }
  }

  private parsePackageInfo(data: NpmPackageManifest): NpmPackageOutput {
    const author = typeof data.author === 'string' ? data.author : (data.author?.name ?? '');
    const repoUrl =
      typeof data.repository === 'string'
        ? data.repository
        : (data.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, '') ?? '');

    return {
      name: data.name,
      version: data.version,
      description: data.description ?? '',
      license: data.license ?? 'UNLICENSED',
      homepage: data.homepage ?? '',
      repository: repoUrl,
      author,
      maintainers: (data.maintainers ?? []).map((m) => m.name),
      keywords: data.keywords ?? [],
      dependencies: data.dependencies ?? {},
      dev_dependencies_count: Object.keys(data.devDependencies ?? {}).length,
      peer_dependencies: data.peerDependencies ?? {},
      engines: data.engines ?? {},
      deprecated: data.deprecated ?? null,
    };
  }

  private parseDownloads(data: NpmDownloadsResponse): NpmDownloadsOutput {
    return {
      package: data.package,
      downloads: data.downloads,
      period_start: data.start,
      period_end: data.end,
    };
  }

  private parseSearch(data: NpmSearchResponse): NpmSearchOutput {
    return {
      total: data.total,
      results: data.objects.map((o) => ({
        name: o.package.name,
        version: o.package.version,
        description: o.package.description ?? '',
        license: o.package.license ?? '',
        date: o.package.date,
        publisher: o.package.publisher?.username ?? '',
        keywords: o.package.keywords ?? [],
        score: Math.round(o.score.final * 100) / 100,
        quality: Math.round(o.score.detail.quality * 100) / 100,
        popularity: Math.round(o.score.detail.popularity * 100) / 100,
        maintenance: Math.round(o.score.detail.maintenance * 100) / 100,
        downloads: o.downloads ?? null,
        dependents: o.dependents ?? null,
        npm_url: o.package.links?.npm ?? `https://www.npmjs.com/package/${o.package.name}`,
      })),
    };
  }

  private parseVersions(data: NpmAbbreviatedManifest): NpmVersionsOutput {
    const allVersions = Object.keys(data.versions);
    // Return last 50 versions (most recent first)
    const recent = allVersions.slice(-50).reverse();

    return {
      name: data.name,
      dist_tags: data['dist-tags'],
      total_versions: allVersions.length,
      modified: data.modified,
      versions: recent.map((v) => ({
        version: v,
        deprecated: !!data.versions[v]?.deprecated,
      })),
    };
  }
}
