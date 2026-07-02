import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  PostcodeJapanEntry,
  PrefectureEntry,
  LookupOutput,
  SearchOutput,
  PrefecturesOutput,
} from './types';

/**
 * postcode.teraren.com adapter (UC-591).
 *
 * Supported tools:
 *   postcode-japan.lookup      → GET /postcodes/{postcode}.json
 *   postcode-japan.search      → GET /postcodes.json?s=&prefecture=&city=&limit=
 *   postcode-japan.prefectures → GET /prefectures.json
 *
 * Auth: None. Open data, MIT-licensed. Japan only.
 */
export class PostcodeJapanAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'postcode-japan',
      baseUrl: 'https://postcode.teraren.com',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'postcode-japan.lookup': {
        const raw = String(params.postcode ?? '').replace(/[-\s]/g, '');
        return {
          url: `${this.baseUrl}/postcodes/${encodeURIComponent(raw)}.json`,
          method: 'GET',
          headers: {},
        };
      }

      case 'postcode-japan.search': {
        const qs = new URLSearchParams();
        if (params.query) qs.set('s', String(params.query));
        if (params.prefecture) qs.set('prefecture', String(params.prefecture));
        if (params.city) qs.set('city', encodeURIComponent(String(params.city)));
        const limit = Math.min(Number(params.limit) || 20, 100);
        qs.set('limit', String(limit));
        return {
          url: `${this.baseUrl}/postcodes.json?${qs.toString()}`,
          method: 'GET',
          headers: {},
        };
      }

      case 'postcode-japan.prefectures': {
        return {
          url: `${this.baseUrl}/prefectures.json`,
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
    const body = raw.body;

    switch (req.toolId) {
      case 'postcode-japan.lookup':
        return this.parseLookup(body as PostcodeJapanEntry);

      case 'postcode-japan.search':
        return this.parseSearch(body as PostcodeJapanEntry[]);

      case 'postcode-japan.prefectures':
        return this.parsePrefectures(body as PrefectureEntry[]);

      default:
        return body;
    }
  }

  private parseLookup(r: PostcodeJapanEntry): LookupOutput {
    const lat = r.location?.latitude ? parseFloat(r.location.latitude) : null;
    const lon = r.location?.longitude ? parseFloat(r.location.longitude) : null;
    return {
      postcode: r.new ?? '',
      prefecture: r.prefecture ?? '',
      prefecture_kana: r.prefecture_kana ?? '',
      prefecture_roman: r.prefecture_roman ?? '',
      city: r.city ?? '',
      city_kana: r.city_kana ?? '',
      city_roman: r.city_roman ?? '',
      suburb: r.suburb ?? '',
      suburb_kana: r.suburb_kana ?? '',
      suburb_roman: r.suburb_roman ?? '',
      street_address: r.street_address ?? null,
      jis_code: r.jis ?? '',
      lat: lat !== null && !isNaN(lat) ? lat : null,
      lon: lon !== null && !isNaN(lon) ? lon : null,
      is_chome: r.is_chome === 1,
    };
  }

  private parseSearch(items: PostcodeJapanEntry[]): SearchOutput {
    const rows = Array.isArray(items) ? items : [];
    return {
      results: rows.map((r) => {
        const lat = r.location?.latitude ? parseFloat(r.location.latitude) : null;
        const lon = r.location?.longitude ? parseFloat(r.location.longitude) : null;
        return {
          postcode: r.new ?? '',
          prefecture: r.prefecture ?? '',
          prefecture_roman: r.prefecture_roman ?? '',
          city: r.city ?? '',
          city_roman: r.city_roman ?? '',
          suburb: r.suburb ?? '',
          suburb_roman: r.suburb_roman ?? '',
          lat: lat !== null && !isNaN(lat) ? lat : null,
          lon: lon !== null && !isNaN(lon) ? lon : null,
        };
      }),
      total: rows.length,
    };
  }

  private parsePrefectures(items: PrefectureEntry[]): PrefecturesOutput {
    const rows = Array.isArray(items) ? items : [];
    return {
      prefectures: rows.map((p) => ({
        code: p.code,
        name: p.name ?? '',
        name_english: p.name_e ?? '',
        name_hiragana: p.name_h ?? '',
        name_katakana: p.name_k ?? '',
        region: p.area ?? '',
      })),
      total: rows.length,
    };
  }
}
