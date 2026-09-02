import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { StatistikAustriaCatalogEntry, StatistikAustriaMetadata } from './types';

const WEB_BASE = 'https://data.statistik.gv.at/web';
const OGD_JSON_BASE = 'https://data.statistik.gv.at/ogd/json';
const DATA_BASE = 'https://data.statistik.gv.at/data';
const HEADERS = { 'User-Agent': 'APIbase/1.0 (https://apibase.pro)', Accept: '*/*' };

const DATASET_ID_RE = /^[A-Za-z0-9_]{3,80}$/;
// Category-value lookup CSVs are only published for "C-" (categorical) columns, e.g.
// "C-STAATS-0", "C-A11-0" — "F-" columns are numeric measures with no code lookup.
const DIMENSION_CODE_RE = /^C-[A-Z0-9_]+-\d+$/;

const MAX_TEXT_BYTES = 3_000_000;
const MAX_SEARCH_LIMIT = 50;
const MAX_DATA_LIMIT = 200;

/**
 * Statistik Austria (data.statistik.gv.at) open-government-data portal adapter (UC-665).
 *
 * data.statistik.gv.at publishes ~540 statistical datasets (population, prices, labour market,
 * foreign trade, industry indices...) under the "OGD Austria Metadata 2.3" convention — but,
 * unlike the SDMX/CKAN-based national-statistics offices already onboarded (oecd-data, ilostat,
 * istat, bundesbank-timeseries, ine-portugal, ine-spain, czso), there is NO catalog search or
 * listing JSON API at all: `api/3/action/package_list` (CKAN) 302-redirects to a login page,
 * and every `*_list`/`*_search` path tried returns 404. The only place the full dataset id/title
 * list exists is the human-facing `web/catalog.jsp` HTML page — confirmed live: 540 unique
 * dataset ids, each duplicated once per categorization tag it belongs to (831 raw `<h4>` matches
 * for 540 unique ids). `dataset_search` scrapes and dedupes this page (same "compensate
 * client-side for a missing search endpoint" pattern as czso.dataset_list / gebco / hackernews).
 *
 * Per-dataset metadata lives at `ogd/json?dataset={id}` (properly UTF-8 encoded, confirmed live
 * with umlaut-heavy titles like "Staatsangehörigkeit"). The legacy mirror `data/{id}.json`
 * returns the SAME metadata shape but is mis-encoded (declares `charset=UTF-8` while actually
 * sending windows-1252 bytes for extended characters — confirmed live, byte 0xf6 for "ö" fails a
 * strict UTF-8 decode) — this adapter never uses it. Like INE Spain's unrecognized-code quirk, an
 * unrecognized `dataset_id` against `ogd/json` returns `HTTP 200` with a 0-byte body, not an
 * error — checked explicitly and raised as 422 rather than surfacing as a confusing 502 from a
 * failed `JSON.parse('')`.
 *
 * Actual tabular data is `text/csv` only (semicolon-delimited, German decimal-comma, e.g.
 * "17,60"), always at `data/{dataset_id}.csv` — confirmed to match the metadata's own resource
 * URL pattern for every sampled dataset, so `dataset_data` builds the URL directly (one upstream
 * call, no metadata round-trip needed). Column headers are opaque codes ("F-VESTE_AM",
 * "C-STAATS-0") explained by `dataset_metadata`'s `attribute_description`; categorical column
 * VALUES ("STAATS-9", "VEBDL-10") are opaque too and are decoded by a dedicated
 * `category_codes` tool against `data/{dataset_id}_{dimension_code}.csv` (only "C-" columns
 * publish a code-lookup resource; "F-" columns are numeric measures with no lookup) — kept as its
 * own atomic tool (AP-7) rather than folded into `dataset_data`, since decoding every categorical
 * column of a wide row would multiply upstream calls per data request.
 *
 *   statistik-austria.dataset_search   -> scrape+dedupe web/catalog.jsp, optional case-insensitive
 *                                          substring filter over title/id, paginated.
 *   statistik-austria.dataset_metadata -> ogd/json?dataset=... — title, notes, tags, license,
 *                                          update frequency, resource list, attribute_description
 *                                          parsed into a {code: description} map, plus the list of
 *                                          "C-" dimension codes decodable via category_codes.
 *   statistik-austria.dataset_data     -> data/{dataset_id}.csv — parsed rows (comma-decimal
 *                                          values converted to numbers), capped 1-200 (default 20).
 *   statistik-austria.category_codes   -> data/{dataset_id}_{dimension_code}.csv — code -> German
 *                                          + English display name for one categorical dimension.
 *
 * Auth: none. Publisher: Statistik Austria. License: Creative Commons Namensnennung 4.0
 * International (CC BY 4.0), stated on every sampled dataset's `license` field — no resale
 * restriction, comparable to the other government open-data providers already onboarded.
 */
