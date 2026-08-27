import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  type ProviderError,
  ProviderErrorCode,
  PROVIDER_BACKOFF_BASE_MS,
  PROVIDER_MAX_RESPONSE_BYTES,
} from '../../types/provider';
import { logger } from '../../config/logger';
import type { EmscFeature, EmscFeatureCollection } from './types';

const EMSC_BASE = 'https://www.seismicportal.eu/fdsnws/event/1/query';

/**
 * EMSC (European-Mediterranean Seismological Centre) real-time seismicity
 * adapter (UC-615).
 *
 * Supported tools (read-only):
 *   emsc.search_earthquakes → GET /fdsnws/event/1/query?format=json (search)
 *   emsc.event_detail       → GET /fdsnws/event/1/query?format=json&eventid=...
 *
 * Auth: None (public EMSC-RTS catalog, CC BY 4.0).
 *
 * IMPORTANT: the upstream returns HTTP 204 No Content (empty body, no JSON)
 * when a search matches zero events (`nodata=204` is the FDSN default). This
 * is a valid empty result, not a provider failure — the base adapter's
 * generic JSON-parse-after-2xx flow would throw INVALID_RESPONSE on an empty
 * body, so this adapter overrides call() entirely to handle that case and
 * to normalize the two distinct upstream response shapes (FeatureCollection
 * for search, bare Feature for single-event lookup).
 */
