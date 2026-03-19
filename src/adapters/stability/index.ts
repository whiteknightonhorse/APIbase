import { BaseAdapter } from '../base.adapter';
import { type ProviderRequest, type ProviderRawResponse, ProviderErrorCode } from '../../types/provider';

/**
 * Stability AI image generation adapter (UC-080).
 * Auth: Bearer token. Free: 25 credits. PAYG $0.01/credit.
 */
export class StabilityAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ provider: 'stability', baseUrl: 'https://api.stability.ai/v2beta', timeoutMs: 30_000 });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;

    if (req.toolId !== 'stability.generate') {
      throw { code: ProviderErrorCode.INVALID_RESPONSE, httpStatus: 502, message: `Unsupported: ${req.toolId}`, provider: this.provider, toolId: req.toolId, durationMs: 0 };
    }

    // Stability uses multipart/form-data — build URL-encoded body instead
    const parts: string[] = [];
    parts.push(`prompt=${encodeURIComponent(String(p.prompt))}`);
    if (p.negative_prompt) parts.push(`negative_prompt=${encodeURIComponent(String(p.negative_prompt))}`);
    if (p.aspect_ratio) parts.push(`aspect_ratio=${encodeURIComponent(String(p.aspect_ratio))}`);
    if (p.style_preset) parts.push(`style_preset=${encodeURIComponent(String(p.style_preset))}`);
    parts.push('output_format=png');

    return {
      url: `${this.baseUrl}/stable-image/generate/core`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: parts.join('&'),
    };
  }

  protected parseResponse(raw: ProviderRawResponse, _req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;
    if (body.image) {
      // Return truncated base64 preview + data URI for agents
      const b64 = String(body.image);
      return {
        image_base64_preview: b64.slice(0, 200) + '...',
        image_data_uri: `data:image/png;base64,${b64}`,
        image_size_bytes: Math.round(b64.length * 0.75),
        seed: body.seed,
        finish_reason: body.finish_reason ?? 'SUCCESS',
      };
    }
    return body;
  }
}
