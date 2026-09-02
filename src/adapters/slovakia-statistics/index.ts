import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  SkCategory,
  SkCollectionItem,
  SkCollectionResponse,
  SkDimensionResponse,
  SkDatasetResponse,
} from './types';

const BASE_URL = 'https://data.statistics.sk/api/v2';
const HEADERS = { 'User-Agent': 'APIbase/1.0 (https://apibase.pro)', Accept: 'application/json' };

const MAX_SEARCH_LIMIT = 100;
const MAX_METADATA_DIMS_ENUMERATED = 8; // observed max across all 675 tables (2-8 dims)
const MAX_CATEGORIES_PER_DIM = 300; // safety cap — a handful of geo dims are large (e.g. age: 136)
const MAX_DATA_LIMIT = 1000;
// Live-measured: full collection.json is 565KB / ~3.5s, individual dimension/dataset calls are
// small and fast (<1s). Worst-case dataset_metadata (8 sequential dimension fetches after the
// collection fetch) stays well under this budget.
const ADAPTER_TIMEOUT_MS = 20_000;
// Docs (REST_API_HELP_EN.pdf, "Limitations"): "amount of data transmitted by one URL is a maximum
// of 10000" values. Our own decoded-size guard below is the authoritative cap regardless of what
// upstream actually enforces.
const MAX_RAW_BYTES = 5_000_000;

// Only characters the upstream API's own selection-value syntax uses (comma lists, `a:b` /
// `a:` / `:b` ranges, `lastN`, `*` wildcards, plain codes). No `/`, so no path-segment escape is
// possible — this allow-list IS the injection guard for these values (CWE-116); there is
// deliberately no separate encodeURIComponent() step because encoding would corrupt the `,` `:`
// `*` separators the upstream API requires unescaped in the path.
const SELECTION_VALUE_RE = /^[A-Za-z0-9,:*_-]{1,64}$/;
const CUBE_CODE_RE = /^[a-z0-9]{4,16}$/;

/**
 * Statistical Office of the Slovak Republic ("DATAcube.") JSON-stat REST API adapter (UC-667).
 *
 * data.statistics.sk/api/v2 is a JSON-stat 2.0 REST API (open data, no auth, CC BY 4.0):
 *   1. GET /collection?lang=en                          → flat list of all 675 tables (cube_code
 *                                                          parsed from each item's href, since
 *                                                          cube_code is never a dict key itself)
 *   2. GET /dimension/{cube_code}/{dim_code}?lang=en     → one dimension's full category list
 *   3. GET /dataset/{cube_code}/{val1}/{val2}/...?lang=en → data, one path segment PER SELECTABLE
 *      DIMENSION IN ORDER (NOT the dimension code — this project's onboarding initially got this
 *      backwards: passing dimension NAMES as path segments returns HTTP 200 with an always-empty
 *      cube; the path segments are ELEMENT/VALUE codes, confirmed against REST_API_HELP_EN.pdf).
 *      Selection values support comma lists ("2016,2017"), ranges ("2010:2015", "2010:", ":2015"),
 *      "lastN", and "*" wildcards — see SELECTION_VALUE_RE.
 *
 * There is no catalog/search endpoint beyond the single flat collection (same class of API gap as
 * czso/statistik-austria/hungary-ksh) — dataset_search filters it client-side by label substring.
 * A dimension value with no match returns HTTP 200 with `category: []` and `value: []` (silent
 * empty result, same class as ine-spain/statistik-austria), not an error — handled explicitly.
 *
 *   slovakia-statistics.dataset_search   → GET /collection?lang=en, filtered client-side
 *   slovakia-statistics.dataset_metadata → GET /collection (locate item) + N × GET /dimension/*
 *   slovakia-statistics.dataset_data     → GET /collection (locate item, dim order) + GET /dataset/*,
 *                                            decoded from JSON-stat's flattened row-major `value`
 *                                            array into {dimension_code, dimension_label, value}
 *                                            rows generically (works for any dim count/order)
 */
