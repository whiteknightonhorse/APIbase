import { randomUUID } from 'crypto';
import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  type ProviderError,
  ProviderErrorCode,
} from '../../types/provider';

const COMFY_BASE_URL = 'https://api.comfy.org/v2';
const STABILITY_BASE_URL = 'https://api.stability.ai/v2beta';
/** Generated PNGs are far below this; the cap only bounds a hostile/broken URL. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Truncated base64 preview + data URI for agents (same shape on both backends). */
function toImageOutput(b64: string, seed: unknown, finishReason: unknown) {
  return {
    image_base64_preview: b64.slice(0, 200) + '...',
    image_data_uri: `data:image/png;base64,${b64}`,
    image_size_bytes: Math.round(b64.length * 0.75),
    seed,
    finish_reason: finishReason ?? 'SUCCESS',
  };
}

export type StabilityBackend = 'comfy' | 'stability';

/**
 * Stability AI image generation adapter (UC-080).
 * T-0804: backend 'comfy' = Stability served through Comfy Router
 * (X-API-Key, JSON body, image returned as a signed URL). Backend 'stability'
 * = legacy api.stability.ai (Bearer, form body), which Stability retires on 2026-12-10.
 */
export class StabilityAdapter extends BaseAdapter {
  private readonly apiKey: string;
  private readonly backend: StabilityBackend;

  constructor(apiKey: string, backend: StabilityBackend = 'stability') {
    super({
      provider: 'stability',
      baseUrl: backend === 'comfy' ? COMFY_BASE_URL : STABILITY_BASE_URL,
      timeoutMs: 30_000,
    });
    this.apiKey = apiKey;
    this.backend = backend;
  }

  async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    if (this.backend !== 'comfy') return super.call(req);
    let raw: ProviderRawResponse;
    try {
      raw = await super.call(req);
    } catch (error) {
      const e = error as ProviderError;
      // Comfy 402 insufficient_credits: our workspace is out of credits, the
      // agent is not at fault. Report provider-unavailable, not auth/502.
      if (e && e.code === ProviderErrorCode.PROVIDER_AUTH && /HTTP 402/.test(String(e.message))) {
        throw {
          ...e,
          code: ProviderErrorCode.UNAVAILABLE,
          httpStatus: 503,
          message: 'Image provider temporarily unavailable (provider credits exhausted)',
        };
      }
      throw error;
    }
    // parseResponse (run inside super.call) left the signed URL under image_url
    const body = raw.body as Record<string, unknown> | null;
    if (body && typeof body.image_url === 'string') {
      const b64 = await this.fetchImageBase64(body.image_url, req);
      return { ...raw, body: toImageOutput(b64, body.seed, body.finish_reason) };
    }
    return raw;
  }

  /** Comfy returns a signed URL (valid 24h); download it and encode so the output matches the legacy shape. */
  private async fetchImageBase64(url: string, req: ProviderRequest): Promise<string> {
    const fail = (message: string): never => {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    };
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });
    } catch {
      return fail('Could not download generated image');
    }
    if (!res.ok) return fail(`Generated image download failed (HTTP ${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) return fail('Generated image too large');
    return buf.toString('base64');
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const p = req.params as Record<string, unknown>;

    if (req.toolId !== 'stability.generate') {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Unsupported: ${req.toolId}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    if (this.backend === 'comfy') {
      const body: Record<string, unknown> = { prompt: String(p.prompt), output_format: 'png' };
      if (p.negative_prompt) body.negative_prompt = String(p.negative_prompt);
      if (p.aspect_ratio) body.aspect_ratio = String(p.aspect_ratio);
      if (p.style_preset) body.style_preset = String(p.style_preset);
      return {
        url: `${this.baseUrl}/models/stability/generate-core`,
        method: 'POST',
        headers: {
          'X-API-Key': this.apiKey,
          'Idempotency-Key': randomUUID(),
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      };
    }

    // Stability uses multipart/form-data — build URL-encoded body instead
    const parts: string[] = [];
    parts.push(`prompt=${encodeURIComponent(String(p.prompt))}`);
    if (p.negative_prompt)
      parts.push(`negative_prompt=${encodeURIComponent(String(p.negative_prompt))}`);
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
    if (this.backend === 'comfy') {
      // Comfy returns a signed URL; call() downloads it and builds the final output
      if (typeof body.image === 'string' && /^https:\/\//.test(body.image)) {
        return { image_url: body.image, seed: body.seed, finish_reason: body.finish_reason };
      }
      return body;
    }
    if (body.image) return toImageOutput(String(body.image), body.seed, body.finish_reason);
    return body;
  }
}
