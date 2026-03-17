import { BaseAdapter } from '../base.adapter';
import { logger } from '../../config/logger';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  QrGenerateResponse,
  QrReadApiResponse,
  QrReadResponse,
} from './types';

/**
 * QRServer adapter (UC-040).
 *
 * Supported tools:
 *   qrserver.generate → HEAD /v1/create-qr-code/ (returns structured URL)
 *   qrserver.read     → GET /v1/read-qr-code/
 *
 * Auth: None (fully free, open access).
 *
 * Note: /v1/create-qr-code/ returns PNG binary, not JSON.
 * The adapter makes a HEAD request to validate, then returns
 * a structured JSON response with the image URL for the agent.
 */
export class QrServerAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'qrserver',
      baseUrl: 'https://api.qrserver.com',
    });
  }

  /**
   * Override call() to handle the generate tool specially.
   * Generate returns binary PNG — we do a HEAD to validate,
   * then return a structured URL response.
   * Read tool uses normal JSON flow via super.call().
   */
  async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    if (req.toolId === 'qrserver.generate') {
      return this.handleGenerate(req);
    }
    // qrserver.read — normal JSON flow
    return super.call(req);
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'qrserver.read':
        return this.buildReadRequest(params, headers);
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
    switch (req.toolId) {
      case 'qrserver.read': {
        const apiResp = raw.body as QrReadApiResponse;
        if (!Array.isArray(apiResp) || apiResp.length === 0) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'QRServer read returned empty or invalid response',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        const result = apiResp[0];
        const symbol = result.symbol?.[0];
        if (!symbol || symbol.error) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: `QR decode failed: ${symbol?.error ?? 'no symbol data'}`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return {
          type: result.type,
          data: symbol.data,
          error: null,
        } as QrReadResponse;
      }
      default:
        return raw.body;
    }
  }

  // ---------------------------------------------------------------------------
  // Generate handler (HEAD request + URL return)
  // ---------------------------------------------------------------------------

  private async handleGenerate(req: ProviderRequest): Promise<ProviderRawResponse> {
    const params = req.params as Record<string, unknown>;
    const data = String(params.data);
    const size = String(params.size ?? '200x200');
    const format = String(params.format ?? 'png');
    const color = String(params.color ?? '000000');
    const bgcolor = String(params.bgcolor ?? 'ffffff');
    const margin = params.margin !== undefined ? Number(params.margin) : 1;
    const ecc = String(params.ecc ?? 'L');

    const qs = new URLSearchParams();
    qs.set('data', data);
    qs.set('size', size);
    qs.set('format', format);
    qs.set('color', color);
    qs.set('bgcolor', bgcolor);
    qs.set('qzone', String(margin));
    qs.set('ecc', ecc);

    const url = `${this.baseUrl}/v1/create-qr-code/?${qs.toString()}`;
    const start = performance.now();

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const durationMs = Math.round(performance.now() - start);
      const isTimeout =
        error instanceof DOMException ||
        (error instanceof Error && error.name === 'TimeoutError') ||
        (error instanceof Error && error.name === 'AbortError');

      throw {
        code: isTimeout ? ProviderErrorCode.TIMEOUT : ProviderErrorCode.UNAVAILABLE,
        httpStatus: isTimeout ? 504 : 502,
        message: isTimeout
          ? `Provider call timed out after ${this.timeoutMs}ms`
          : `Provider connection failed: ${error instanceof Error ? error.message : 'unknown'}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs,
      };
    }

    const durationMs = Math.round(performance.now() - start);

    if (response.status >= 400) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `QRServer generate returned HTTP ${response.status}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs,
      };
    }

    logger.info(
      { provider: this.provider, tool_id: req.toolId, duration_ms: durationMs, status: response.status },
      'QR code URL validated via HEAD',
    );

    const body: QrGenerateResponse = {
      url,
      data,
      size,
      format,
      color,
      bgcolor,
      margin,
      ecc,
    };

    return {
      status: 200,
      headers: {},
      body,
      durationMs,
      byteLength: Buffer.byteLength(JSON.stringify(body), 'utf8'),
    };
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildReadRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('fileurl', String(params.fileurl));

    return {
      url: `${this.baseUrl}/v1/read-qr-code/?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }
}
