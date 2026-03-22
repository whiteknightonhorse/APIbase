import { BaseAdapter } from '../base.adapter';
import type { ProviderRequest, ProviderRawResponse } from '../../types/provider';

export class Api2PdfAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ timeout: 30_000, maxRetries: 1, maxResponseSize: 512_000 });
    this.apiKey = apiKey;
  }

  buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;
    const headers = {
      'Authorization': this.apiKey,
      'Content-Type': 'application/json',
    };

    switch (req.toolId) {
      case 'pdf.from_html': {
        const payload: Record<string, unknown> = {
          html: params.html,
        };
        if (params.fileName) payload.fileName = params.fileName;
        if (params.options) payload.options = params.options;
        return { url: 'https://v2.api2pdf.com/chrome/html', method: 'POST', headers, body: JSON.stringify(payload) };
      }

      case 'pdf.from_url': {
        const payload: Record<string, unknown> = {
          url: params.url,
        };
        if (params.fileName) payload.fileName = params.fileName;
        if (params.options) payload.options = params.options;
        return { url: 'https://v2.api2pdf.com/chrome/url', method: 'POST', headers, body: JSON.stringify(payload) };
      }

      case 'pdf.merge': {
        const payload: Record<string, unknown> = {
          urls: params.urls,
        };
        if (params.fileName) payload.fileName = params.fileName;
        return { url: 'https://v2.api2pdf.com/merge', method: 'POST', headers, body: JSON.stringify(payload) };
      }

      default:
        throw new Error(`Unknown tool: ${req.toolId}`);
    }
  }

  parseResponse(raw: ProviderRawResponse, _req: ProviderRequest): ProviderRawResponse {
    const body =
      typeof raw.body === 'string' ? JSON.parse(raw.body) : raw.body;

    if (!body?.success || body?.error) {
      return {
        ...raw,
        status: 502,
        body: { error: body?.error ?? 'API2PDF generation failed' },
      };
    }

    return {
      ...raw,
      body: {
        success: true,
        pdf_url: body.pdf,
        file_size_mb: body.mbOut,
        cost_usd: body.cost,
        response_id: body.responseId,
      },
    };
  }
}
