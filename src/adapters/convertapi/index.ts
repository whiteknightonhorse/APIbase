import { BaseAdapter } from '../base.adapter';
import type { ProviderRequest, ProviderRawResponse } from '../../types/provider';

export class ConvertApiAdapter extends BaseAdapter {
  private readonly apiSecret: string;

  constructor(apiSecret: string) {
    super({ timeout: 60_000, maxRetries: 1, maxResponseSize: 1_048_576 });
    this.apiSecret = apiSecret;
  }

  buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;
    const base = `https://v2.convertapi.com/convert`;
    const headers = { 'Content-Type': 'application/json' };

    switch (req.toolId) {
      case 'convert.to_pdf': {
        const from = String(params.from_format ?? 'docx');
        const parameters: Record<string, unknown>[] = [
          { Name: 'File', Value: params.source_url },
          { Name: 'StoreFile', Value: true },
        ];
        if (params.page_size) parameters.push({ Name: 'PageSize', Value: params.page_size });
        if (params.orientation) parameters.push({ Name: 'PageOrientation', Value: params.orientation });
        return {
          url: `${base}/${from}/to/pdf?Secret=${this.apiSecret}`,
          method: 'POST',
          headers,
          body: JSON.stringify({ Parameters: parameters }),
        };
      }

      case 'convert.from_pdf': {
        const to = String(params.to_format ?? 'docx');
        const parameters: Record<string, unknown>[] = [
          { Name: 'File', Value: params.source_url },
          { Name: 'StoreFile', Value: true },
        ];
        if (params.pages) parameters.push({ Name: 'PageRange', Value: params.pages });
        return {
          url: `${base}/pdf/to/${to}?Secret=${this.apiSecret}`,
          method: 'POST',
          headers,
          body: JSON.stringify({ Parameters: parameters }),
        };
      }

      case 'convert.web_to_pdf': {
        const parameters: Record<string, unknown>[] = [
          { Name: 'Url', Value: params.url },
          { Name: 'StoreFile', Value: true },
        ];
        if (params.viewport_width) parameters.push({ Name: 'ViewportWidth', Value: params.viewport_width });
        if (params.delay) parameters.push({ Name: 'WaitTime', Value: params.delay });
        if (params.load_lazy_content) parameters.push({ Name: 'LoadLazyContent', Value: true });
        return {
          url: `${base}/web/to/pdf?Secret=${this.apiSecret}`,
          method: 'POST',
          headers,
          body: JSON.stringify({ Parameters: parameters }),
        };
      }

      default:
        throw new Error(`Unknown tool: ${req.toolId}`);
    }
  }

  parseResponse(raw: ProviderRawResponse, _req: ProviderRequest): ProviderRawResponse {
    const body =
      typeof raw.body === 'string' ? JSON.parse(raw.body) : raw.body;

    if (body?.Code) {
      return {
        ...raw,
        status: 502,
        body: { error: body.Message ?? 'ConvertAPI conversion failed', code: body.Code },
      };
    }

    const files = (body?.Files ?? []).map((f: Record<string, unknown>) => ({
      file_name: f.FileName,
      file_ext: f.FileExt,
      file_size_bytes: f.FileSize,
      file_url: f.Url,
    }));

    return {
      ...raw,
      body: {
        success: true,
        conversion_cost: body?.ConversionCost,
        files,
      },
    };
  }
}
