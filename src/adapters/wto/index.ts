import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
  PROVIDER_TIMEOUT_MS,
} from '../../types/provider';
import type { WtoIndicator, WtoEconomy, WtoTopic, WtoDataPoint, WtoDataResponse } from './types';

const WTO_BASE = 'https://api.wto.org/timeseries/v1';

/**
 * WTO Timeseries API adapter (UC-494).
 * World Trade Organization trade/tariff statistics — 58 indicators, 288 economies.
 * Auth: Azure APIM subscription key via Ocp-Apim-Subscription-Key header.
 * Rate limit: 10 req/s, 10K req/h per key.
 * Note: some /data responses are Windows-1252 encoded (em-dashes in indicator names);
 * call() is overridden to use TextDecoder('windows-1252') for correct decoding.
 */
export class WtoAdapter extends BaseAdapter {
  private readonly apiKey: string;
  private readonly secondaryKey: string;

  constructor(apiKey: string, secondaryKey: string) {
    super({ provider: 'wto', baseUrl: WTO_BASE });
    this.apiKey = apiKey;
    this.secondaryKey = secondaryKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      'Ocp-Apim-Subscription-Key': this.apiKey,
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'wto.trade_data': {
        const qp = new URLSearchParams();
        qp.set('i', String(params.indicator_codes));
        qp.set('r', String(params.reporter_codes));
        qp.set('lang', '1');
        if (params.partner_codes) qp.set('p', String(params.partner_codes));
        if (params.years) qp.set('ps', String(params.years));
        const maxRows = Math.min(Number(params.max_rows) || 100, 500);
        qp.set('max', String(maxRows));
        return { url: `${WTO_BASE}/data?${qp.toString()}`, method: 'GET', headers };
      }

      case 'wto.indicators': {
        const qp = new URLSearchParams();
        qp.set('lang', '1');
        qp.set('detailed', 'false');
        if (params.topic_id) qp.set('t', String(params.topic_id));
        if (params.category) qp.set('c', String(params.category));
        return { url: `${WTO_BASE}/indicators?${qp.toString()}`, method: 'GET', headers };
      }

      case 'wto.reporters': {
        const qp = new URLSearchParams();
        qp.set('lang', '1');
        return { url: `${WTO_BASE}/reporters?${qp.toString()}`, method: 'GET', headers };
      }

      case 'wto.topics': {
        const qp = new URLSearchParams();
        qp.set('lang', '1');
        return { url: `${WTO_BASE}/topics?${qp.toString()}`, method: 'GET', headers };
      }

      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported tool: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
          retryable: false,
        };
    }
  }

  /**
   * Override call() to use windows-1252 TextDecoder.
   * Some WTO /data responses embed Windows-1252 special chars (em-dashes 0x96)
   * in indicator names, which breaks Node's default UTF-8 TextDecoder.
   */
  override async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    const built = this.buildRequest(req);
    const start = performance.now();

    let response: Response;
    try {
      response = await fetch(built.url, {
        method: built.method,
        headers: built.headers,
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });
    } catch (error) {
      const durationMs = Math.round(performance.now() - start);
      const isTimeout =
        error instanceof DOMException ||
        (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'));
      throw {
        code: isTimeout ? ProviderErrorCode.TIMEOUT : ProviderErrorCode.UNAVAILABLE,
        httpStatus: isTimeout ? 504 : 502,
        message: isTimeout
          ? `Provider call timed out after ${PROVIDER_TIMEOUT_MS}ms`
          : `Provider connection failed: ${error instanceof Error ? error.message : 'unknown'}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs,
        cause: error instanceof Error ? error : undefined,
      };
    }

    const durationMs = Math.round(performance.now() - start);

    // Read body as ArrayBuffer and decode with windows-1252 to handle em-dashes
    const arrayBuffer = await response.arrayBuffer();
    const bodyText = new TextDecoder('windows-1252').decode(arrayBuffer);
    const byteLength = arrayBuffer.byteLength;

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('retry-after') ?? '60', 10);
      throw {
        code: ProviderErrorCode.RATE_LIMIT,
        httpStatus: 429,
        message: `WTO API rate limit exceeded`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs,
        retryAfter,
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

    if (response.status === 401 || response.status === 402 || response.status === 403) {
      const detail = bodyText.length > 0 ? `: ${bodyText.slice(0, 300)}` : '';
      // Try secondary key on 401 — Azure APIM primary may be rate-limited
      if (response.status === 401 && this.secondaryKey && this.secondaryKey !== this.apiKey) {
        const retryHeaders = { ...built.headers, 'Ocp-Apim-Subscription-Key': this.secondaryKey };
        try {
          const r2 = await fetch(built.url, {
            method: built.method,
            headers: retryHeaders,
            signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
          });
          if (r2.ok) {
            const ab2 = await r2.arrayBuffer();
            const bt2 = new TextDecoder('windows-1252').decode(ab2);
            const body2 = JSON.parse(bt2);
            const raw2: ProviderRawResponse = {
              status: r2.status,
              headers: {},
              body: body2,
              durationMs: Math.round(performance.now() - start),
              byteLength: ab2.byteLength,
            };
            raw2.body = this.parseResponse(raw2, req);
            return raw2;
          }
        } catch {
          // fall through to original error
        }
      }
      throw {
        code: ProviderErrorCode.PROVIDER_AUTH,
        httpStatus: 503,
        message: `Provider rejected our credentials (HTTP ${response.status})${detail}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs,
        retryAfter: 60,
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

    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'Provider returned invalid JSON',
        provider: this.provider,
        toolId: req.toolId,
        durationMs,
      };
    }

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const raw: ProviderRawResponse = {
      status: response.status,
      headers,
      body,
      durationMs,
      byteLength,
    };
    raw.body = this.parseResponse(raw, req);
    return raw;
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    switch (req.toolId) {
      case 'wto.trade_data': {
        const resp = raw.body as WtoDataResponse;
        const dataset: WtoDataPoint[] = Array.isArray(resp?.Dataset) ? resp.Dataset : [];
        return {
          count: dataset.length,
          data: dataset.map((d) => ({
            indicator_code: d.IndicatorCode,
            indicator: d.Indicator,
            category: d.IndicatorCategory,
            reporter_code: d.ReportingEconomyCode,
            reporter: d.ReportingEconomy,
            partner_code: d.PartnerEconomyCode,
            partner: d.PartnerEconomy,
            product_code: d.ProductOrSectorCode,
            product: d.ProductOrSector,
            year: d.Year,
            value: d.Value,
            unit: d.Unit,
            unit_code: d.UnitCode,
            frequency: d.Frequency,
            value_flag: d.ValueFlag,
            text_value: d.TextValue,
          })),
        };
      }

      case 'wto.indicators': {
        const list = raw.body as WtoIndicator[];
        if (!Array.isArray(list)) return { count: 0, indicators: [] };
        return {
          count: list.length,
          indicators: list.map((x) => ({
            code: x.code,
            name: x.name,
            category_code: x.categoryCode,
            category: x.categoryLabel,
            subcategory_code: x.subcategoryCode,
            subcategory: x.subcategoryLabel,
            unit: x.unitLabel,
            frequency: x.frequencyLabel,
            start_year: x.startYear,
            end_year: x.endYear,
            reporters: x.numberReporters,
            datapoints: x.numberDatapoints,
            update_frequency: x.updateFrequency,
          })),
        };
      }

      case 'wto.reporters': {
        const list = raw.body as WtoEconomy[];
        if (!Array.isArray(list)) return { count: 0, reporters: [] };
        return {
          count: list.length,
          reporters: list.map((x) => ({
            code: x.code,
            iso3: x.iso3A,
            name: x.name,
          })),
        };
      }

      case 'wto.topics': {
        const list = raw.body as WtoTopic[];
        if (!Array.isArray(list)) return { count: 0, topics: [] };
        return {
          count: list.length,
          topics: list.map((x) => ({
            id: x.id,
            name: x.name,
          })),
        };
      }

      default:
        return raw.body;
    }
  }
}
