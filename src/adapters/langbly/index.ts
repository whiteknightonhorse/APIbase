import { BaseAdapter } from '../base.adapter';
import { type ProviderRequest, type ProviderRawResponse, ProviderErrorCode } from '../../types/provider';

/**
 * Langbly Translation adapter (UC-087).
 * Google Translate v2 compatible API.
 * Auth: API key via query param or Bearer header.
 * Free: 500K chars/month. Paid: $5/1M chars.
 */
export class LangblyAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ provider: 'langbly', baseUrl: 'https://api.langbly.com' });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };

    switch (req.toolId) {
      case 'langbly.translate': {
        const body: Record<string, unknown> = {
          q: Array.isArray(p.text) ? p.text : [String(p.text)],
          target: p.target,
        };
        if (p.source) body.source = p.source;
        if (p.format) body.format = p.format;
        return { url: `${this.baseUrl}/language/translate/v2`, method: 'POST', headers: h, body: JSON.stringify(body) };
      }
      case 'langbly.detect': {
        const body = { q: Array.isArray(p.text) ? p.text : [String(p.text)] };
        return { url: `${this.baseUrl}/language/translate/v2/detect`, method: 'POST', headers: h, body: JSON.stringify(body) };
      }
      case 'langbly.languages': {
        const qs = p.display_language ? `?target=${String(p.display_language)}` : '';
        return { url: `${this.baseUrl}/language/translate/v2/languages${qs}`, method: 'GET', headers: { Authorization: `Bearer ${this.apiKey}` } };
      }
      default:
        throw { code: ProviderErrorCode.INVALID_RESPONSE, httpStatus: 502, message: `Unsupported: ${req.toolId}`, provider: this.provider, toolId: req.toolId, durationMs: 0 };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;
    const data = (body.data ?? body) as Record<string, unknown>;

    if (req.toolId === 'langbly.translate') {
      const translations = (data.translations ?? []) as Array<Record<string, unknown>>;
      return {
        translations: translations.map((t) => ({
          text: t.translatedText,
          detected_language: t.detectedSourceLanguage ?? null,
        })),
      };
    }

    if (req.toolId === 'langbly.detect') {
      const detections = (data.detections ?? []) as Array<Array<Record<string, unknown>>>;
      return {
        detections: detections.map((d) => d.map((item) => ({
          language: item.language,
          confidence: item.confidence,
        }))),
      };
    }

    // languages
    const languages = (data.languages ?? []) as Array<Record<string, unknown>>;
    return {
      languages: languages.map((l) => ({
        code: l.language,
        name: l.name ?? null,
      })),
    };
  }
}
