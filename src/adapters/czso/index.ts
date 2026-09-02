import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { CzsoPackageListResponse, CzsoPackageShowResponse, CzsoResource } from './types';

const CATALOG_BASE = 'https://vdb.czso.cz/pll/eweb';
const HEADERS = { 'User-Agent': 'APIbase/1.0 (https://apibase.pro)', Accept: '*/*' };

const DATASET_ID_RE = /^[A-Za-z0-9_-]{1,60}$/;
const MAX_LIST_PAGE = 20;
const MAX_CSV_BYTES = 20_000_000;
const MAX_DATA_LIMIT = 500;

/**
 * Czech Statistical Office (CZSO) Public Database "VDB" open-data catalog adapter (UC-664).
 *
 * vdb.czso.cz/pll/eweb exposes a CKAN-shaped `package_list` / `package_show` metadata catalog
 * (DCAT-AP-CZ / data.gov.cz open-data standard) over ~1000 statistical datasets (demographics,
 * prices, census, territorial). It is NOT a queryable statistics API: `package_list` returns a
 * bare array of dataset ids with no titles and no pagination (fixed at ~1000, query params like
 * limit/offset/rows all 404), and `package_search` / `current_package_list_with_resources` /
 * `group_list` / `tag_list` are all 404 — there is no full-text search endpoint, confirmed live.
 * Each dataset's actual data is a static file (`resources[].url`), usually `text/csv` but
 * sometimes a `.zip` (no unzip dependency available in this project — those datasets are
 * rejected with a pointer to the raw download URL rather than silently failing). CSV column
 * names vary per dataset (e.g. "vuzemi_txt" vs "uzemi_txt" for territory, "vuk"/"ucel_kod"/
 * "reprcen_kod" for indicator code) — there is no shared schema across datasets, so
 * `czso.dataset_data` always returns the raw header and takes a generic `filter_column` +
 * `filter_value` pair validated against that dataset's own header, instead of guessing
 * domain-specific field names.
 *
 *   czso.dataset_list     -> GET package_list (~1000 ids, no titles), then fans out
 *                             package_show for one page (<=20 ids) to attach title/coverage —
 *                             same small-fan-out pattern as gebco/hackernews. Optional
 *                             id_prefix substring filter narrows the id list before paging.
 *   czso.dataset_metadata -> GET package_show?id=... — title, description, update frequency,
 *                             temporal coverage, and the resource list (url + format) an agent
 *                             needs before calling dataset_data.
 *   czso.dataset_data     -> two-step: package_show to resolve the dataset's primary CSV
 *                             resource url, then fetch + parse that CSV (quote-aware, comma
 *                             separated, header row required — confirmed consistent across every
 *                             sampled dataset). Rows capped 1-500 (default 50) after optional
 *                             filter_column/filter_value filtering; largest CSV observed live was
 *                             ~14MB (avg consumer prices dump), so maxResponseBytes-equivalent for
 *                             the raw fetch is a locally enforced 20MB cap (BaseAdapter's own
 *                             streaming JSON path is bypassed entirely, same as meteostat/
 *                             bundesbank-timeseries, since these endpoints return CSV, not JSON).
 *
 * Auth: none. Publisher: Český statistický úřad (Czech Statistical Office). License: Czech
 * open-data "volný přístup k datům" (free/open access), confirmed on every sampled dataset's
 * `license_link` (https://portal.gov.cz/portal/ostatni/volny-pristup-k-ds.html) — no resale
 * restriction, comparable to UK OGL v3.0 used by other government-open-data providers here.
 */
