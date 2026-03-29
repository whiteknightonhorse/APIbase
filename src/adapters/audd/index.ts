import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  AuddApiResponse,
  AuddRecognizeResult,
  AuddLyricsResult,
  RecognizeOutput,
  LyricsOutput,
} from './types';

/**
 * AudD Music Recognition adapter (UC-226).
 *
 * Supported tools:
 *   audd.recognize → POST / (identify song from audio URL)
 *   audd.lyrics    → GET /findLyrics/ (search lyrics by query)
 *
 * Auth: api_token query param. Trial: 300 free requests.
 * 80M+ tracks. $0.005/call upstream.
 */
export class AuddAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'audd',
      baseUrl: 'https://api.audd.io',
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
      case 'audd.recognize': {
        const formFields = new URLSearchParams();
        formFields.set('api_token', this.apiKey);
        formFields.set('url', String(params.url));
        formFields.set('return', 'spotify,apple_music');
        return {
          url: `${this.baseUrl}/`,
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formFields.toString(),
        };
      }

      case 'audd.lyrics': {
        const qp = new URLSearchParams();
        qp.set('api_token', this.apiKey);
        qp.set('q', String(params.q));
        return {
          url: `${this.baseUrl}/findLyrics/?${qp.toString()}`,
          method: 'GET',
          headers: {},
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
    const body = raw.body as unknown as AuddApiResponse;

    if (body.status !== 'success') {
      return {
        error: true,
        status: body.status,
        message: typeof body.result === 'string' ? body.result : 'AudD API error',
      };
    }

    switch (req.toolId) {
      case 'audd.recognize':
        return this.parseRecognize(body.result as AuddRecognizeResult | null);
      case 'audd.lyrics':
        return this.parseLyrics(body.result as AuddLyricsResult[] | null);
      default:
        return body.result;
    }
  }

  private parseRecognize(result: AuddRecognizeResult | null): RecognizeOutput {
    if (!result) {
      return {
        artist: '',
        title: '',
        album: '',
        release_date: '',
        label: '',
        spotify_url: null,
        apple_music_url: null,
        song_link: null,
        matched: false,
      };
    }

    return {
      artist: result.artist ?? '',
      title: result.title ?? '',
      album: result.album ?? '',
      release_date: result.release_date ?? '',
      label: result.label ?? '',
      spotify_url: result.spotify?.external_urls?.spotify ?? null,
      apple_music_url: result.apple_music?.url ?? null,
      song_link: result.song_link ?? null,
      matched: true,
    };
  }

  private parseLyrics(result: AuddLyricsResult[] | null): LyricsOutput {
    const items = result ?? [];
    return {
      results: items.map((r) => ({
        artist: r.artist ?? '',
        title: r.title ?? '',
        lyrics: r.lyrics ?? '',
        full_title: r.full_title ?? '',
      })),
      count: items.length,
    };
  }
}
