import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  ZyteExtractResponse,
  ScrapeExtractOutput,
  ScrapeBrowserOutput,
  ScrapeScreenshotOutput,
} from './types';

/**
 * Zyte API Web Scraping adapter (UC-233).
 *
 * Supported tools:
 *   scrape.extract    → POST /extract {httpResponseBody: true}
 *   scrape.browser    → POST /extract {browserHtml: true}
 *   scrape.screenshot → POST /extract {screenshot: true}
 *
 * Auth: HTTP Basic Auth (API key as username, empty password).
 * Trial: $5 free credit. PAYG: $0.00013–$0.01608/request.
 */
export class ZyteAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'zyte',
      baseUrl: 'https://api.zyte.com/v1',
    });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const targetUrl = String(params.url ?? '');

    const authHeader = 'Basic ' + Buffer.from(`${this.apiKey}:`).toString('base64');
    const headers: Record<string, string> = {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    };

    const bodyObj: Record<string, unknown> = { url: targetUrl };

    switch (req.toolId) {
      case 'scrape.extract':
        bodyObj.httpResponseBody = true;
        break;
      case 'scrape.browser':
        bodyObj.browserHtml = true;
        break;
      case 'scrape.screenshot':
        bodyObj.screenshot = true;
        break;
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

    return {
      url: `${this.baseUrl}/extract`,
      method: 'POST',
      headers,
      body: JSON.stringify(bodyObj),
    };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as unknown as ZyteExtractResponse;

    switch (req.toolId) {
      case 'scrape.extract':
        return this.parseExtract(body);
      case 'scrape.browser':
        return this.parseBrowser(body);
      case 'scrape.screenshot':
        return this.parseScreenshot(body);
      default:
        return body;
    }
  }

  private parseExtract(body: ZyteExtractResponse): ScrapeExtractOutput {
    const decoded = body.httpResponseBody
      ? Buffer.from(body.httpResponseBody, 'base64').toString('utf-8')
      : '';
    // Truncate to 50KB to stay within response size limits
    const html = decoded.length > 50_000 ? decoded.slice(0, 50_000) + '\n[...truncated]' : decoded;
    return {
      url: body.url ?? '',
      status_code: body.statusCode ?? 0,
      html,
      content_length: decoded.length,
    };
  }

  private parseBrowser(body: ZyteExtractResponse): ScrapeBrowserOutput {
    const html = body.browserHtml ?? '';
    const truncated = html.length > 50_000 ? html.slice(0, 50_000) + '\n[...truncated]' : html;
    return {
      url: body.url ?? '',
      status_code: body.statusCode ?? 0,
      html: truncated,
      content_length: html.length,
    };
  }

  private parseScreenshot(body: ZyteExtractResponse): ScrapeScreenshotOutput {
    const ss = body.screenshot ?? '';
    return {
      url: body.url ?? '',
      status_code: body.statusCode ?? 0,
      screenshot_base64: ss,
      size_kb: Math.round((ss.length * 3) / 4 / 1024),
    };
  }
}
