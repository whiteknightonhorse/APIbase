import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  type ProviderError,
  type ProviderErrorCodeValue,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  SdmxDataMessage,
  BundesbankDataflowEntry,
  BundesbankCodelistCode,
  BundesbankDimension,
} from './types';

const BUNDESBANK_BASE = 'https://api.statistiken.bundesbank.de';
const MAX_CODES_PER_DIMENSION = 200;
const MAX_DATAFLOWS_RETURNED = 200;

/**
 * Deutsche Bundesbank SDMX 2.1 public REST API adapter (UC-659).
 *
 * The German central bank publishes ~94 economic time-series dataflows (exchange rates,
 * interest rates, money supply, prices, balance of payments) as a public, no-auth SDMX 2.1
 * REST API. Structurally the same 3-tool shape as the ISTAT/ILOSTAT/OECD SDMX adapters
 * (UC-656/651/629), but with one key difference discovered live against the API's
 * `/v3/api-docs` OpenAPI spec: the `/rest/metadata/*` endpoints (dataflow list, datastructure)
 * serve XML ONLY — `Accept: application/vnd.sdmx.structure+json` returns 406. Only
 * `/rest/data/{flowRef}/{key}` supports JSON. `call()` is overridden (same pattern as
 * src/adapters/usgs-mrds/index.ts) to hand-parse the two XML metadata endpoints with regex and
 * bypass BaseAdapter's JSON.parse for those two tools only; `bundesbank-timeseries.data`
 * delegates straight to `super.call()` since it's natively JSON.
 *
 *   bundesbank-timeseries.dataflows -> GET /rest/metadata/dataflow/BBK (Accept: application/xml),
 *                                       client-side filtered by query. Only 94 dataflows total,
 *                                       no pagination needed.
 *   bundesbank-timeseries.structure -> two sequential XML fetches (the dataflow -> DSD id
 *                                       mapping is NOT derivable from the dataflow_id — verified
 *                                       live, e.g. BBEX3 -> BBK_ERX, BBIN1 -> BBK_IRCBR, no shared
 *                                       pattern): (1) GET /rest/metadata/dataflow/BBK/{id} to read
 *                                       the linked DataStructure Ref id, (2) GET
 *                                       /rest/metadata/datastructure/BBK/{dsd_id}?references=all
 *                                       to read dimensions + their codelists in one call. Codes
 *                                       per dimension capped to 200 (BBK_STD_CURRENCY alone has
 *                                       160+).
 *   bundesbank-timeseries.data      -> GET /rest/data/{flowRef}/{key}?detail=DATA_ONLY. `key` is
 *                                       REQUIRED and must be a fully dot-specified SDMX key (no
 *                                       empty/wildcard segments) — confirmed live that omitting the
 *                                       key entirely (`/rest/data/BBEX3` with no key) returns
 *                                       EVERY series in the dataflow at once (116MB+ for BBEX3),
 *                                       so an unscoped key is rejected at the schema layer rather
 *                                       than attempted. last_n_observations (capped 1-100, default
 *                                       30) bounds a single fully-specified series to a safe size.
 */
