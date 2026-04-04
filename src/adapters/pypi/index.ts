import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { PypiPackageOutput, PypiReleasesOutput, PypiReleaseEntry } from './types';

/**
 * PyPI adapter (UC-346).
 *
 * Python Package Index — 550K+ packages. No auth, unlimited.
 * Complements npm (UC-344) for polyglot package intelligence.
 */
export class PypiAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'pypi', baseUrl: 'https://pypi.org' });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const pkg = encodeURIComponent(String(params.package));
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'pypi.package_info': {
        const version = params.version ? encodeURIComponent(String(params.version)) : null;
        const path = version ? `/pypi/${pkg}/${version}/json` : `/pypi/${pkg}/json`;
        return { url: `https://pypi.org${path}`, method: 'GET', headers };
      }

      case 'pypi.releases':
        return { url: `https://pypi.org/pypi/${pkg}/json`, method: 'GET', headers };

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
      case 'pypi.package_info':
        return this.parsePackageInfo(body);
      case 'pypi.releases':
        return this.parseReleases(body);
      default:
        return body;
    }
  }

  private parsePackageInfo(body: Record<string, unknown>): PypiPackageOutput {
    const info = (body.info ?? {}) as Record<string, unknown>;
    const urls = (info.project_urls ?? {}) as Record<string, string>;

    return {
      name: String(info.name ?? ''),
      version: String(info.version ?? ''),
      summary: String(info.summary ?? ''),
      description_type: String(info.description_content_type ?? 'text/plain'),
      license: String(info.license ?? ''),
      author: String(info.author ?? info.maintainer ?? ''),
      author_email: String(info.author_email ?? info.maintainer_email ?? ''),
      homepage: String(info.home_page ?? urls.Homepage ?? urls.homepage ?? ''),
      repository: String(
        urls.Repository ?? urls.Source ?? urls['Source Code'] ?? urls.GitHub ?? '',
      ),
      documentation: String(urls.Documentation ?? urls.Docs ?? ''),
      requires_python: String(info.requires_python ?? ''),
      keywords: info.keywords
        ? String(info.keywords)
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean)
        : [],
      classifiers: ((info.classifiers ?? []) as string[]).slice(0, 20),
      dependencies: ((info.requires_dist ?? []) as string[]).slice(0, 30),
    };
  }

  private parseReleases(body: Record<string, unknown>): PypiReleasesOutput {
    const info = (body.info ?? {}) as Record<string, unknown>;
    const releases = (body.releases ?? {}) as Record<string, Record<string, unknown>[]>;
    const allVersions = Object.keys(releases);

    // Last 50 versions, most recent first
    const recent = allVersions.slice(-50).reverse();

    const versions: PypiReleaseEntry[] = recent.map((v) => {
      const files = releases[v] ?? [];
      const first = files[0] as Record<string, unknown> | undefined;
      const uploadDate = first?.upload_time ? String(first.upload_time).slice(0, 10) : '';
      const yanked = files.some((f) => (f as Record<string, unknown>).yanked === true);
      const fileTypes = [
        ...new Set(files.map((f) => String((f as Record<string, unknown>).packagetype ?? ''))),
      ].filter(Boolean);

      return {
        version: v,
        upload_date: uploadDate,
        yanked,
        file_types: fileTypes,
      };
    });

    return {
      name: String(info.name ?? ''),
      latest: String(info.version ?? ''),
      total_versions: allVersions.length,
      versions,
    };
  }
}
