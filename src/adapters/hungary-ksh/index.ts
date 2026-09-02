import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  KshDatasetListEntry,
  KshDatasetMetadata,
  KshDistribution,
  KshParsedTable,
} from './types';

const BASE_URL = 'https://data.ksh.hu';
const HEADERS = { 'User-Agent': 'APIbase/1.0 (https://apibase.pro)', Accept: '*/*' };

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const MAX_SEARCH_LIMIT = 13; // there are only 13 HVD datasets total, list not paginated upstream
const MAX_DATA_LIMIT = 500;
// Live-measured: 4.5MB fetched in ~3.3s, but a 26.7MB file took 45s (server-side generation is
// slow for large SDMX exports, not just transfer) — a 5MB pre-fetch cap keeps every accepted
// request comfortably inside timeoutMs. Larger distributions are rejected with a pointer to the
// raw download_url instead of risking a timeout mid-download (same class as czso's ZIP rejection).
const MAX_DATA_BYTES = 5_000_000;

/**
 * Hungarian Central Statistical Office (KSH) "Nagy értékű adatkészletek" (High-Value Datasets)
 * open-data API adapter (UC-666).
 *
 * data.ksh.hu publishes exactly 13 HVD datasets (the EU-mandated High-Value Dataset categories
 * under Commission Implementing Regulation (EU) 2023/138 — population, national accounts,
 * prices, industrial production, tourism, etc.). There is no catalog/search JSON API beyond the
 * single flat `datasets.json` list (confirmed live — the documented API base is `data.ksh.hu/`,
 * not `data.ksh.hu/api/v1` as the onboarding candidate line stated; no `/api/v1` path exists,
 * verified 404). Per-dataset metadata is DCAT-AP RDF/XML (`metadata.rdf`), hand-parsed with
 * regex (no XML dependency in this project — same approach as bundesbank-timeseries and
 * usgs-mrds) rather than adding a new package. Each dataset's `dcat:distribution` list mixes two
 * data formats with no consistent pattern per dataset: semicolon-delimited quoted CSV, and
 * SDMX-ML 2.0 "CompactData" XML (flat `<Series ATTR=".."><Obs TIME_PERIOD=".." OBS_VALUE=".."/>
 * </Series>` — parsed the same way, regex over attributes, no XML dependency). Some SDMX-ML
 * exports are very large (up to 61MB observed, live-measured taking 45s to download a 26.7MB
 * file — server-side generation, not just transfer, is the bottleneck) — `dataset_data` rejects
 * any distribution above MAX_DATA_BYTES (checked via Content-Length before the body is read)
 * with a pointer to the raw download_url, rather than risking a pipeline timeout.
 *
 *   hungary-ksh.dataset_search   -> GET datasets.json (13 entries, no auth) filtered client-side
 *                                    by a query substring across hu+en titles/keywords/themes.
 *   hungary-ksh.dataset_metadata -> GET datasets/{id}/metadata.rdf, parsed into title/description
 *                                    + the distribution list (distribution_id, format, download
 *                                    URL, temporal coverage) needed before calling dataset_data.
 *   hungary-ksh.dataset_data     -> resolves the distribution via metadata.rdf, size-checks it,
 *                                    fetches + parses (CSV or SDMX-ML), then applies the same
 *                                    generic filter_column/filter_value + limit/offset pattern as
 *                                    czso.dataset_data (column names differ per distribution).
 *
 * Auth: none. Publisher: Központi Statisztikai Hivatal (KSH). License: CC BY 4.0 (every sampled
 * distribution's `dct:license` resolves to creativecommons.org/licenses/by/4.0), no resale
 * restriction — same class as other national-statistics-office providers already onboarded
 * (czso, statistik-austria, ine-spain).
 */
