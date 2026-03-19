import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { OcrResponse } from './types';

/**
 * OCR.space adapter (UC-078).
 *
 * Supported tools (read-only):
 *   ocr.extract_text → POST /parse/image (via URL)
 *
 * Auth: apikey header.
 * Free tier: 25,000 req/month, commercial OK.
 */
export class OcrSpaceAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'ocrspace',
      baseUrl: 'https://api.ocr.space',
      timeoutMs: 30_000, // OCR can take longer for large images
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

    switch (req.toolId) {
      case 'ocr.extract_text':
        return this.buildExtractRequest(params);
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
    const body = raw.body as unknown as OcrResponse;

    if (body.IsErroredOnProcessing || body.OCRExitCode > 2) {
      const errorMsg = body.ErrorMessage?.join('; ') ?? 'OCR processing failed';
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: errorMsg,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }

    return {
      text: (body.ParsedResults ?? []).map((r) => r.ParsedText).join('\n').trim(),
      pages: body.ParsedResults?.length ?? 0,
      processing_time_ms: parseInt(body.ProcessingTimeInMilliseconds ?? '0', 10),
      exit_code: body.OCRExitCode,
    };
  }

  private buildExtractRequest(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
  } {
    const formParts: string[] = [];
    formParts.push(`url=${encodeURIComponent(String(params.url))}`);
    formParts.push(`language=${String(params.language ?? 'eng')}`);
    formParts.push('isOverlayRequired=false');
    formParts.push('scale=true');
    if (params.filetype) formParts.push(`filetype=${String(params.filetype)}`);
    if (params.detect_orientation) formParts.push('detectOrientation=true');

    return {
      url: `${this.baseUrl}/parse/image`,
      method: 'POST',
      headers: {
        apikey: this.apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formParts.join('&'),
    };
  }
}
