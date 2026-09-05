import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
  PROVIDER_BACKOFF_BASE_MS,
} from '../../types/provider';
import { logger } from '../../config/logger';

/**
 * NASA FIRMS adapter (UC-108).
 * Satellite fire detection. Auth: MAP_KEY.
 * Free: 5,000 tx/10min. NASA open data.
 *
 * Overrides call() because the upstream returns CSV, not JSON. Pattern shared with
 * gebco, nrc, and other adapters handling non-JSON content-type.
 */
export class FirmsAdapter extends BaseAdapter {
  private readonly mapKey: string;

  constructor(mapKey: string) {
    super({
      provider: 'firms',
      baseUrl: 'https://firms.modaps.eosdis.nasa.gov/api',
      timeoutMs: 30_000,
    });
    this.mapKey = mapKey;
  }

  protected buildRequest(): { url: string; method: string; headers: Record<string, string> } {
    // Not used — call() is fully overridden for CSV handling
    return { url: '', method: 'GET', headers: {} };
  }

  protected parseResponse(raw: ProviderRawResponse): unknown {
    return raw.body;
  }

  async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    const start = performance.now();
    const p = req.params as Record<string, unknown>;

    if (req.toolId !== 'firms.fires') {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Unsupported: ${req.toolId}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    const source = String(p.source ?? 'VIIRS_SNPP_NRT');
    const days = String(p.days ?? 1);
    const west = p.west ?? -180;
    const south = p.south ?? -90;
    const east = p.east ?? 180;
    const north = p.north ?? 90;
    const area = `${west},${south},${east},${north}`;

    const url = `${this.baseUrl}/area/csv/${this.mapKey}/${source}/${area}/${days}`;
    const csv = await this.fetchCsv(url, req);
    const body = this.parseCsv(csv);

    const durationMs = Math.round(performance.now() - start);
    logger.info({ tool_id: req.toolId, duration_ms: durationMs }, 'FIRMS query completed');

    return {
      status: 200,
      headers: { 'content-type': 'text/csv' },
      body,
      durationMs,
      byteLength: csv.length,
    };
  }

  private async fetchCsv(url: string, req: ProviderRequest): Promise<string> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const delayMs = PROVIDER_BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
        await sleep(delayMs);
        logger.info(
          { provider: this.provider, tool_id: req.toolId, attempt: attempt + 1, delay_ms: delayMs },
          'Retrying FIRMS fetch',
        );
      }

      const fetchStart = performance.now();
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'GET',
          headers: { Accept: 'text/csv' },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        const durationMs = Math.round(performance.now() - fetchStart);
        const isTimeout =
          error instanceof DOMException ||
          (error instanceof Error && error.name === 'TimeoutError') ||
          (error instanceof Error && error.name === 'AbortError');

        const err = isTimeout
          ? {
              code: ProviderErrorCode.TIMEOUT,
              httpStatus: 504,
              message: `Provider call timed out after ${this.timeoutMs}ms`,
              provider: this.provider,
              toolId: req.toolId,
              durationMs,
            }
          : {
              code: ProviderErrorCode.UNAVAILABLE,
              httpStatus: 502,
              message: `Provider connection failed: ${error instanceof Error ? error.message : 'unknown'}`,
              provider: this.provider,
              toolId: req.toolId,
              durationMs,
            };

        lastError = err;
        if (isTimeout || err.code === ProviderErrorCode.TIMEOUT) {
          continue; // retry on timeout
        }
        throw err;
      }

      // Handle upstream error statuses
      if (response.status >= 500) {
        lastError = {
          code: ProviderErrorCode.UNAVAILABLE,
          httpStatus: 502,
          message: `Provider returned ${response.status}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: Math.round(performance.now() - fetchStart),
        };
        continue; // retry on 5xx
      }

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('retry-after') ?? '60', 10);
        throw {
          code: ProviderErrorCode.RATE_LIMIT,
          httpStatus: 429,
          message: 'Provider API rate limit exceeded',
          provider: this.provider,
          toolId: req.toolId,
          durationMs: Math.round(performance.now() - fetchStart),
          retryAfter,
        };
      }

      if (response.status === 401 || response.status === 402 || response.status === 403) {
        throw {
          code: ProviderErrorCode.PROVIDER_AUTH,
          httpStatus: 503,
          message: `Provider rejected our credentials (HTTP ${response.status})`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: Math.round(performance.now() - fetchStart),
          retryAfter: 60,
        };
      }

      if (response.status >= 400) {
        const detail = await response
          .text()
          .then((t) => (t.length > 0 ? `: ${t.slice(0, 500)}` : ''));
        throw {
          code: ProviderErrorCode.INPUT_REJECTED,
          httpStatus: 422,
          message: `Provider rejected the request (HTTP ${response.status})${detail}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: Math.round(performance.now() - fetchStart),
        };
      }

      // Success — read and return CSV text
      return await response.text();
    }

    throw lastError;
  }

  private parseCsv(csv: string): unknown {
    // Parse CSV into structured fire records
    const lines = csv.split('\n').filter((l: string) => l.trim());
    if (lines.length < 2) {
      return { total: 0, fires: [] };
    }

    const headers = lines[0].split(',');
    const fires = [];

    for (let i = 1; i < Math.min(lines.length, 51); i++) {
      const vals = lines[i].split(',');
      const fire: Record<string, unknown> = {};

      for (let j = 0; j < headers.length; j++) {
        const key = headers[j].trim();
        const val = vals[j]?.trim();

        if (
          key === 'latitude' ||
          key === 'longitude' ||
          key === 'bright_ti4' ||
          key === 'bright_ti5' ||
          key === 'frp'
        ) {
          fire[key] = parseFloat(val) || null;
        } else {
          fire[key] = val;
        }
      }

      fires.push({
        latitude: fire.latitude,
        longitude: fire.longitude,
        brightness: fire.bright_ti4,
        confidence: fire.confidence,
        satellite: fire.satellite,
        instrument: fire.instrument,
        date: fire.acq_date,
        fire_radiative_power: fire.frp,
        day_night: fire.daynight,
      });
    }

    return { total: lines.length - 1, fires };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
