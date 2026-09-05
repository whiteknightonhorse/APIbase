import { BaseAdapter } from '../base.adapter';
import type { ProviderRequest, ProviderRawResponse } from '../../types/provider';

export class Api2PdfAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ provider: 'api2pdf', baseUrl: 'https://v2.api2pdf.com', maxRetries: 1 });
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
      Authorization: this.apiKey,
      'Content-Type': 'application/json',
    };

    switch (req.toolId) {
      case 'pdf.from_html': {
        const payload: Record<string, unknown> = {
          html: params.html,
        };
        if (params.fileName) payload.fileName = params.fileName;
        if (params.options) payload.options = params.options;
        return {
          url: 'https://v2.api2pdf.com/chrome/html',
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        };
      }

      case 'pdf.from_url': {
        const payload: Record<string, unknown> = {
          url: params.url,
        };
        if (params.fileName) payload.fileName = params.fileName;
        if (params.options) payload.options = params.options;
        return {
          url: 'https://v2.api2pdf.com/chrome/url',
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        };
      }

      case 'pdf.merge': {
        const payload: Record<string, unknown> = {
          urls: params.urls,
        };
        if (params.fileName) payload.fileName = params.fileName;
        return {
          url: 'https://v2.api2pdf.com/merge',
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        };
      }

      default:
        throw new Error(`Unknown tool: ${req.toolId}`);
    }
  }

  // T-11 (2026-09-05) / Fable ruling-5 REJECT: this used to return
  // `{...raw, body: {...}}` — a whole ProviderRawResponse-shaped object,
  // not the parsed body. BaseAdapter.call() does `raw.body =
  // this.parseResponse(raw, req)` (base.adapter.ts), so that spread landed
  // the parsed fields one level too deep at `raw.body.body.*` instead of
  // `raw.body.*`. Two live consequences, both silent: (1) callers received
  // a nested `data.body.pdf_url` instead of the documented flat shape (a
  // pre-existing bug, fixed as a side effect here); (2)
  // provider-call.stage.ts's duck-typed read of `raw.body.cost_usd` (Fable
  // ruling-1 C.1) always saw `undefined`, so `execution_ledger
  // .upstream_cost_usd` stayed NULL for every real pdf.* call and the
  // auto-recharge spend monitor (ruling-1 C) never saw real money. Every
  // other adapter (see zyte/index.ts parseResponse) returns the parsed
  // body directly for exactly this reason — do the same here, and the
  // `status: 502` override this used to set was never read by the caller
  // either (only `.body` is reassigned), so signal the same "generation
  // failed" case via the body's own `error` field instead.
  parseResponse(raw: ProviderRawResponse, _req: ProviderRequest): unknown {
    const body = typeof raw.body === 'string' ? JSON.parse(raw.body) : raw.body;

    if (!body?.success || body?.error) {
      return { error: body?.error ?? 'API2PDF generation failed' };
    }

    return {
      success: true,
      pdf_url: body.pdf,
      file_size_mb: body.mbOut,
      cost_usd: body.cost,
      response_id: body.responseId,
    };
  }
}