export class BundesbankTimeseriesAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'bundesbank-timeseries',
      baseUrl: BUNDESBANK_BASE,
      maxResponseBytes: 4_000_000,
      timeoutMs: 15_000,
    });
  }

  override async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    if (req.toolId === 'bundesbank-timeseries.data') {
      return super.call(req);
    }

    const start = performance.now();

    if (req.toolId === 'bundesbank-timeseries.dataflows') {
      const built = this.buildRequest(req);
      const xml = await this.fetchXmlText(built, req, start);
      const params = req.params as Record<string, unknown>;
      const query = String(params.query || '')
        .trim()
        .toLowerCase();
      const durationMs = Math.round(performance.now() - start);
      const body = buildDataflowsBody(xml, query);
      return {
        status: 200,
        headers: {},
        body,
        durationMs,
        byteLength: Buffer.byteLength(xml, 'utf8'),
      };
    }

    if (req.toolId === 'bundesbank-timeseries.structure') {
      const params = req.params as Record<string, unknown>;
      const dataflowId = String(params.dataflow_id || '').trim();
      if (!/^[A-Za-z0-9_]+$/.test(dataflowId)) {
        throw this.invalidInput(
          req.toolId,
          'dataflow_id is required and must contain only letters, digits, and underscores',
        );
      }

      const headers = { Accept: 'application/xml' };
      const dfXml = await this.fetchXmlText(
        {
          url: `${BUNDESBANK_BASE}/rest/metadata/dataflow/BBK/${encodeURIComponent(dataflowId)}`,
          method: 'GET',
          headers,
        },
        req,
        start,
      );
      const dsdId = extractDsdRefId(dfXml);
      if (!dsdId) {
        throw this.invalidInput(
          req.toolId,
          `Unknown dataflow_id "${dataflowId}" — use bundesbank-timeseries.dataflows to find a valid id`,
        );
      }

      const dsdXml = await this.fetchXmlText(
        {
          url: `${BUNDESBANK_BASE}/rest/metadata/datastructure/BBK/${encodeURIComponent(dsdId)}?references=all`,
          method: 'GET',
          headers,
        },
        req,
        start,
      );

      const durationMs = Math.round(performance.now() - start);
      const body = {
        dataflow_id: dataflowId,
        name: extractEnglishName(dfXml),
        dimensions: parseDatastructureXml(dsdXml),
      };
      return {
        status: 200,
        headers: {},
        body,
        durationMs,
        byteLength: Buffer.byteLength(dfXml, 'utf8') + Buffer.byteLength(dsdXml, 'utf8'),
      };
    }

    throw this.invalidInput(req.toolId, `Unsupported tool: ${req.toolId}`);
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'bundesbank-timeseries.dataflows':
        return {
          url: `${BUNDESBANK_BASE}/rest/metadata/dataflow/BBK`,
          method: 'GET',
          headers: { Accept: 'application/xml' },
        };

      case 'bundesbank-timeseries.data': {
        const dataflowId = String(params.dataflow_id || '').trim();
        const key = String(params.key || '').trim();
        if (!/^[A-Za-z0-9_]+$/.test(dataflowId)) {
          throw this.invalidInput(
            req.toolId,
            'dataflow_id is required and must contain only letters, digits, and underscores',
          );
        }
        if (
          !key ||
          !/^[A-Za-z0-9_+.-]+$/.test(key) ||
          key.includes('..') ||
          key.startsWith('.') ||
          key.endsWith('.')
        ) {
          throw this.invalidInput(
            req.toolId,
            'key is required and must be a fully dot-specified SDMX series key with no empty segments (e.g. "D.USD.EUR.BB.AC.000") — use bundesbank-timeseries.structure to see each dimension\'s position and valid codes. An unscoped key would match every series in the dataflow and return an oversized response.',
          );
        }

        const qs = new URLSearchParams({ detail: 'DATA_ONLY' });
        if (params.start_period) qs.set('startPeriod', String(params.start_period));
        if (params.end_period) qs.set('endPeriod', String(params.end_period));
        if (!params.start_period && !params.end_period) {
          const lastN = Math.min(Math.max(Number(params.last_n_observations) || 30, 1), 100);
          qs.set('lastNObservations', String(lastN));
        }

        return {
          url: `${BUNDESBANK_BASE}/rest/data/${encodeURIComponent(dataflowId)}/${encodeURIComponent(key)}?${qs.toString()}`,
          method: 'GET',
          headers: { Accept: 'application/json' },
        };
      }

      default:
        throw this.invalidInput(req.toolId, `Unsupported tool: ${req.toolId}`);
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    if (req.toolId !== 'bundesbank-timeseries.data') {
      // dataflows/structure are handled directly in the call() override above.
      return raw.body;
    }

    const params = req.params as Record<string, unknown>;
    const msg = raw.body as SdmxDataMessage;
    const dataSet = msg.data.dataSets?.[0];
    const seriesDims = msg.data.structure.dimensions.series ?? [];
    const obsDim = msg.data.structure.dimensions.observation?.[0];
    const seriesMap = dataSet?.series ?? {};

    const series = Object.entries(seriesMap).map(([seriesKey, s]) => {
      const positions = seriesKey.split(':').map((n) => Number(n));
      const dimensions: Record<string, string | null> = {};
      seriesDims.forEach((dim, i) => {
        const value = dim.values[positions[i]];
        dimensions[dim.id] = value?.name ?? value?.id ?? null;
      });
      const observations = Object.entries(s.observations).map(([obsKey, obs]) => {
        const periodValue = obsDim?.values[Number(obsKey)];
        return {
          period: periodValue?.id ?? obsKey,
          value: obs[0],
        };
      });
      return { dimensions, observations };
    });

    return {
      dataflow_id: params.dataflow_id,
      key: params.key,
      series,
    };
  }

  /** Single-attempt XML fetch with the same status-code classification as BaseAdapter.executeRequest. */
  private async fetchXmlText(
    built: { url: string; method: string; headers: Record<string, string> },
    req: ProviderRequest,
    start: number,
  ): Promise<string> {
    let response: Response;
    try {
      response = await fetch(built.url, {
        method: built.method,
        headers: built.headers,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const durationMs = Math.round(performance.now() - start);
      const isTimeout =
        error instanceof DOMException ||
        (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'));
      throw this.providerError(
        isTimeout ? ProviderErrorCode.TIMEOUT : ProviderErrorCode.UNAVAILABLE,
        isTimeout ? 504 : 502,
        isTimeout
          ? `Provider call timed out after ${this.timeoutMs}ms`
          : `Provider connection failed: ${error instanceof Error ? error.message : 'unknown'}`,
        req,
        durationMs,
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
    if (response.status === 429) {
      throw this.providerError(
        ProviderErrorCode.RATE_LIMIT,
        429,
        'Bundesbank API rate limit exceeded',
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
      const detail = bodyText.length > 0 ? `: ${bodyText.slice(0, 500)}` : '';
      throw this.providerError(
        ProviderErrorCode.INPUT_REJECTED,
        422,
        `Provider rejected the request (HTTP ${response.status})${detail}`,
        req,
        durationMs,
      );
    }

    return bodyText;
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

  private invalidInput(toolId: string, message: string): ProviderError {
    return {
      code: ProviderErrorCode.INPUT_REJECTED,
      httpStatus: 422,
      message,
      provider: this.provider,
      toolId,
      durationMs: 0,
    };
  }
}

// ---------------------------------------------------------------------------
// XML parsing helpers (regex-based — /rest/metadata/* serves XML only, no JSON)
// ---------------------------------------------------------------------------

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function extractEnglishName(xml: string): string | null {
  const m = xml.match(/<common:Name xml:lang="en">([^<]*)<\/common:Name>/);
  return m ? decodeXmlEntities(m[1]) : null;
}

function extractDsdRefId(xml: string): string | null {
  const m = xml.match(/<Ref agencyID="BBK" id="([^"]+)" version="[^"]*" class="DataStructure"/);
  return m ? m[1] : null;
}

function parseDataflowListXml(xml: string): BundesbankDataflowEntry[] {
  const entries: BundesbankDataflowEntry[] = [];
  const regex =
    /<structure:Dataflow agencyID="BBK" version="([^"]+)" id="([^"]+)"[^>]*>([\s\S]*?)<\/structure:Dataflow>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    const [, version, id, body] = match;
    entries.push({ id, version, name: extractEnglishName(body) });
  }
  return entries;
}

function buildDataflowsBody(xml: string, query: string): unknown {
  const all = parseDataflowListXml(xml);
  const filtered = query
    ? all.filter(
        (df) =>
          df.id.toLowerCase().includes(query) || (df.name ?? '').toLowerCase().includes(query),
      )
    : all;
  const limited = filtered.slice(0, MAX_DATAFLOWS_RETURNED);
  return {
    total: filtered.length,
    returned: limited.length,
    dataflows: limited,
  };
}

function parseDatastructureXml(xml: string): BundesbankDimension[] {
  const dims: { position: number; id: string; codelistId: string | null }[] = [];
  const listMatch = xml.match(
    /<structure:DimensionList[^>]*>([\s\S]*?)<\/structure:DimensionList>/,
  );
  if (listMatch) {
    const dimRegex =
      /<structure:Dimension position="(\d+)" id="([^"]+)"[^>]*>([\s\S]*?)<\/structure:Dimension>/g;
    let m: RegExpExecArray | null;
    while ((m = dimRegex.exec(listMatch[1])) !== null) {
      const [, pos, id, body] = m;
      const clMatch = body.match(
        /<Ref agencyID="BBK" id="([^"]+)" version="[^"]*" class="Codelist"/,
      );
      dims.push({ position: Number(pos), id, codelistId: clMatch ? clMatch[1] : null });
    }
  }

  const codelistMap = new Map<string, BundesbankCodelistCode[]>();
  const clRegex =
    /<structure:Codelist agencyID="BBK"[^>]*\sid="([^"]+)"[^>]*>([\s\S]*?)<\/structure:Codelist>/g;
  let clm: RegExpExecArray | null;
  while ((clm = clRegex.exec(xml)) !== null) {
    const [, clId, clBody] = clm;
    const codes: BundesbankCodelistCode[] = [];
    const codeRegex = /<structure:Code id="([^"]+)"[^>]*>([\s\S]*?)<\/structure:Code>/g;
    let cm: RegExpExecArray | null;
    while ((cm = codeRegex.exec(clBody)) !== null) {
      const [, codeId, codeBody] = cm;
      codes.push({ code: codeId, name: extractEnglishName(codeBody) });
    }
    codelistMap.set(clId, codes);
  }

  return dims
    .sort((a, b) => a.position - b.position)
    .map((d) => {
      const codes = d.codelistId ? (codelistMap.get(d.codelistId) ?? []) : [];
      return {
        dimension_id: d.id,
        position: d.position,
        total_codes: codes.length,
        codes: codes.slice(0, MAX_CODES_PER_DIMENSION),
      };
    });
}
