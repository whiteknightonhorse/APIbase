import { BaseAdapter } from '../base.adapter';
import { type ProviderRequest, type ProviderRawResponse, ProviderErrorCode } from '../../types/provider';

/**
 * ApiFlash screenshot adapter (UC-093).
 * Auth: access_key query param. Free: 100/month.
 */
export class ApiFlashAdapter extends BaseAdapter {
  private readonly accessKey: string;

  constructor(accessKey: string) {
    super({ provider: 'apiflash', baseUrl: 'https://api.apiflash.com/v1', timeoutMs: 30_000 });
    this.accessKey = accessKey;
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    if (req.toolId !== 'screenshot.capture') {
      throw { code: ProviderErrorCode.INVALID_RESPONSE, httpStatus: 502, message: `Unsupported: ${req.toolId}`, provider: this.provider, toolId: req.toolId, durationMs: 0 };
    }

    const qs = new URLSearchParams();
    qs.set('access_key', this.accessKey);
    qs.set('url', String(p.url));
    qs.set('response_type', 'json');
    qs.set('format', String(p.format ?? 'png'));
    if (p.width) qs.set('width', String(p.width));
    if (p.height) qs.set('height', String(p.height));
    if (p.full_page) qs.set('full_page', 'true');
    if (p.delay) qs.set('delay', String(p.delay));
    if (p.no_ads) qs.set('no_ads', 'true');
    if (p.no_cookie_banners) qs.set('no_cookie_banners', 'true');
    qs.set('wait_until', String(p.wait_until ?? 'page_loaded'));

    return { url: `${this.baseUrl}/urltoimage?${qs}`, method: 'GET', headers: { Accept: 'application/json' } };
  }

  protected parseResponse(raw: ProviderRawResponse, _req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;
    return {
      screenshot_url: body.url ?? null,
    };
  }
}
