import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  type ProviderError,
  type ProviderErrorCodeValue,
  ProviderErrorCode,
} from '../../types/provider';

const ATTRIBUTION = 'Statistics Canada (Census of Population). Compiled via CensusMapper.';
const DEFAULT_MAX_ROWS = 200;

/**
 * CensusMapper (censusmapper.ca) adapter (UC-799).
 *
 * Supported tools (read-only):
 *   censusmapper.list_datasets → GET  /api/v1/list_datasets   (public, JSON)
 *   censusmapper.data          → POST /api/v1/data.csv        (form body, `api_key`, CSV response)
 *
 * Auth: API key (PROVIDER_KEY_CENSUSMAPPER) as POST form param `api_key`.
 * data.csv answers text/csv, which BaseAdapter's JSON-only pipeline cannot parse,
 * so call() is overridden and the CSV is converted to JSON rows here.
 */
export class CensusMapperAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'censusmapper',
      baseUrl: 'https://censusmapper.ca/api/v1',
      maxResponseBytes: 4_000_000,
      timeoutMs: 20_000,
    });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const p = req.params as Record<string, unknown>;
    switch (req.toolId) {
      case 'censusmapper.list_datasets':
        return {
          url: `${this.baseUrl}/list_datasets`,
          method: 'GET',
          headers: { Accept: 'application/json' },
        };
      case 'censusmapper.data': {
        const form = new URLSearchParams();
        form.set('api_key', this.apiKey);
        form.set('dataset', String(p.dataset));
        form.set('level', String(p.level));
        form.set('regions', JSON.stringify(p.regions));
        form.set('vectors', JSON.stringify(p.vectors));
        if (p.geo_hierarchy === true) form.set('geo_hierarchy', 'true');
        return {
          url: `${this.baseUrl}/data.csv`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'text/csv',
          },
          body: form.toString(),
        };
      }
      default:
        throw this.providerError(
          ProviderErrorCode.INVALID_RESPONSE,
          502,
          `Unsupported tool: ${req.toolId}`,
          req,
          0,
        );
    }
  }

  protected parseResponse(raw: ProviderRawResponse, _req: ProviderRequest): unknown {
    return raw.body;
  }

  override async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    const start = performance.now();
    const built = this.buildRequest(req);

    let response: Response;
    try {
      response = await fetch(built.url, {
        method: built.method,
        headers: built.headers,
        body: built.body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const isTimeout =
        error instanceof DOMException ||
        (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'));
      throw this.providerError(
        isTimeout ? ProviderErrorCode.TIMEOUT : ProviderErrorCode.UNAVAILABLE,
        isTimeout ? 504 : 502,
        isTimeout
          ? `Provider call timed out after ${this.timeoutMs}ms`
          : 'Provider connection failed',
        req,
        Math.round(performance.now() - start),
      );
    }

    const bodyText = await response.text();
    const durationMs = Math.round(performance.now() - start);
    const byteLength = Buffer.byteLength(bodyText, 'utf8');

    if (byteLength > this.maxResponseBytes) {
      throw this.providerError(
        ProviderErrorCode.RESPONSE_TOO_LARGE,
        502,
        `Provider response exceeded ${this.maxResponseBytes} byte limit`,
        req,
        durationMs,
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw this.providerError(
        ProviderErrorCode.PROVIDER_AUTH,
        502,
        `CensusMapper rejected the API key (HTTP ${response.status})`,
        req,
        durationMs,
      );
    }
    if (response.status === 429) {
      throw this.providerError(
        ProviderErrorCode.RATE_LIMIT,
        429,
        'CensusMapper rate limit or daily quota exceeded',
        req,
        durationMs,
      );
    }
    if (response.status >= 500) {
      throw this.providerError(
        ProviderErrorCode.UNAVAILABLE,
        502,
        `Provider returned ${response.status}`,
        req,
        durationMs,
      );
    }
    if (response.status >= 400) {
      throw this.providerError(
        ProviderErrorCode.INPUT_REJECTED,
        422,
        `Provider rejected the request (HTTP ${response.status}): ${bodyText.slice(0, 300)}`,
        req,
        durationMs,
      );
    }

    let body: unknown;
    if (req.toolId === 'censusmapper.list_datasets') {
      try {
        const datasets = JSON.parse(bodyText) as unknown;
        if (!Array.isArray(datasets)) throw new Error('not an array');
        const q = String((req.params as Record<string, unknown>).query ?? '')
          .trim()
          .toLowerCase();
        const filtered = q
          ? datasets.filter((d) => JSON.stringify(d).toLowerCase().includes(q))
          : datasets;
        body = { count: filtered.length, datasets: filtered, attribution: ATTRIBUTION };
      } catch {
        throw this.providerError(
          ProviderErrorCode.INVALID_RESPONSE,
          502,
          'Provider returned invalid JSON',
          req,
          durationMs,
        );
      }
    } else {
      const p = req.params as Record<string, unknown>;
      const maxRows = typeof p.max_rows === 'number' ? p.max_rows : DEFAULT_MAX_ROWS;
      const rows = parseCsv(bodyText);
      const header = (rows.shift() ?? []).map((h) => h.trim());
      if (header.length === 0) {
        throw this.providerError(
          ProviderErrorCode.INVALID_RESPONSE,
          502,
          'CensusMapper returned an empty CSV',
          req,
          durationMs,
        );
      }
      const records = rows.slice(0, maxRows).map((r) => {
        const o: Record<string, string | number | null> = {};
        header.forEach((h, i) => {
          const v = r[i] ?? '';
          if (v === '') o[h] = null;
          else if (h !== 'GeoUID' && /^-?(0|[1-9]\d*)(\.\d+)?$/.test(v)) o[h] = Number(v);
          else o[h] = v;
        });
        return o;
      });
      body = {
        columns: header,
        total_rows: rows.length,
        returned_rows: records.length,
        truncated: rows.length > records.length,
        rows: records,
        attribution: ATTRIBUTION,
      };
    }

    return { status: response.status, headers: {}, body, durationMs, byteLength };
  }

  private providerError(
    code: ProviderErrorCodeValue,
    httpStatus: number,
    message: string,
    req: ProviderRequest,
    durationMs: number,
  ): ProviderError {
    return {
      code,
      httpStatus,
      message,
      provider: this.provider,
      toolId: req.toolId,
      durationMs,
    };
  }
}

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