export class StatistikAustriaAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'statistik-austria', baseUrl: WEB_BASE, timeoutMs: 20_000 });
  }

  // All logic lives in call() — buildRequest/parseResponse are required stubs (HTML catalog +
  // a bespoke JSON metadata shape + CSV data, not the single-JSON-shape BaseAdapter.call() assumes).
  protected buildRequest(_req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    throw new Error('StatistikAustriaAdapter.buildRequest() should not be called directly');
  }

  protected parseResponse(raw: ProviderRawResponse): unknown {
    return raw.body;
  }

  override async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    const start = performance.now();
    const params = (req.params ?? {}) as Record<string, unknown>;

    switch (req.toolId) {
      case 'statistik-austria.dataset_search':
        return this.respond(await this.handleDatasetSearch(params, req), start);
      case 'statistik-austria.dataset_metadata':
        return this.respond(await this.handleDatasetMetadata(params, req), start);
      case 'statistik-austria.dataset_data':
        return this.respond(await this.handleDatasetData(params, req), start);
      case 'statistik-austria.category_codes':
        return this.respond(await this.handleCategoryCodes(params, req), start);
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
    const search = params.search ? String(params.search).trim().toLowerCase() : '';
    const limit = clampInt(params.limit, 1, MAX_SEARCH_LIMIT, 20);
    const offset = clampInt(params.offset, 0, 100_000, 0);

    const html = await this.rawFetchText(`${WEB_BASE}/catalog.jsp`, req);
    const catalog = parseCatalog(html);
    const matched = search
      ? catalog.filter(
          (e) =>
            e.title.toLowerCase().includes(search) || e.dataset_id.toLowerCase().includes(search),
        )
      : catalog;
    const page = matched.slice(offset, offset + limit);

    return {
      search: search || null,
      total_matched: matched.length,
      offset,
      limit,
      datasets: page,
      note: 'Statistik Austria has no full-text search API — this browses/searches over the ~540-dataset public catalog. Use dataset_id with statistik-austria.dataset_metadata or statistik-austria.dataset_data.',
    };
  }

  private async handleDatasetMetadata(
    params: Record<string, unknown>,
    req: ProviderRequest,
  ): Promise<unknown> {
    const datasetId = requireDatasetId(params.dataset_id, req);
    const meta = await this.fetchMetadata(datasetId, req);

    const attributeDescription = parseAttributeDescription(meta.extras?.attribute_description);
    const categoryDimensions = Object.keys(attributeDescription).filter((k) => k.startsWith('C-'));
    const measureColumns = Object.keys(attributeDescription).filter((k) => k.startsWith('F-'));

    return {
      dataset_id: datasetId,
      title: meta.title,
      en_title_and_desc: meta.extras?.en_title_and_desc ?? null,
      notes: meta.notes ?? null,
      tags: meta.tags ?? [],
      categorization: meta.extras?.categorization ?? [],
      publisher: meta.extras?.publisher ?? null,
      maintainer: meta.maintainer ?? null,
      license: meta.license ?? null,
      update_frequency: meta.extras?.update_frequency ?? null,
      begin_datetime: meta.extras?.begin_datetime ?? null,
      end_datetime: meta.extras?.end_datetime ?? null,
      metadata_modified: meta.extras?.metadata_modified ?? null,
      column_meanings: attributeDescription,
      category_dimensions: categoryDimensions,
      measure_columns: measureColumns,
      resources: (meta.resources ?? []).map((r) => ({
        name: r.name ?? null,
        url: r.url ?? null,
        format: r.format ?? null,
      })),
      note:
        categoryDimensions.length > 0
          ? `Use statistik-austria.category_codes with one of category_dimensions (e.g. "${categoryDimensions[0]}") to decode categorical values in this dataset's data.`
          : 'This dataset has no categorical ("C-") columns to decode.',
    };
  }

  private async handleDatasetData(
    params: Record<string, unknown>,
    req: ProviderRequest,
  ): Promise<unknown> {
    const datasetId = requireDatasetId(params.dataset_id, req);
    const limit = clampInt(params.limit, 1, MAX_DATA_LIMIT, 20);
    const offset = clampInt(params.offset, 0, 1_000_000, 0);

    const text = await this.rawFetchText(`${DATA_BASE}/${encodeURIComponent(datasetId)}.csv`, req);
    const { header, rows } = parseDelimitedCsv(text, ';');
    if (header.length === 0) {
      throw upstreamInvalid(this.provider, req, 'dataset CSV');
    }

    const page = rows.slice(offset, offset + limit);
    const data = page.map((row) => {
      const obj: Record<string, string | number> = {};
      header.forEach((col, i) => {
        obj[col] = convertCsvValue(row[i] ?? '');
      });
      return obj;
    });

    return {
      dataset_id: datasetId,
      header,
      matched: rows.length,
      returned: data.length,
      offset,
      limit,
      rows: data,
      note: 'Column codes are opaque (e.g. "C-STAATS-0", "F-VESTE_AM") — use statistik-austria.dataset_metadata for column meanings and statistik-austria.category_codes to decode category values (e.g. "STAATS-9").',
    };
  }

  private async handleCategoryCodes(
    params: Record<string, unknown>,
    req: ProviderRequest,
  ): Promise<unknown> {
    const datasetId = requireDatasetId(params.dataset_id, req);
    const dimensionCode = String(params.dimension_code ?? '').trim();
    if (!DIMENSION_CODE_RE.test(dimensionCode)) {
      throw inputRejected(
        this.provider,
        req,
        'Parameter "dimension_code" is required and must match the format "C-{NAME}-{N}" ' +
          '(e.g. "C-STAATS-0", "C-VEBDL-0") — get the valid list from ' +
          "statistik-austria.dataset_metadata's category_dimensions field.",
      );
    }

    const url = `${DATA_BASE}/${encodeURIComponent(datasetId)}_${encodeURIComponent(dimensionCode)}.csv`;
    const text = await this.rawFetchText(url, req);
    const { header, rows } = parseDelimitedCsv(text, ';');
    if (header.length === 0) {
      throw upstreamInvalid(this.provider, req, 'category-code CSV');
    }

    const codes = rows.map((r) => ({
      code: r[0] ?? '',
      name_de: r[1] || null,
      name_en: r[3] || null,
    }));

    return {
      dataset_id: datasetId,
      dimension_code: dimensionCode,
      count: codes.length,
      codes,
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

  private async fetchMetadata(
    datasetId: string,
    req: ProviderRequest,
  ): Promise<StatistikAustriaMetadata> {
    const text = await this.rawFetchText(
      `${OGD_JSON_BASE}?dataset=${encodeURIComponent(datasetId)}`,
      req,
    );
    if (text.trim().length === 0) {
      throw inputRejected(
        this.provider,
        req,
        `Unknown dataset_id "${datasetId}" — use statistik-austria.dataset_search to find a valid id.`,
      );
    }
    try {
      return JSON.parse(text) as StatistikAustriaMetadata;
    } catch {
      throw upstreamInvalid(this.provider, req, 'metadata response');
    }
  }

  private async rawFetchText(url: string, req: ProviderRequest): Promise<string> {
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
      throw inputRejected(
        this.provider,
        req,
        'Resource not found — check dataset_id (and dimension_code, if applicable).',
      );
    }
    if (response.status === 429) {
      throw {
        code: ProviderErrorCode.RATE_LIMIT,
        httpStatus: 429,
        message: 'Statistik Austria portal rate limit exceeded',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }
    if (response.status >= 500) {
      throw {
        code: ProviderErrorCode.UNAVAILABLE,
        httpStatus: 502,
        message: `Statistik Austria portal returned ${response.status}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }
    if (response.status >= 400) {
      throw inputRejected(
        this.provider,
        req,
        `Statistik Austria portal rejected the request (HTTP ${response.status}).`,
      );
    }

    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > MAX_TEXT_BYTES) {
      throw {
        code: ProviderErrorCode.RESPONSE_TOO_LARGE,
        httpStatus: 502,
        message: `Statistik Austria response exceeded the ${MAX_TEXT_BYTES} byte limit (${contentLength} bytes).`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    return response.text();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATALOG_ENTRY_RE = /<h4><a href="meta\.jsp\?dataset=([^"]+)"[^>]*>([^<]+)<\/a><\/h4>/g;
const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&lt;': '<',
  '&gt;': '>',
};

function decodeHtmlEntities(text: string): string {
  return text.replace(/&amp;|&quot;|&#39;|&lt;|&gt;/g, (m) => HTML_ENTITIES[m] ?? m);
}

/** Scrapes+dedupes `web/catalog.jsp` — each dataset appears once per categorization tag it has. */
function parseCatalog(html: string): StatistikAustriaCatalogEntry[] {
  const seen = new Map<string, string>();
  for (const m of html.matchAll(CATALOG_ENTRY_RE)) {
    const datasetId = m[1] as string;
    if (!seen.has(datasetId)) {
      seen.set(datasetId, decodeHtmlEntities((m[2] as string).trim()));
    }
  }
  return Array.from(seen, ([dataset_id, title]) => ({ dataset_id, title }));
}

/** "F-VESTE_AM:Arithmetisches Mittel;C-STAATS-0:Staatsangehörigkeit;..." -> {code: description}. */
function parseAttributeDescription(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const part of raw.split(';')) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const code = part.slice(0, idx).trim();
    const desc = part.slice(idx + 1).trim();
    if (code) out[code] = desc;
  }
  return out;
}

interface ParsedCsv {
  header: string[];
  rows: string[][];
}

/** Quote-aware delimiter-split CSV parser, strips trailing \r left by CRLF line endings. */
function parseDelimitedCsv(text: string, delimiter: string): ParsedCsv {
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
      } else if (ch === delimiter && !inQuotes) {
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

/** German decimal-comma numerics ("17,60", "-1,7") become JSON numbers; everything else stays a string. */
function convertCsvValue(value: string): string | number {
  if (/^-?\d+,\d+$/.test(value)) {
    return Number(value.replace(',', '.'));
  }
  if (/^-?\d+$/.test(value)) {
    return Number(value);
  }
  return value;
}

function requireDatasetId(value: unknown, req: ProviderRequest): string {
  if (typeof value !== 'string' || !DATASET_ID_RE.test(value)) {
    throw inputRejected(
      'statistik-austria',
      req,
      'Parameter "dataset_id" is required and must match Statistik Austria id format (letters, ' +
        'digits, underscore, e.g. "OGD_veste309_Veste309_1") — use statistik-austria.dataset_search ' +
        'to find a valid id.',
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
    message: `Statistik Austria portal returned an unparseable ${what}.`,
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
