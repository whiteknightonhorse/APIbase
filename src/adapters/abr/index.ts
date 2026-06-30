import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
  PROVIDER_TIMEOUT_MS,
  PROVIDER_MAX_RETRIES,
  PROVIDER_BACKOFF_BASE_MS,
} from '../../types/provider';
import { logger } from '../../config/logger';
import type { AbrEntityResponse, AbrNameSearchResponse } from './types';

const API_BASE = 'https://abr.business.gov.au/json';
const CALLBACK = 'abrcb';
const JSONP_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*\(([\s\S]*)\)\s*;?\s*$/;

/**
 * Australian Business Register (ABR) adapter (UC-543).
 *
 * Base URL: https://abr.business.gov.au/json
 * Auth: GUID (free registration at abr.business.gov.au/Tools/WebServices).
 * Response: JSONP — must strip the callback wrapper before JSON.parse.
 * ToS: ABR Web Services Agreement — commercial use permitted (passing extracts
 *      to third parties is explicitly allowed).
 *
 * Tools:
 *   abr.abn_lookup  → AbnDetails.aspx — resolve ABN to entity details
 *   abr.acn_lookup  → AcnDetails.aspx — resolve ACN to entity details
 *   abr.name_search → MatchingNames.aspx — search entities by name
 */
export class AbrAdapter extends BaseAdapter {
  private readonly guid: string;

  constructor(guid: string) {
    super({ provider: 'abr', baseUrl: API_BASE });
    this.guid = guid;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const p = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'abr.abn_lookup': {
        const abn = encodeURIComponent(String(p.abn ?? '').replace(/\s/g, ''));
        return {
          url: `${API_BASE}/AbnDetails.aspx?abn=${abn}&guid=${this.guid}&callback=${CALLBACK}`,
          method: 'GET',
          headers: { Accept: 'text/javascript,application/json' },
        };
      }
      case 'abr.acn_lookup': {
        const acn = encodeURIComponent(String(p.acn ?? '').replace(/\s/g, ''));
        return {
          url: `${API_BASE}/AcnDetails.aspx?acn=${acn}&guid=${this.guid}&callback=${CALLBACK}`,
          method: 'GET',
          headers: { Accept: 'text/javascript,application/json' },
        };
      }
      case 'abr.name_search': {
        const name = encodeURIComponent(String(p.name ?? ''));
        const maxResults = Math.min(50, Math.max(1, Number(p.max_results ?? 10)));
        const stateParam = p.state ? `&stateCode=${encodeURIComponent(String(p.state))}` : '';
        const postcodeParam = p.postcode
          ? `&postcode=${encodeURIComponent(String(p.postcode))}`
          : '';
        return {
          url: `${API_BASE}/MatchingNames.aspx?name=${name}&maxResults=${maxResults}${stateParam}${postcodeParam}&guid=${this.guid}&callback=${CALLBACK}`,
          method: 'GET',
          headers: { Accept: 'text/javascript,application/json' },
        };
      }
      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported ABR tool: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  /**
   * Override call() to handle JSONP responses — the base class assumes JSON.
   * ABR always returns `callbackFn({...})` with Content-Type: text/javascript.
   */
  async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    const built = this.buildRequest(req);
    const start = performance.now();

    for (let attempt = 0; attempt <= PROVIDER_MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delayMs = PROVIDER_BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delayMs));
        logger.info(
          { provider: this.provider, tool_id: req.toolId, attempt: attempt + 1 },
          'Retrying ABR call',
        );
      }

      try {
        const response = await fetch(built.url, {
          method: built.method,
          headers: built.headers,
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        });

        const durationMs = Math.round(performance.now() - start);
        const bodyText = await response.text();
        const byteLength = Buffer.byteLength(bodyText, 'utf8');

        if (response.status >= 500) {
          if (attempt < PROVIDER_MAX_RETRIES) continue;
          throw {
            code: ProviderErrorCode.UNAVAILABLE,
            httpStatus: 502,
            message: `ABR returned ${response.status}`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs,
          };
        }

        // Strip JSONP wrapper: abrcb({...}) → {...}
        const match = JSONP_RE.exec(bodyText);
        if (!match) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'ABR returned non-JSONP body',
            provider: this.provider,
            toolId: req.toolId,
            durationMs,
          };
        }

        const body = JSON.parse(match[1]) as AbrEntityResponse | AbrNameSearchResponse;
        const headers: Record<string, string> = {};
        response.headers.forEach((v, k) => {
          headers[k] = v;
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
      } catch (error) {
        if (attempt < PROVIDER_MAX_RETRIES) continue;
        const durationMs = Math.round(performance.now() - start);
        const isTimeout =
          error instanceof DOMException ||
          (error instanceof Error &&
            (error.name === 'TimeoutError' || error.name === 'AbortError'));
        throw {
          code: isTimeout ? ProviderErrorCode.TIMEOUT : ProviderErrorCode.UNAVAILABLE,
          httpStatus: isTimeout ? 504 : 502,
          message: isTimeout
            ? `ABR timed out after ${PROVIDER_TIMEOUT_MS}ms`
            : `ABR connection failed: ${error instanceof Error ? error.message : 'unknown'}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs,
        };
      }
    }

    throw {
      code: ProviderErrorCode.UNAVAILABLE,
      httpStatus: 502,
      message: 'ABR: all retries exhausted',
      provider: this.provider,
      toolId: req.toolId,
      durationMs: Math.round(performance.now() - start),
    };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    switch (req.toolId) {
      case 'abr.abn_lookup':
      case 'abr.acn_lookup':
        return this.parseEntity(raw.body as AbrEntityResponse);
      case 'abr.name_search':
        return this.parseNameSearch(raw.body as AbrNameSearchResponse);
      default:
        return raw.body;
    }
  }

  private parseEntity(r: AbrEntityResponse): unknown {
    if (r.Message && !r.Abn) {
      return { found: false, message: r.Message };
    }
    return {
      found: !!r.Abn,
      abn: r.Abn || null,
      acn: r.Acn || null,
      abn_status: r.AbnStatus || null,
      abn_status_since: r.AbnStatusEffectiveFrom || null,
      entity_name: r.EntityName || null,
      entity_type_code: r.EntityTypeCode || null,
      entity_type_name: r.EntityTypeName || null,
      gst_registered: r.Gst || null,
      address_state: r.AddressState || null,
      address_postcode: r.AddressPostcode || null,
      address_date: r.AddressDate || null,
      business_names: r.BusinessName ?? [],
      message: r.Message || null,
    };
  }

  private parseNameSearch(r: AbrNameSearchResponse): unknown {
    return {
      results: (r.Names ?? []).map((n) => ({
        abn: n.Abn,
        abn_status: n.AbnStatus,
        is_current: n.IsCurrent,
        name: n.Name,
        name_type: n.NameType,
        postcode: n.Postcode,
        state: n.State,
        score: n.Score,
      })),
      count: (r.Names ?? []).length,
      message: r.Message || null,
    };
  }
}