export class SlovakiaStatisticsAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'slovakia-statistics', baseUrl: BASE_URL, timeoutMs: ADAPTER_TIMEOUT_MS });
  }

  // All logic lives in call() — buildRequest/parseResponse are required stubs. Each tool needs
  // multiple sequential upstream fetches (collection lookup + dimension/dataset fetch), not the
  // single-request shape BaseAdapter.call() assumes; same pattern as czso/hungary-ksh.
  protected buildRequest(_req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    throw new Error('SlovakiaStatisticsAdapter.buildRequest() should not be called directly');
  }

  protected parseResponse(raw: ProviderRawResponse): unknown {
    return raw.body;
  }

  override async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    const start = performance.now();
    const params = (req.params ?? {}) as Record<string, unknown>;

    switch (req.toolId) {
      case 'slovakia-statistics.dataset_search':
        return this.respond(await this.handleDatasetSearch(params, req), start);
      case 'slovakia-statistics.dataset_metadata':
        return this.respond(await this.handleDatasetMetadata(params, req), start);
      case 'slovakia-statistics.dataset_data':
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

  private async handleDatasetSearch(
    params: Record<string, unknown>,
    req: ProviderRequest,
  ): Promise<unknown> {
    const query = params.query ? String(params.query).trim().toLowerCase() : '';
    const limit = clampInt(params.limit, 1, MAX_SEARCH_LIMIT, 50);
    const offset = clampInt(params.offset, 0, 1_000_000, 0);

    const items = await this.fetchCollection(req);
    const matched = query
      ? items.filter(
          (it) =>
            (it.label ?? '').toLowerCase().includes(query) ||
            cubeCodeFromHref(it.href).toLowerCase().includes(query),
        )
      : items;
    const page = matched.slice(offset, offset + limit);

    return {
      query: query || null,
      total_matched: matched.length,
      total_tables: items.length,
      offset,
      limit,
      // ~40 of 675 tables have no "label" field at all (confirmed live upstream data quirk, not a
      // parsing bug) — surfaced as null rather than crashing or silently dropping the table.
      datasets: page.map((it) => ({
        cube_code: cubeCodeFromHref(it.href),
        label: it.label ?? null,
        update: it.update ?? null,
        dimension_codes: Object.keys(it.dimension),
      })),
    };
  }

  private async handleDatasetMetadata(
    params: Record<string, unknown>,
    req: ProviderRequest,
  ): Promise<unknown> {
    const cubeCode = requireCubeCode(params.cube_code, req);
    const item = await this.findCollectionItem(cubeCode, req);

    const dimCodes = Object.keys(item.dimension).slice(0, MAX_METADATA_DIMS_ENUMERATED);
    const dimensions = [];
    for (const dimCode of dimCodes) {
      const dimResp = await this.fetchDimension(cubeCode, dimCode, req);
      const cat = dimResp.category;
      const entries = Array.isArray(cat) ? [] : categoryEntries(cat);
      const truncated = entries.length > MAX_CATEGORIES_PER_DIM;
      dimensions.push({
        code: dimCode,
        note: item.dimension[dimCode]?.note ?? dimResp.note ?? null,
        categories_total: entries.length,
        categories: (truncated ? entries.slice(0, MAX_CATEGORIES_PER_DIM) : entries).map((e) => ({
          code: e.code,
          label: e.label,
        })),
        truncated,
      });
    }

    return {
      cube_code: cubeCode,
      label: item.label ?? null,
      update: item.update ?? null,
      dimensions,
    };
  }

  private async handleDatasetData(
    params: Record<string, unknown>,
    req: ProviderRequest,
  ): Promise<unknown> {
    const cubeCode = requireCubeCode(params.cube_code, req);
    const limit = clampInt(params.limit, 1, MAX_DATA_LIMIT, 200);
    const offset = clampInt(params.offset, 0, 1_000_000, 0);

    const selectionsRaw = params.selections;
    if (!selectionsRaw || typeof selectionsRaw !== 'object' || Array.isArray(selectionsRaw)) {
      throw inputRejected(
        this.provider,
        req,
        'Parameter "selections" is required and must be an object mapping each dimension_code ' +
          '(from slovakia-statistics.dataset_metadata) to a value code, comma list, or range ' +
          '(e.g. {"as1001rs_rok": "2024", "as1001rs_ukaz": "UKAZ01", "as1001rs_poh": "TOTAL"}).',
      );
    }
    const selections = selectionsRaw as Record<string, unknown>;

    const item = await this.findCollectionItem(cubeCode, req);
    const dimCodes = Object.keys(item.dimension);

    const missing = dimCodes.filter((d) => selections[d] === undefined);
    const unknown = Object.keys(selections).filter((k) => !dimCodes.includes(k));
    if (missing.length > 0 || unknown.length > 0) {
      throw inputRejected(
        this.provider,
        req,
        `"selections" must have exactly one entry per dimension of "${cubeCode}". ` +
          `Expected dimensions: [${dimCodes.join(', ')}]. Received: [${Object.keys(selections).join(', ')}]. ` +
          (missing.length > 0 ? `Missing: [${missing.join(', ')}]. ` : '') +
          (unknown.length > 0 ? `Unknown: [${unknown.join(', ')}]. ` : '') +
          'Use slovakia-statistics.dataset_metadata to see valid codes for each dimension.',
      );
    }

    const segments: string[] = [];
    for (const dimCode of dimCodes) {
      const value = String(selections[dimCode]);
      if (!SELECTION_VALUE_RE.test(value)) {
        throw inputRejected(
          this.provider,
          req,
          `Invalid value "${value}" for dimension "${dimCode}" — only letters, digits, comma, ` +
            'colon, underscore, hyphen, and "*" are allowed (e.g. "2024", "2016,2017", ' +
            '"2010:2015", "SK04*").',
        );
      }
      segments.push(value);
    }

    const url = `${BASE_URL}/dataset/${encodeURIComponent(cubeCode)}/${segments.join('/')}?lang=en&type=json`;
    const ds = await this.fetchJson<SkDatasetResponse>(url, req, {
      notFoundMessage: `Unknown cube_code "${cubeCode}" — use slovakia-statistics.dataset_search to find a valid one.`,
    });

    const decoded = decodeJsonStat(ds);
    if (decoded === null) {
      return {
        cube_code: cubeCode,
        label: item.label ?? null,
        selections,
        total_values: 0,
        returned: 0,
        offset,
        limit,
        no_data: true,
        message:
          'No data matched this selection (upstream returned an empty cube — check that every ' +
          'value code exists via slovakia-statistics.dataset_metadata).',
        rows: [],
      };
    }

    const page = decoded.rows.slice(offset, offset + limit);
    return {
      cube_code: cubeCode,
      label: item.label ?? null,
      selections,
      total_values: decoded.rows.length,
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

  private async fetchCollection(req: ProviderRequest): Promise<SkCollectionItem[]> {
    const data = await this.fetchJson<SkCollectionResponse>(
      `${BASE_URL}/collection?lang=en`,
      req,
      {},
    );
    if (!data.link || !Array.isArray(data.link.item)) {
      throw upstreamInvalid(this.provider, req, 'collection response');
    }
    return data.link.item;
  }

  private async findCollectionItem(
    cubeCode: string,
    req: ProviderRequest,
  ): Promise<SkCollectionItem> {
    const items = await this.fetchCollection(req);
    const item = items.find((it) => cubeCodeFromHref(it.href) === cubeCode);
    if (!item) {
      throw inputRejected(
        this.provider,
        req,
        `Unknown cube_code "${cubeCode}" — use slovakia-statistics.dataset_search to find a valid one.`,
      );
    }
    return item;
  }

  private async fetchDimension(
    cubeCode: string,
    dimCode: string,
    req: ProviderRequest,
  ): Promise<SkDimensionResponse> {
    return this.fetchJson<SkDimensionResponse>(
      `${BASE_URL}/dimension/${encodeURIComponent(cubeCode)}/${encodeURIComponent(dimCode)}?lang=en`,
      req,
      { notFoundMessage: `Unknown dimension "${dimCode}" for cube_code "${cubeCode}".` },
    );
  }

  private async fetchJson<T>(
    url: string,
    req: ProviderRequest,
    opts: { notFoundMessage?: string },
  ): Promise<T> {
    const response = await this.rawFetch(url, req, opts);
    const text = await response.text();
    const bytes = Buffer.byteLength(text, 'utf8');
    if (bytes > MAX_RAW_BYTES) {
      throw {
        code: ProviderErrorCode.RESPONSE_TOO_LARGE,
        httpStatus: 502,
        message: `Upstream response is ${bytes} bytes, exceeding the ${MAX_RAW_BYTES} byte limit.`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw upstreamInvalid(this.provider, req, 'JSON response');
    }
  }

  private async rawFetch(
    url: string,
    req: ProviderRequest,
    opts: { notFoundMessage?: string },
  ): Promise<Response> {
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

    // The upstream API returns 400 (not 404) for an unrecognized cube_code, with a distinct
    // "Name API not foud: {code}" message (confirmed live, matches its own typo) — treat any 400
    // as caller-input-rejected, using the tool-specific hint when provided.
    if (response.status === 400) {
      let upstreamMsg = '';
      try {
        const body = (await response.clone().json()) as { status_message?: string };
        upstreamMsg = body.status_message ?? '';
      } catch {
        // ignore — fall back to generic message
      }
      throw inputRejected(
        this.provider,
        req,
        opts.notFoundMessage ??
          `DATAcube API rejected the request${upstreamMsg ? `: ${upstreamMsg}` : '.'}`,
      );
    }
    if (response.status === 404) {
      throw inputRejected(this.provider, req, opts.notFoundMessage ?? 'Resource not found.');
    }
    if (response.status === 429) {
      throw {
        code: ProviderErrorCode.RATE_LIMIT,
        httpStatus: 429,
        message: 'DATAcube API rate limit exceeded',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }
    if (response.status >= 500) {
      throw {
        code: ProviderErrorCode.UNAVAILABLE,
        httpStatus: 502,
        message: `DATAcube API returned ${response.status}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }
    if (response.status >= 400) {
      throw inputRejected(
        this.provider,
        req,
        `DATAcube API rejected the request (HTTP ${response.status}).`,
      );
    }

    return response;
  }
}

// ---------------------------------------------------------------------------
// JSON-stat decoding
// ---------------------------------------------------------------------------

/** One flattened `{code, label}` entry from a JSON-stat `category`, ordered by its position. */
function categoryEntries(cat: SkCategory): Array<{ code: string; label: string }> {
  const byPosition: Array<{ code: string; label: string }> = [];
  for (const [code, position] of Object.entries(cat.index)) {
    byPosition[position] = { code, label: cat.label?.[code] ?? code };
  }
  return byPosition.filter(Boolean);
}

interface DecodedRow {
  [key: string]: string | number | null;
}

/**
 * Decode a JSON-stat 2.0 dataset's flattened row-major `value` array into one row per data point,
 * generic over any dimension count/order. Per the JSON-stat spec, `value[i]` corresponds to the
 * dimension-index tuple recovered from `i` using strides where the LAST dimension varies fastest
 * (standard row-major/C order) — this matches the `id`/`size` arrays as returned, independent of
 * the caller-supplied selection order. Returns null if the metric dimension itself has no data
 * (empty `category`/`value` — the "unmatched selection" case, e.g. a year outside the published
 * range).
 */
function decodeJsonStat(ds: SkDatasetResponse): { rows: DecodedRow[] } | null {
  const metricIds = new Set(ds.role.metric);
  const dimIds = ds.id.filter((id) => !metricIds.has(id));

  const dims = dimIds.map((id) => {
    const dimDef = ds.dimension[id];
    const cat = dimDef?.category;
    const entries = cat && !Array.isArray(cat) ? categoryEntries(cat) : [];
    return { id, entries };
  });

  if (dims.some((d) => d.entries.length === 0) || ds.value.length === 0) {
    return null;
  }

  const sizes = dims.map((d) => d.entries.length);
  const total = sizes.reduce((a, b) => a * b, 1);
  const strides: number[] = new Array(sizes.length).fill(1);
  for (let i = sizes.length - 2; i >= 0; i--) {
    strides[i] = (strides[i + 1] ?? 1) * (sizes[i + 1] ?? 1);
  }

  const rows: DecodedRow[] = [];
  for (let flat = 0; flat < total && flat < ds.value.length; flat++) {
    const row: DecodedRow = {};
    let remainder = flat;
    for (let d = 0; d < dims.length; d++) {
      const stride = strides[d] ?? 1;
      const size = sizes[d] ?? 1;
      const dimIndex = size > 0 ? Math.floor(remainder / stride) % size : 0;
      remainder -= dimIndex * stride;
      const entry = dims[d]?.entries[dimIndex];
      const dimId = dims[d]?.id ?? `dim${d}`;
      row[dimId] = entry?.code ?? null;
      row[`${dimId}_label`] = entry?.label ?? null;
    }
    row.value = ds.value[flat] ?? null;
    rows.push(row);
  }

  return { rows };
}

// ---------------------------------------------------------------------------
// Validation + error helpers
// ---------------------------------------------------------------------------

function cubeCodeFromHref(href: string): string {
  const m = href.match(/\/dataset\/([^/?]+)/);
  return m ? (m[1] as string) : '';
}

function requireCubeCode(value: unknown, req: ProviderRequest): string {
  if (typeof value !== 'string' || !CUBE_CODE_RE.test(value)) {
    throw inputRejected(
      'slovakia-statistics',
      req,
      'Parameter "cube_code" is required and must be a lowercase alphanumeric table code (e.g. ' +
        '"as1001rs") — use slovakia-statistics.dataset_search to find one.',
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
    message: `DATAcube API returned an unparseable ${what}.`,
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