export class EmscAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'emsc',
      baseUrl: EMSC_BASE,
      timeoutMs: 10_000,
      maxRetries: 2,
    });
  }

  protected buildRequest(): { url: string; method: string; headers: Record<string, string> } {
    // Not used — call() is overridden.
    return { url: '', method: 'GET', headers: {} };
  }

  protected parseResponse(raw: ProviderRawResponse): unknown {
    return raw.body;
  }

  async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    const params = (req.params ?? {}) as Record<string, unknown>;

    switch (req.toolId) {
      case 'emsc.search_earthquakes':
        return this.searchEarthquakes(req, params);
      case 'emsc.event_detail':
        return this.eventDetail(req, params);
      default:
        throw createEmscError(
          this.provider,
          req.toolId,
          ProviderErrorCode.INVALID_RESPONSE,
          502,
          `Unsupported tool: ${req.toolId}`,
          0,
        );
    }
  }

  private async searchEarthquakes(
    req: ProviderRequest,
    params: Record<string, unknown>,
  ): Promise<ProviderRawResponse> {
    const qs = new URLSearchParams();
    qs.set('format', 'json');

    if (params.starttime) qs.set('starttime', String(params.starttime));
    if (params.endtime) qs.set('endtime', String(params.endtime));
    if (params.minlatitude !== undefined) qs.set('minlatitude', String(params.minlatitude));
    if (params.maxlatitude !== undefined) qs.set('maxlatitude', String(params.maxlatitude));
    if (params.minlongitude !== undefined) qs.set('minlongitude', String(params.minlongitude));
    if (params.maxlongitude !== undefined) qs.set('maxlongitude', String(params.maxlongitude));
    if (params.latitude !== undefined) qs.set('latitude', String(params.latitude));
    if (params.longitude !== undefined) qs.set('longitude', String(params.longitude));
    if (params.maxradius !== undefined) qs.set('maxradius', String(params.maxradius));
    if (params.minmagnitude !== undefined) qs.set('minmagnitude', String(params.minmagnitude));
    if (params.maxmagnitude !== undefined) qs.set('maxmagnitude', String(params.maxmagnitude));
    if (params.mindepth !== undefined) qs.set('mindepth', String(params.mindepth));
    if (params.maxdepth !== undefined) qs.set('maxdepth', String(params.maxdepth));

    const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 200);
    qs.set('limit', String(limit));
    qs.set('orderby', 'time');

    const url = `${EMSC_BASE}?${qs.toString()}`;
    const result = await this.fetchEmsc(url, req);

    if (result === null) {
      const empty: EmscFeatureCollection = {
        type: 'FeatureCollection',
        metadata: { count: 0 },
        features: [],
      };
      return this.toRawResponse(empty, 0);
    }

    const data = result.body as EmscFeatureCollection;
    return this.toRawResponse(
      {
        title: `EMSC-RTS search: ${data.features?.length ?? 0} event(s)`,
        count: data.features?.length ?? 0,
        earthquakes: (data.features ?? []).map(mapFeature),
      },
      result.durationMs,
    );
  }

  private async eventDetail(
    req: ProviderRequest,
    params: Record<string, unknown>,
  ): Promise<ProviderRawResponse> {
    const eventid = String(params.eventid ?? '').trim();
    if (!eventid) {
      throw createEmscError(
        this.provider,
        req.toolId,
        ProviderErrorCode.INPUT_REJECTED,
        422,
        'eventid is required',
        0,
      );
    }

    const qs = new URLSearchParams();
    qs.set('format', 'json');
    qs.set('eventid', eventid);
    if (params.includeallmagnitudes) qs.set('includeallmagnitudes', 'true');
    if (params.includeallorigins) qs.set('includeallorigins', 'true');

    const url = `${EMSC_BASE}?${qs.toString()}`;
    const result = await this.fetchEmsc(url, req);

    if (result === null) {
      throw createEmscError(
        this.provider,
        req.toolId,
        ProviderErrorCode.INPUT_REJECTED,
        422,
        `No event found for eventid: ${eventid}`,
        0,
      );
    }

    // Single-event lookup returns a bare Feature at the top level, not a
    // FeatureCollection — different shape than the search endpoint.
    const feature = result.body as EmscFeature;
    return this.toRawResponse(mapFeature(feature), result.durationMs);
  }

  /**
   * Fetch + parse a single EMSC request, with timeout, size enforcement, and
   * retry on 5xx/timeout. Returns null for a valid empty result (HTTP 204).
   */
  private async fetchEmsc(
    url: string,
    req: ProviderRequest,
  ): Promise<{ body: unknown; durationMs: number } | null> {
    let lastError: ProviderError | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const delayMs = PROVIDER_BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
        await sleep(delayMs);
        logger.info(
          { provider: this.provider, tool_id: req.toolId, attempt: attempt + 1, delay_ms: delayMs },
          'Retrying EMSC provider call',
        );
      }

      const start = performance.now();
      try {
        return await this.fetchOnce(url, req, start);
      } catch (error) {
        const providerError = error as ProviderError;
        lastError = providerError;

        const retryable =
          providerError.code === ProviderErrorCode.TIMEOUT ||
          providerError.code === ProviderErrorCode.UNAVAILABLE;
        if (!retryable) throw providerError;

        logger.warn(
          {
            provider: this.provider,
            tool_id: req.toolId,
            attempt: attempt + 1,
            error_code: providerError.code,
          },
          'EMSC provider call failed, will retry',
        );
      }
    }

    throw lastError as ProviderError;
  }

  private async fetchOnce(
    url: string,
    req: ProviderRequest,
    start: number,
  ): Promise<{ body: unknown; durationMs: number } | null> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': 'APIbase/1.0 (apibase.pro)' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const durationMs = Math.round(performance.now() - start);
      const isTimeout =
        error instanceof DOMException ||
        (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'));
      throw createEmscError(
        this.provider,
        req.toolId,
        isTimeout ? ProviderErrorCode.TIMEOUT : ProviderErrorCode.UNAVAILABLE,
        isTimeout ? 504 : 502,
        isTimeout
          ? `Provider call timed out after ${this.timeoutMs}ms`
          : `Provider connection failed: ${error instanceof Error ? error.message : 'unknown'}`,
        durationMs,
      );
    }

    // FDSN nodata=204: zero matches is a valid empty result, not an error.
    if (response.status === 204) {
      return null;
    }

    const bodyText = await this.readBody(response, req, start);
    const durationMs = Math.round(performance.now() - start);

    if (response.status >= 500) {
      throw createEmscError(
        this.provider,
        req.toolId,
        ProviderErrorCode.UNAVAILABLE,
        502,
        `Provider returned ${response.status}`,
        durationMs,
      );
    }

    if (response.status >= 400) {
      const detail = bodyText.length > 0 ? `: ${bodyText.slice(0, 500)}` : '';
      throw createEmscError(
        this.provider,
        req.toolId,
        ProviderErrorCode.INPUT_REJECTED,
        422,
        `Provider rejected the request (HTTP ${response.status})${detail}`,
        durationMs,
      );
    }

    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      throw createEmscError(
        this.provider,
        req.toolId,
        ProviderErrorCode.INVALID_RESPONSE,
        502,
        'Provider returned invalid JSON',
        durationMs,
      );
    }

    return { body, durationMs };
  }

  private async readBody(response: Response, req: ProviderRequest, start: number): Promise<string> {
    if (!response.body) return '';

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    let totalBytes = 0;
    const maxBytes = this.maxResponseBytes ?? PROVIDER_MAX_RESPONSE_BYTES;

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          reader.cancel().catch(() => {});
          const durationMs = Math.round(performance.now() - start);
          throw createEmscError(
            this.provider,
            req.toolId,
            ProviderErrorCode.RESPONSE_TOO_LARGE,
            502,
            `Provider response exceeded ${maxBytes} byte limit`,
            durationMs,
          );
        }

        chunks.push(decoder.decode(value, { stream: true }));
      }
    } finally {
      reader.releaseLock();
    }

    chunks.push(decoder.decode());
    return chunks.join('');
  }

  private toRawResponse(body: unknown, durationMs: number): ProviderRawResponse {
    return {
      status: 200,
      headers: {},
      body,
      durationMs,
      byteLength: Buffer.byteLength(JSON.stringify(body), 'utf8'),
    };
  }
}

function mapFeature(f: EmscFeature): Record<string, unknown> {
  const props = f.properties;
  return {
    id: props.unid ?? f.id,
    time: props.time,
    magnitude: props.mag,
    magnitude_type: props.magtype,
    latitude: props.lat ?? f.geometry?.coordinates?.[1],
    longitude: props.lon ?? f.geometry?.coordinates?.[0],
    depth_km: props.depth ?? f.geometry?.coordinates?.[2],
    region: props.flynn_region,
    reporting_agency: props.auth,
    source_catalog: props.source_catalog,
    event_type: props.evtype,
    last_update: props.lastupdate,
  };
}

function createEmscError(
  provider: string,
  toolId: string,
  code: ProviderError['code'],
  httpStatus: number,
  message: string,
  durationMs: number,
): ProviderError {
  return { code, httpStatus, message, provider, toolId, durationMs };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