export class CzsoAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'czso', baseUrl: CATALOG_BASE, timeoutMs: 20_000 });
  }

  // All logic lives in call() — buildRequest/parseResponse are required stubs (CSV + a
  // CKAN-shaped JSON catalog, not the single-JSON-shape BaseAdapter.call() assumes).
  protected buildRequest(_req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    throw new Error('CzsoAdapter.buildRequest() should not be called directly');
  }

  protected parseResponse(raw: ProviderRawResponse): unknown {
    return raw.body;
  }

  override async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    const start = performance.now();
    const params = (req.params ?? {}) as Record<string, unknown>;

    switch (req.toolId) {
      case 'czso.dataset_list':
        return this.respond(await this.handleDatasetList(params, req), start);
      case 'czso.dataset_metadata':
        return this.respond(await this.handleDatasetMetadata(params, req), start);
      case 'czso.dataset_data':
        return this.respond(await this.handleDatasetData(params, req), start);
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

  // ---------------------------------------------------------------------------
  // Tool handlers
  // ---------------------------------------------------------------------------

  private async handleDatasetList(
    params: Record<string, unknown>,
    req: ProviderRequest,
  ): Promise<unknown> {
    const idPrefix = String(params.id_prefix ?? '')
      .trim()
      .toLowerCase();
    const limit = clampInt(params.limit, 1, MAX_LIST_PAGE, 10);
    const offset = clampInt(params.offset, 0, 100_000, 0);

    const list = await this.fetchJson<CzsoPackageListResponse>(`${CATALOG_BASE}/package_list`, req);
    const allIds = list.result ?? [];
    const matched = idPrefix ? allIds.filter((id) => id.toLowerCase().includes(idPrefix)) : allIds;
    const page = matched.slice(offset, offset + limit);

    const datasets = await Promise.all(
      page.map(async (id) => {
        try {
          const meta = await this.fetchJson<CzsoPackageShowResponse>(
            `${CATALOG_BASE}/package_show?id=${encodeURIComponent(id)}`,
            req,
          );
          if (!meta.success || !meta.result) {
            return { id, title: null, temporal_start: null, temporal_end: null };
          }
          return {
            id,
            title: meta.result.title,
            temporal_start: meta.result.temporal_start ?? null,
            temporal_end: meta.result.temporal_end ?? null,
          };
        } catch {
          return { id, title: null, temporal_start: null, temporal_end: null };
        }
      }),
    );

    return {
      id_prefix: idPrefix || null,
      total_matched: matched.length,
      offset,
      limit,
      datasets,
      note: 'CZSO has no full-text dataset search — use id_prefix to narrow by dataset id, or page through the full catalog with offset.',
    };
  }

  private async handleDatasetMetadata(
    params: Record<string, unknown>,
    req: ProviderRequest,
  ): Promise<unknown> {
    const datasetId = requireDatasetId(params.dataset_id, req);
    const meta = await this.fetchPackageShow(datasetId, req);

    return {
      id: meta.name,
      title: meta.title,
      description: meta.notes ?? null,
      update_frequency: meta.frequency ?? null,
      temporal_start: meta.temporal_start ?? null,
      temporal_end: meta.temporal_end ?? null,
      tags: (meta.tags ?? []).map((t) => t.display_name ?? t.name),
      resources: (meta.resources ?? []).map((r) => ({
        name: r.name ?? null,
        url: r.url ?? null,
        format: r.format ?? null,
      })),
    };
  }

  private async handleDatasetData(
    params: Record<string, unknown>,
    req: ProviderRequest,
  ): Promise<unknown> {
    const datasetId = requireDatasetId(params.dataset_id, req);
    const filterColumn = params.filter_column ? String(params.filter_column).trim() : '';
    const filterValue = params.filter_value ? String(params.filter_value).trim().toLowerCase() : '';
    const limit = clampInt(params.limit, 1, MAX_DATA_LIMIT, 50);
    const offset = clampInt(params.offset, 0, 1_000_000, 0);

    if (filterColumn && !filterValue) {
      throw inputRejected(
        this.provider,
        req,
        'filter_value is required when filter_column is set.',
      );
    }

    const meta = await this.fetchPackageShow(datasetId, req);
    const resource = pickCsvResource(meta.resources ?? []);
    if (!resource) {
      const firstUrl = meta.resources?.[0]?.url;
      throw inputRejected(
        this.provider,
        req,
        `Dataset "${datasetId}" has no CSV resource (unsupported format: ` +
          `${meta.resources?.[0]?.format ?? 'unknown'}). Use czso.dataset_metadata to get the ` +
          `raw download URL${firstUrl ? ` (${firstUrl})` : ''} instead.`,
      );
    }

    const text = await this.fetchCsvText(resource.url as string, req);
    const { header, rows } = parseCsv(text);
    if (header.length === 0) {
      throw upstreamInvalid(this.provider, req, 'CSV resource');
    }

    let filterIndex = -1;
    if (filterColumn) {
      filterIndex = header.findIndex((h) => h.toLowerCase() === filterColumn.toLowerCase());
      if (filterIndex === -1) {
        throw inputRejected(
          this.provider,
          req,
          `Unknown filter_column "${filterColumn}" for dataset "${datasetId}". ` +
            `Available columns: ${header.join(', ')}.`,
        );
      }
    }

    const filtered =
      filterIndex === -1
        ? rows
        : rows.filter((r) => (r[filterIndex] ?? '').toLowerCase().includes(filterValue));

    const page = filtered.slice(offset, offset + limit);

    return {
      dataset_id: datasetId,
      title: meta.title,
      header,
      matched: filtered.length,
      returned: page.length,
      offset,
      limit,
      rows: page,
    };
  }

  // ---------------------------------------------------------------------------
  // Fetch helpers
  // ---------------------------------------------------------------------------

  private respond(body: unknown, start: number): ProviderRawResponse {
    return {
      status: 200,
      headers: {},
      body,
      durationMs: Math.round(performance.now() - start),
      byteLength: JSON.stringify(body).length,
    };
  }

  private async fetchPackageShow(datasetId: string, req: ProviderRequest) {
    const meta = await this.fetchJson<CzsoPackageShowResponse>(
      `${CATALOG_BASE}/package_show?id=${encodeURIComponent(datasetId)}`,
      req,
    );
    if (!meta.success || !meta.result) {
      throw inputRejected(
        this.provider,
        req,
        `Unknown dataset_id "${datasetId}" — use czso.dataset_list to find a valid id.`,
      );
    }
    return meta.result;
  }

  private async fetchJson<T>(url: string, req: ProviderRequest): Promise<T> {
    const response = await this.rawFetch(url, req);
    try {
      return (await response.json()) as T;
    } catch {
      throw upstreamInvalid(this.provider, req, 'catalog response');
    }
  }

  private async fetchCsvText(url: string, req: ProviderRequest): Promise<string> {
    const response = await this.rawFetch(url, req);
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > MAX_CSV_BYTES) {
      throw {
        code: ProviderErrorCode.RESPONSE_TOO_LARGE,
        httpStatus: 502,
        message: `CZSO data file exceeded the ${MAX_CSV_BYTES} byte limit (${contentLength} bytes).`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }
    return response.text();
  }

  private async rawFetch(url: string, req: ProviderRequest): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: HEADERS,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === 'TimeoutError';
      throw {
        code: isTimeout ? ProviderErrorCode.TIMEOUT : ProviderErrorCode.UNAVAILABLE,
        httpStatus: isTimeout ? 504 : 502,
        message: isTimeout
          ? `Provider call timed out after ${this.timeoutMs}ms`
          : `Provider connection failed: ${error instanceof Error ? error.message : 'unknown'}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    if (response.status === 404) {
      throw inputRejected(this.provider, req, 'Resource not found.');
    }
    if (response.status === 429) {
      throw {
        code: ProviderErrorCode.RATE_LIMIT,
        httpStatus: 429,
        message: 'CZSO catalog rate limit exceeded',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }
    if (response.status >= 500) {
      throw {
        code: ProviderErrorCode.UNAVAILABLE,
        httpStatus: 502,
        message: `CZSO catalog returned ${response.status}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }
    if (response.status >= 400) {
      throw inputRejected(
        this.provider,
        req,
        `CZSO catalog rejected the request (HTTP ${response.status}).`,
      );
    }

    return response;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ParsedCsv {
  header: string[];
  rows: string[][];
}

/** Quote-aware comma-split CSV parser (fields may contain quoted commas, e.g. town names). */
function parseCsv(text: string): ParsedCsv {
  const lines = text
    .split('\n')
    .map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l))
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { header: [], rows: [] };
  }
  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        fields.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    fields.push(cur);
    return fields;
  };
  const header = parseLine(lines[0] as string);
  const rows = lines.slice(1).map(parseLine);
  return { header, rows };
}

function pickCsvResource(resources: CzsoResource[]): CzsoResource | undefined {
  return resources.find((r) => /csv/i.test(r.format ?? '') && !!r.url);
}

function requireDatasetId(value: unknown, req: ProviderRequest): string {
  if (typeof value !== 'string' || !DATASET_ID_RE.test(value)) {
    throw inputRejected(
      'czso',
      req,
      'Parameter "dataset_id" is required and must match CZSO id format (letters, digits, ' +
        'underscore, hyphen, e.g. "130141r25" or "sldb2021_vzdelani_vek_pohlavi") — use ' +
        'czso.dataset_list to find a valid id.',
    );
  }
  return value;
}

function inputRejected(provider: string, req: ProviderRequest, message: string) {
  return {
    code: ProviderErrorCode.INPUT_REJECTED,
    httpStatus: 422,
    message,
    provider,
    toolId: req.toolId,
    durationMs: 0,
  };
}

function upstreamInvalid(provider: string, req: ProviderRequest, what: string) {
  return {
    code: ProviderErrorCode.INVALID_RESPONSE,
    httpStatus: 502,
    message: `CZSO catalog returned an unparseable ${what}.`,
    provider,
    toolId: req.toolId,
    durationMs: 0,
  };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