export class HungaryKshAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'hungary-ksh', baseUrl: BASE_URL, timeoutMs: 20_000 });
  }

  // All logic lives in call() — buildRequest/parseResponse are required stubs (RDF/XML + CSV +
  // SDMX-ML, not the single-JSON-shape BaseAdapter.call() assumes; same pattern as czso).
  protected buildRequest(_req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    throw new Error('HungaryKshAdapter.buildRequest() should not be called directly');
  }

  protected parseResponse(raw: ProviderRawResponse): unknown {
    return raw.body;
  }

  override async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    const start = performance.now();
    const params = (req.params ?? {}) as Record<string, unknown>;

    switch (req.toolId) {
      case 'hungary-ksh.dataset_search':
        return this.respond(await this.handleDatasetSearch(params, req), start);
      case 'hungary-ksh.dataset_metadata':
        return this.respond(await this.handleDatasetMetadata(params, req), start);
      case 'hungary-ksh.dataset_data':
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
    const limit = clampInt(params.limit, 1, MAX_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    const offset = clampInt(params.offset, 0, MAX_SEARCH_LIMIT, 0);

    const list = await this.fetchJson<KshDatasetListEntry[]>(`${BASE_URL}/datasets.json`, req);
    const matched = query ? list.filter((d) => matchesQuery(d, query)) : list;
    const page = matched.slice(offset, offset + limit);

    return {
      query: query || null,
      total_matched: matched.length,
      offset,
      limit,
      datasets: page.map((d) => ({
        dataset_id: d.id,
        title_hu: d.titles?.hu ?? null,
        title_en: d.titles?.en ?? null,
        themes_en: d.themes?.en ?? [],
        keywords_en: d.keywords?.en ?? [],
      })),
    };
  }

  private async handleDatasetMetadata(
    params: Record<string, unknown>,
    req: ProviderRequest,
  ): Promise<unknown> {
    const datasetId = requireDatasetId(params.dataset_id, req);
    const meta = await this.fetchDatasetMetadata(datasetId, req);

    return {
      dataset_id: meta.dataset_id,
      title_hu: meta.title_hu,
      title_en: meta.title_en,
      description_en: meta.description_en,
      distributions: meta.distributions.map((d) => ({
        distribution_id: d.distribution_id,
        title_hu: d.title_hu,
        title_en: d.title_en,
        description_en: d.description_en,
        format: d.format,
        download_url: d.download_url,
        temporal_start: d.temporal_start,
        temporal_end: d.temporal_end,
        license: d.license,
      })),
    };
  }

  private async handleDatasetData(
    params: Record<string, unknown>,
    req: ProviderRequest,
  ): Promise<unknown> {
    const datasetId = requireDatasetId(params.dataset_id, req);
    const distributionId = requireDistributionId(params.distribution_id, req);
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

    const meta = await this.fetchDatasetMetadata(datasetId, req);
    const dist = meta.distributions.find((d) => d.distribution_id === distributionId);
    if (!dist || !dist.download_url) {
      const available = meta.distributions.map((d) => d.distribution_id).join(', ') || 'none';
      throw inputRejected(
        this.provider,
        req,
        `Unknown distribution_id "${distributionId}" for dataset "${datasetId}". Available: ` +
          `${available}. Use hungary-ksh.dataset_metadata to list distributions.`,
      );
    }

    const format = (dist.format ?? '').toUpperCase();
    if (format !== 'CSV' && format !== 'XML') {
      throw inputRejected(
        this.provider,
        req,
        `Distribution "${distributionId}" has an unsupported format (${dist.format ?? 'unknown'}). ` +
          `Use the raw download_url instead: ${dist.download_url}`,
      );
    }

    const text = await this.fetchDataFile(dist.download_url, distributionId, req);
    const table = format === 'CSV' ? parseSemicolonCsv(text) : parseSdmxCompactData(text);
    if (table.header.length === 0) {
      throw upstreamInvalid(this.provider, req, `${format} data file`);
    }

    let filterIndex = -1;
    if (filterColumn) {
      filterIndex = table.header.findIndex((h) => h.toLowerCase() === filterColumn.toLowerCase());
      if (filterIndex === -1) {
        throw inputRejected(
          this.provider,
          req,
          `Unknown filter_column "${filterColumn}" for distribution "${distributionId}". ` +
            `Available columns: ${table.header.join(', ')}.`,
        );
      }
    }

    const filtered =
      filterIndex === -1
        ? table.rows
        : table.rows.filter((r) => (r[filterIndex] ?? '').toLowerCase().includes(filterValue));
    const page = filtered.slice(offset, offset + limit);

    return {
      dataset_id: datasetId,
      distribution_id: distributionId,
      title_en: dist.title_en ?? meta.title_en,
      format,
      header: table.header,
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

  private async fetchDatasetMetadata(
    datasetId: string,
    req: ProviderRequest,
  ): Promise<KshDatasetMetadata> {
    const response = await this.rawFetch(`${BASE_URL}/datasets/${datasetId}/metadata.rdf`, req, {
      notFoundMessage: `Unknown dataset_id "${datasetId}" — use hungary-ksh.dataset_search to find a valid id.`,
    });
    const xml = await response.text();
    const meta = parseDatasetMetadataRdf(xml, datasetId);
    if (!meta.title_en && !meta.title_hu && meta.distributions.length === 0) {
      throw upstreamInvalid(this.provider, req, 'metadata.rdf document');
    }
    return meta;
  }

  private async fetchJson<T>(url: string, req: ProviderRequest): Promise<T> {
    const response = await this.rawFetch(url, req, {});
    try {
      return (await response.json()) as T;
    } catch {
      throw upstreamInvalid(this.provider, req, 'catalog response');
    }
  }

  private async fetchDataFile(
    url: string,
    distributionId: string,
    req: ProviderRequest,
  ): Promise<string> {
    const response = await this.rawFetch(url, req, {});
    // Fast-path: reject before reading the body if the wire Content-Length already exceeds the
    // cap. NOT sufficient on its own — large SDMX-ML exports are highly repetitive (attribute
    // names/values) and compress ~10x, so a gzip'd response's Content-Length reflects the
    // COMPRESSED size and can slip a 61MB decoded document under a 5MB check (confirmed live:
    // one distribution parsed in 11s instead of being rejected). The post-decode check below is
    // the authoritative guard.
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > MAX_DATA_BYTES) {
      throw sizeExceeded(this.provider, req, distributionId, contentLength, url);
    }
    const text = await response.text();
    const actualBytes = Buffer.byteLength(text, 'utf8');
    if (actualBytes > MAX_DATA_BYTES) {
      throw sizeExceeded(this.provider, req, distributionId, actualBytes, url);
    }
    return text;
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

    if (response.status === 404) {
      throw inputRejected(this.provider, req, opts.notFoundMessage ?? 'Resource not found.');
    }
    if (response.status === 429) {
      throw {
        code: ProviderErrorCode.RATE_LIMIT,
        httpStatus: 429,
        message: 'KSH open-data rate limit exceeded',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }
    if (response.status >= 500) {
      throw {
        code: ProviderErrorCode.UNAVAILABLE,
        httpStatus: 502,
        message: `KSH open-data API returned ${response.status}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }
    if (response.status >= 400) {
      throw inputRejected(
        this.provider,
        req,
        `KSH open-data API rejected the request (HTTP ${response.status}).`,
      );
    }

    return response;
  }
}

// ---------------------------------------------------------------------------
// RDF/XML metadata parsing (regex-based — no XML dependency in this project)
// ---------------------------------------------------------------------------

function parseDatasetMetadataRdf(xml: string, datasetId: string): KshDatasetMetadata {
  const distBlocks = xml.match(/<dcat:Distribution\b[\s\S]*?<\/dcat:Distribution>/g) ?? [];
  const datasetOnly = distBlocks.reduce((acc, block) => acc.replace(block, ''), xml);

  const distributions: KshDistribution[] = distBlocks.map((block) => {
    const downloadUrl = matchTag(block, 'dcat:downloadURL');
    const formatResource = matchAttr(block, 'dct:format', 'rdf:resource');
    return {
      distribution_id: downloadUrl ? distributionIdFromUrl(downloadUrl) : '',
      title_hu: matchLangTag(block, 'dct:title', 'hu'),
      title_en: matchLangTag(block, 'dct:title', 'en'),
      description_en: matchLangTag(block, 'dct:description', 'en'),
      format: formatResource ? (formatResource.split('/').pop() ?? null) : null,
      download_url: downloadUrl,
      temporal_start: matchTag(block, 'schema:startDate'),
      temporal_end: matchTag(block, 'schema:endDate'),
      license: matchAttr(block, 'dct:license', 'rdf:resource'),
    };
  });

  return {
    dataset_id: datasetId,
    title_hu: matchLangTag(datasetOnly, 'dct:title', 'hu'),
    title_en: matchLangTag(datasetOnly, 'dct:title', 'en'),
    description_en: matchLangTag(datasetOnly, 'dct:description', 'en'),
    distributions: distributions.filter((d) => d.distribution_id),
  };
}

function distributionIdFromUrl(url: string): string {
  const clean = url.split('?')[0] ?? '';
  const base = clean.substring(clean.lastIndexOf('/') + 1);
  return base.replace(/\.(csv|xml)$/i, '');
}

function matchTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${escapeRegex(tag)}[^>]*>([^<]*)</${escapeRegex(tag)}>`));
  return m ? decodeXmlEntities(m[1] as string).trim() || null : null;
}

function matchLangTag(xml: string, tag: string, lang: string): string | null {
  const m = xml.match(
    new RegExp(`<${escapeRegex(tag)}\\s+xml:lang="${lang}">([^<]*)</${escapeRegex(tag)}>`),
  );
  return m ? decodeXmlEntities(m[1] as string).trim() || null : null;
}

function matchAttr(xml: string, tag: string, attr: string): string | null {
  const m = xml.match(new RegExp(`<${escapeRegex(tag)}\\s+${escapeRegex(attr)}\\s*=\\s*"([^"]+)"`));
  return m ? decodeXmlEntities(m[1] as string) : null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&');
}

// ---------------------------------------------------------------------------
// Data file parsing
// ---------------------------------------------------------------------------

/** Quote-aware semicolon-split CSV parser (KSH uses `;` as delimiter, `"` as quote char). */
function parseSemicolonCsv(text: string): KshParsedTable {
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
      } else if (ch === ';' && !inQuotes) {
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

/**
 * Regex parser for SDMX-ML 2.0 "CompactData" (flat `<ns:Series ATTR=".."><ns:Obs ATTR=".."/>
 * </ns:Series>` — no nested text content, only attributes). Each Series' attributes are merged
 * with each of its nested Obs' attributes into one flat row; the header is the ordered union of
 * every attribute name observed across all rows.
 */
function parseSdmxCompactData(xml: string): KshParsedTable {
  const seriesRe = /<[\w-]+:Series\b([^>]*)>([\s\S]*?)<\/[\w-]+:Series>/g;
  const obsRe = /<[\w-]+:Obs\b([^>]*)\/?>/g;
  const headerOrder: string[] = [];
  const headerSeen = new Set<string>();
  const objRows: Array<Record<string, string>> = [];

  let seriesMatch: RegExpExecArray | null;
  while ((seriesMatch = seriesRe.exec(xml)) !== null) {
    const seriesAttrs = parseAttrs(seriesMatch[1] as string);
    const seriesBody = seriesMatch[2] as string;
    obsRe.lastIndex = 0;
    let obsMatch: RegExpExecArray | null;
    while ((obsMatch = obsRe.exec(seriesBody)) !== null) {
      const obsAttrs = parseAttrs(obsMatch[1] as string);
      const row = { ...seriesAttrs, ...obsAttrs };
      for (const key of Object.keys(row)) {
        if (!headerSeen.has(key)) {
          headerSeen.add(key);
          headerOrder.push(key);
        }
      }
      objRows.push(row);
    }
  }

  const rows = objRows.map((row) => headerOrder.map((key) => row[key] ?? ''));
  return { header: headerOrder, rows };
}

function parseAttrs(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /([\w-]+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(attrString)) !== null) {
    attrs[m[1] as string] = decodeXmlEntities(m[2] as string);
  }
  return attrs;
}

// ---------------------------------------------------------------------------
// Validation + error helpers
// ---------------------------------------------------------------------------

function matchesQuery(entry: KshDatasetListEntry, query: string): boolean {
  const haystacks: string[] = [
    entry.titles?.hu ?? '',
    entry.titles?.en ?? '',
    ...(entry.keywords?.hu ?? []),
    ...(entry.keywords?.en ?? []),
    ...(entry.themes?.hu ?? []),
    ...(entry.themes?.en ?? []),
  ];
  return haystacks.some((h) => h.toLowerCase().includes(query));
}

function requireDatasetId(value: unknown, req: ProviderRequest): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw inputRejected(
      'hungary-ksh',
      req,
      'Parameter "dataset_id" is required and must be a UUID (e.g. ' +
        '"f44d314b-bc27-40a7-b34e-af01b3c4ab05") — use hungary-ksh.dataset_search to find one.',
    );
  }
  return value;
}

function requireDistributionId(value: unknown, req: ProviderRequest): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw inputRejected(
      'hungary-ksh',
      req,
      'Parameter "distribution_id" is required and must be a UUID (e.g. ' +
        '"eb3e481e-6b5a-45d1-8076-18c4ece155c2") — use hungary-ksh.dataset_metadata to find one.',
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
    message: `KSH open-data API returned an unparseable ${what}.`,
    provider,
    toolId: req.toolId,
    durationMs: 0,
  };
}

function sizeExceeded(
  provider: string,
  req: ProviderRequest,
  distributionId: string,
  bytes: number,
  url: string,
) {
  return {
    code: ProviderErrorCode.RESPONSE_TOO_LARGE,
    httpStatus: 502,
    message:
      `Distribution "${distributionId}" is ${bytes} bytes, exceeding the ${MAX_DATA_BYTES} byte ` +
      `limit for this endpoint. Download it directly: ${url}`,
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
