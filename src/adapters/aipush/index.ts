import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  AIPushSetupResponse,
  AIPushStatusResponse,
  AIPushGenerateResponse,
  AIPushPagesResponse,
  AIPushPageContentResponse,
  AIPushProfileResponse,
  AIPushVisibilityResponse,
} from './types';

/**
 * AIPush adapter (UC-019).
 *
 * Internal service-to-service adapter for AIPush AI marketing engine.
 * Both services run on the same Hetzner server. AIPush is native (port 3000),
 * APIbase is Dockerized. Communication via Docker host gateway.
 *
 * Tools:
 *   aipush.setup_website    -> POST /api/internal/setup
 *   aipush.website_status   -> GET  /api/internal/status/:domain
 *   aipush.generate_page    -> POST /api/internal/generate
 *   aipush.list_pages       -> GET  /api/internal/pages/:domain
 *   aipush.page_content     -> GET  /api/internal/page/:domain/:slug
 *   aipush.website_profile  -> GET  /api/internal/profile/:domain
 *   aipush.check_visibility -> POST /api/internal/visibility
 *
 * Auth: X-Internal-Secret header (shared secret, service-to-service)
 */
export class AIPushAdapter extends BaseAdapter {
  private readonly internalSecret: string;

  constructor(internalSecret: string, baseUrl?: string) {
    super({
      provider: 'aipush',
      baseUrl: baseUrl || 'http://172.17.0.1:3000',
      timeoutMs: 180_000, // 3 min max (page generation can take 30-180s)
      maxRetries: 0,      // no auto-retry for internal service
    });
    this.internalSecret = internalSecret;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Internal-Secret': this.internalSecret,
    };

    switch (req.toolId) {
      case 'aipush.setup_website':
        return this.buildSetup(params, headers);
      case 'aipush.website_status':
        return this.buildStatus(params, headers);
      case 'aipush.generate_page':
        return this.buildGenerate(params, headers);
      case 'aipush.list_pages':
        return this.buildListPages(params, headers);
      case 'aipush.page_content':
        return this.buildPageContent(params, headers);
      case 'aipush.website_profile':
        return this.buildProfile(params, headers);
      case 'aipush.check_visibility':
        return this.buildVisibility(params, headers);
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

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;

    // AIPush internal API wraps responses in { ok: true, data: ... }
    const data = body.data ?? body;

    switch (req.toolId) {
      case 'aipush.setup_website': {
        const d = data as AIPushSetupResponse;
        if (!d.client_id) {
          throw new Error('Missing client_id in AIPush setup response');
        }
        return d;
      }
      case 'aipush.website_status': {
        const d = data as AIPushStatusResponse;
        if (!d.website_domain) {
          throw new Error('Missing website_domain in AIPush status response');
        }
        return d;
      }
      case 'aipush.generate_page': {
        const d = data as AIPushGenerateResponse;
        if (!d.slug) {
          throw new Error('Missing slug in AIPush generate response');
        }
        return d;
      }
      case 'aipush.list_pages': {
        const d = data as AIPushPagesResponse;
        if (!Array.isArray(d.pages)) {
          throw new Error('Missing pages array in AIPush list response');
        }
        return d;
      }
      case 'aipush.page_content': {
        const d = data as AIPushPageContentResponse;
        if (!d.html_content) {
          throw new Error('Missing html_content in AIPush page response');
        }
        return d;
      }
      case 'aipush.website_profile': {
        const d = data as AIPushProfileResponse;
        if (!d.business_name) {
          throw new Error('Missing business_name in AIPush profile response');
        }
        return d;
      }
      case 'aipush.check_visibility': {
        const d = data as AIPushVisibilityResponse;
        if (typeof d.overall_score !== 'number') {
          throw new Error('Missing overall_score in AIPush visibility response');
        }
        return d;
      }
      default:
        return data;
    }
  }

  // ---------------------------------------------------------------------------
  // aipush.setup_website — Register website + trigger MIP analysis
  // ---------------------------------------------------------------------------

  private buildSetup(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string>; body: string } {
    return {
      url: `${this.baseUrl}/api/internal/setup`,
      method: 'POST',
      headers,
      body: JSON.stringify({
        website_domain: String(params.website_domain),
        target_url: String(params.target_url),
      }),
    };
  }

  // ---------------------------------------------------------------------------
  // aipush.website_status — Full status check
  // ---------------------------------------------------------------------------

  private buildStatus(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const domain = encodeURIComponent(String(params.website_domain));
    return {
      url: `${this.baseUrl}/api/internal/status/${domain}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // aipush.generate_page — Generate one AI-optimized page
  // ---------------------------------------------------------------------------

  private buildGenerate(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string>; body: string } {
    const body: Record<string, unknown> = {
      website_domain: String(params.website_domain),
    };
    if (params.keyword) body.keyword = String(params.keyword);

    return {
      url: `${this.baseUrl}/api/internal/generate`,
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    };
  }

  // ---------------------------------------------------------------------------
  // aipush.list_pages — List published pages
  // ---------------------------------------------------------------------------

  private buildListPages(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const domain = encodeURIComponent(String(params.website_domain));
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));
    const query = qs.toString();

    return {
      url: `${this.baseUrl}/api/internal/pages/${domain}${query ? '?' + query : ''}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // aipush.page_content — Get full HTML content of a page
  // ---------------------------------------------------------------------------

  private buildPageContent(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const domain = encodeURIComponent(String(params.website_domain));
    const slug = encodeURIComponent(String(params.slug));

    return {
      url: `${this.baseUrl}/api/internal/page/${domain}/${slug}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // aipush.website_profile — Get MIP business analysis
  // ---------------------------------------------------------------------------

  private buildProfile(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const domain = encodeURIComponent(String(params.website_domain));

    return {
      url: `${this.baseUrl}/api/internal/profile/${domain}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // aipush.check_visibility — AI visibility score
  // ---------------------------------------------------------------------------

  private buildVisibility(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string>; body: string } {
    return {
      url: `${this.baseUrl}/api/internal/visibility`,
      method: 'POST',
      headers,
      body: JSON.stringify({
        website_domain: String(params.website_domain),
      }),
    };
  }
}
