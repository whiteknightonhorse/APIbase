import { BaseAdapter } from '../base.adapter';
import { logger } from '../../config/logger';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
  PROVIDER_TIMEOUT_MS,
  PROVIDER_MAX_RETRIES,
  PROVIDER_BACKOFF_BASE_MS,
  PROVIDER_MAX_RESPONSE_BYTES,
} from '../../types/provider';
import type { MrdsFeature } from './types';

const MRDS_BASE = 'https://mrdata.usgs.gov';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * USGS Mineral Resources Data System (MRDS) adapter (UC-607).
 *
 * Supported tools (read-only):
 *   usgs-mrds.search_by_area    → GET /services/wfs/mrds (BBOX spatial filter)
 *
 * Auth: None (US Government open data, public domain — USGS Mineral Resources Program).
 *
 * This layer is served ONLY as WFS 2.0.0 / GML 3.2 — the service rejects
 * outputFormat=application/json and outputFormat=geojson (verified live), so
 * BaseAdapter.call()'s JSON.parse() would break every response. call() is
 * overridden here (same pattern as education adapter's arXiv Atom-XML path)
 * to fetch text and hand-parse the flat GML feature list with parseWfsXml().
 *
 * SCOPE REDUCTION — RELIABILITY FINDING (verified live before onboarding):
 * this MapServer-backed WFS layer silently IGNORES CQL_FILTER entirely — a
 * `site_name LIKE '%Comstock%'` or `code_list LIKE '%AU%'` filter (and even a
 * filter for a guaranteed-nonexistent string) returns the exact same first-N
 * unfiltered rows every time, with no error. A `dep_id`/`dev_stat` `=` filter
 * behaves the same way. This is a data-integrity risk, not just an
 * inconvenience — a "search" tool built on it would silently return WRONG
 * results instead of failing loudly. The originally-planned `usgs-mrds.search`
 * (site name / commodity text search) tool was dropped for this reason — same
 * class of live-reliability scope reduction as UC-440 Ensembl. Only the native
 * WFS `BBOX` spatial filter was confirmed to filter correctly (verified with a
 * real bounding box vs. an empty-ocean bounding box returning 0 results), so
 * this adapter exposes ONLY that one query mode.
 */
export class UsgsMrdsAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'usgs-mrds',
      baseUrl: MRDS_BASE,
      timeoutMs: 15_000,
    });
  }

  /**
   * Override call(): this layer only serves GML/XML, never JSON, so
   * BaseAdapter.call()'s JSON.parse() must be bypassed entirely.
   */
  async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    const built = this.buildRequest(req);
    let lastError: unknown;

    for (let attempt = 0; attempt <= PROVIDER_MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delayMs = PROVIDER_BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        logger.info(
          { provider: this.provider, tool_id: req.toolId, attempt: attempt + 1, delay_ms: delayMs },
          'Retrying provider call',
        );
      }

      const start = performance.now();
      try {
        const response = await fetch(built.url, {
          method: built.method,
          headers: built.headers,
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS + 5_000),
        });

        const bodyText = await response.text();
        const durationMs = Math.round(performance.now() - start);
        const byteLength = Buffer.byteLength(bodyText, 'utf8');

        if (byteLength > PROVIDER_MAX_RESPONSE_BYTES) {
          throw {
            code: ProviderErrorCode.RESPONSE_TOO_LARGE,
            httpStatus: 502,
            message: `Provider response exceeded ${PROVIDER_MAX_RESPONSE_BYTES} byte limit`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs,
          };
        }

        if (response.status === 429) {
          throw {
            code: ProviderErrorCode.RATE_LIMIT,
            httpStatus: 429,
            message: 'USGS MRDS WFS rate limit exceeded',
            provider: this.provider,
            toolId: req.toolId,
            durationMs,
          };
        }

        if (response.status >= 500) {
          throw {
            code: ProviderErrorCode.UNAVAILABLE,
            httpStatus: 502,
            message: `Provider returned ${response.status}`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs,
          };
        }

        if (response.status >= 400) {
          const detail = bodyText.length > 0 ? `: ${bodyText.slice(0, 500)}` : '';
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: `Provider rejected the request (HTTP ${response.status})${detail}`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs,
          };
        }

        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });

        return {
          status: response.status,
          headers,
          body: this.parseResponse(
            { status: response.status, headers, body: bodyText, durationMs, byteLength },
            req,
          ),
          durationMs,
          byteLength,
        };
      } catch (error) {
        lastError = error;
        const providerError = error as { code?: string };
        if (
          providerError.code !== ProviderErrorCode.TIMEOUT &&
          providerError.code !== ProviderErrorCode.UNAVAILABLE
        ) {
          throw error;
        }
      }
    }

    throw lastError;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'text/xml' };

    switch (req.toolId) {
      case 'usgs-mrds.search_by_area':
        return this.buildSearchByAreaRequest(params, headers);
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

  /** Not used directly — call() is overridden to parse XML instead of JSON. */
  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const xml = String(raw.body ?? '');
    const limit = clampLimit((req.params as Record<string, unknown>)?.limit);
    const features = parseWfsXml(xml).slice(0, limit);
    return {
      count: features.length,
      deposits: features,
    };
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildSearchByAreaRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const minLat = Number(params.min_lat);
    const minLon = Number(params.min_lon);
    const maxLat = Number(params.max_lat);
    const maxLon = Number(params.max_lon);
    const limit = clampLimit(params.limit);

    if (minLat >= maxLat || minLon >= maxLon) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: 'min_lat must be less than max_lat, and min_lon must be less than max_lon.',
        provider: this.provider,
        toolId: 'usgs-mrds.search_by_area',
        durationMs: 0,
      };
    }

    const qs = new URLSearchParams({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeName: 'mrds',
      count: String(limit),
      BBOX: `${minLat},${minLon},${maxLat},${maxLon}`,
    });

    return { url: `${this.baseUrl}/services/wfs/mrds?${qs.toString()}`, method: 'GET', headers };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampLimit(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.trunc(n), MAX_LIMIT);
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function extractTag(chunk: string, tag: string): string {
  const match = chunk.match(new RegExp(`<ms:${tag}>([^<]*)</ms:${tag}>`));
  return match ? decodeXmlEntities(match[1].trim()) : '';
}

/** Regex-based GML feature parser (same pattern as education adapter's arXiv Atom parser). */
function parseWfsXml(xml: string): MrdsFeature[] {
  const features: MrdsFeature[] = [];
  const memberRegex = /<ms:mrds\b[^>]*>([\s\S]*?)<\/ms:mrds>/g;
  let match: RegExpExecArray | null;

  while ((match = memberRegex.exec(xml)) !== null) {
    const chunk = match[1];
    const posMatch = chunk.match(/<gml:pos>\s*([-\d.]+)\s+([-\d.]+)\s*<\/gml:pos>/);
    const codeList = extractTag(chunk, 'code_list');

    features.push({
      dep_id: extractTag(chunk, 'dep_id'),
      site_name: extractTag(chunk, 'site_name'),
      dev_status: extractTag(chunk, 'dev_stat'),
      commodities: codeList.split(/\s+/).filter(Boolean),
      fips_code: extractTag(chunk, 'fips_code'),
      huc_code: extractTag(chunk, 'huc_code'),
      quad_code: extractTag(chunk, 'quad_code'),
      latitude: posMatch ? Number(posMatch[1]) : null,
      longitude: posMatch ? Number(posMatch[2]) : null,
      detail_url: extractTag(chunk, 'url'),
    });
  }

  return features;
}
