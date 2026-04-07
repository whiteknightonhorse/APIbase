import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  DepsdevPackageOutput,
  DepsdevDependenciesOutput,
  DepsdevAdvisoriesOutput,
  DepsdevDepNode,
  DepsdevAdvisory,
} from './types';

const DEPS_BASE = 'https://api.deps.dev/v3alpha';

/** Map our lowercase system names to deps.dev system identifiers */
const SYSTEM_MAP: Record<string, string> = {
  npm: 'npm',
  pypi: 'pypi',
  go: 'go',
  maven: 'maven',
  cargo: 'cargo',
  nuget: 'nuget',
};

/**
 * deps.dev adapter (UC-347).
 *
 * Google Open Source Insights — transitive dependency graphs,
 * advisories, OpenSSF scores across 6 ecosystems.
 * Apache 2.0, no auth, unlimited.
 */
export class DepsdevAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'depsdev', baseUrl: DEPS_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const system = SYSTEM_MAP[String(params.system)] ?? 'npm';
    const pkg = encodeURIComponent(String(params.package));
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'depsdev.package':
        return {
          url: `${DEPS_BASE}/systems/${system}/packages/${pkg}`,
          method: 'GET',
          headers,
        };

      case 'depsdev.dependencies': {
        const version = encodeURIComponent(String(params.version));
        return {
          url: `${DEPS_BASE}/systems/${system}/packages/${pkg}/versions/${version}:dependencies`,
          method: 'GET',
          headers,
        };
      }

      case 'depsdev.advisories': {
        const version = encodeURIComponent(String(params.version));
        return {
          url: `${DEPS_BASE}/systems/${system}/packages/${pkg}/versions/${version}`,
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
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'depsdev.package':
        return this.parsePackage(body);
      case 'depsdev.dependencies':
        return this.parseDependencies(body, params);
      case 'depsdev.advisories':
        return this.parseAdvisories(body, params);
      default:
        return body;
    }
  }

  private parsePackage(body: Record<string, unknown>): DepsdevPackageOutput {
    const pkg = (body.package ?? {}) as Record<string, unknown>;
    const versions = (body.versions ?? []) as Record<string, unknown>[];
    const defaultVersion = (body.defaultVersion ?? '') as string;

    return {
      name: String(pkg.name ?? ''),
      system: String(pkg.system ?? '').toLowerCase(),
      default_version: defaultVersion,
      total_versions: versions.length,
      versions: versions
        .slice(-30)
        .reverse()
        .map((v) => {
          const vk = (v.versionKey ?? {}) as Record<string, unknown>;
          return {
            version: String(vk.version ?? ''),
            published: String(v.publishedAt ?? '').slice(0, 10),
            is_default: String(vk.version ?? '') === defaultVersion,
          };
        }),
    };
  }

  private parseDependencies(
    body: Record<string, unknown>,
    params: Record<string, unknown>,
  ): DepsdevDependenciesOutput {
    const nodes = (body.nodes ?? []) as Record<string, unknown>[];

    return {
      package: String(params.package),
      version: String(params.version),
      system: String(params.system),
      total_dependencies: Math.max(nodes.length - 1, 0),
      dependencies: nodes.slice(1, 51).map((n): DepsdevDepNode => {
        const vk = (n.versionKey ?? {}) as Record<string, unknown>;
        return {
          system: String(vk.system ?? '').toLowerCase(),
          name: String(vk.name ?? ''),
          version: String(vk.version ?? ''),
          relation: String(n.relation ?? 'DIRECT'),
        };
      }),
    };
  }

  private parseAdvisories(
    body: Record<string, unknown>,
    params: Record<string, unknown>,
  ): DepsdevAdvisoriesOutput {
    const advisories = (body.advisoryKeys ?? []) as Record<string, unknown>[];

    return {
      package: String(params.package),
      version: String(params.version),
      system: String(params.system),
      total_advisories: advisories.length,
      advisories: advisories.slice(0, 20).map(
        (a): DepsdevAdvisory => ({
          id: String(a.id ?? ''),
          url: `https://osv.dev/vulnerability/${String(a.id ?? '')}`,
          title: String(a.id ?? ''),
          aliases: [],
        }),
      ),
    };
  }
}
