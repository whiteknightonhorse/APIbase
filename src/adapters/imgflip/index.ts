import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { ImgflipMeme, ImgflipMemesOutput, ImgflipCaptionOutput } from './types';

/**
 * Imgflip adapter (UC-286).
 *
 * Supported tools:
 *   imgflip.memes   → GET /get_memes (no auth)
 *   imgflip.caption → POST /caption_image (username+password)
 *
 * Auth: username+password in POST body for caption. Free unlimited.
 * 100K+ meme templates, programmatic meme generation.
 */
export class ImgflipAdapter extends BaseAdapter {
  private readonly username: string;
  private readonly password: string;

  constructor(username: string, password: string) {
    super({
      provider: 'imgflip',
      baseUrl: 'https://api.imgflip.com',
    });
    this.username = username;
    this.password = password;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'imgflip.memes':
        return {
          url: `${this.baseUrl}/get_memes`,
          method: 'GET',
          headers: {},
        };

      case 'imgflip.caption': {
        const formData = new URLSearchParams();
        formData.set('template_id', String(params.template_id));
        formData.set('username', this.username);
        formData.set('password', this.password);
        formData.set('text0', String(params.top_text || ''));
        formData.set('text1', String(params.bottom_text || ''));
        return {
          url: `${this.baseUrl}/caption_image`,
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString(),
        };
      }

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

    switch (req.toolId) {
      case 'imgflip.memes':
        return this.parseMemes(body);
      case 'imgflip.caption':
        return this.parseCaption(body);
      default:
        return body;
    }
  }

  private parseMemes(body: Record<string, unknown>): ImgflipMemesOutput {
    const data = (body.data ?? {}) as Record<string, unknown>;
    const memes = (data.memes ?? []) as ImgflipMeme[];
    return {
      memes: memes.map((m) => ({
        id: m.id,
        name: m.name,
        url: m.url,
        boxes: m.box_count ?? 2,
      })),
      count: memes.length,
    };
  }

  private parseCaption(body: Record<string, unknown>): ImgflipCaptionOutput {
    const data = (body.data ?? {}) as Record<string, unknown>;
    return {
      url: (data.url as string) ?? '',
      page_url: (data.page_url as string) ?? '',
    };
  }
}
