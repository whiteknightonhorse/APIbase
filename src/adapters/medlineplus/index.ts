import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import { stripHtml } from '../../utils/strip-html';
import type { MedlinePlusResponse, MedlinePlusEntry } from './types';

const CODE_SYSTEM_MAP: Record<string, string> = {
  icd10: '2.16.840.1.113883.6.90',
  icd9: '2.16.840.1.113883.6.103',
  snomed: '2.16.840.1.113883.6.96',
  rxnorm: '2.16.840.1.113883.6.88',
};

/**
 * MedlinePlus Connect adapter (UC-580).
 *
 * Supported tools (read-only, no auth):
 *   medlineplus.icd10_lookup  → ICD-10-CM clinical code → patient health info
 *   medlineplus.icd9_lookup   → ICD-9-CM clinical code → patient health info
 *   medlineplus.snomed_lookup → SNOMED CT concept → patient health info
 *   medlineplus.rxnorm_lookup → RxNorm concept (RXCUI) → drug information
 *
 * Auth: None (US NLM, public domain, free unlimited).
 * Docs: https://connect.medlineplus.gov/
 */
export class MedlineplusAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'medlineplus',
      baseUrl: 'https://connect.medlineplus.gov',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'medlineplus.icd10_lookup':
        return this.buildCodeRequest(params, CODE_SYSTEM_MAP.icd10);
      case 'medlineplus.icd9_lookup':
        return this.buildCodeRequest(params, CODE_SYSTEM_MAP.icd9);
      case 'medlineplus.snomed_lookup':
        return this.buildCodeRequest(params, CODE_SYSTEM_MAP.snomed);
      case 'medlineplus.rxnorm_lookup':
        return this.buildCodeRequest(params, CODE_SYSTEM_MAP.rxnorm);
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

  protected parseResponse(raw: ProviderRawResponse, _req: ProviderRequest): unknown {
    const body = raw.body as MedlinePlusResponse;
    const feed = body.feed;

    const entries: MedlinePlusEntry[] = feed.entry ?? [];
    const code = feed.category?.find((c) => c.scheme === 'mainSearchCriteria.v.c')?.term ?? '';
    const codeSystem =
      feed.category?.find((c) => c.scheme === 'mainSearchCriteria.v.cs')?.term ?? '';
    const displayName =
      feed.category?.find((c) => c.scheme === 'mainSearchCriteria.v.dn')?.term ?? '';

    return {
      code,
      code_system: codeSystem,
      display_name: displayName || undefined,
      language: feed.lang,
      subtitle: feed.subtitle?._value,
      updated: feed.updated?._value,
      result_count: entries.length,
      results: entries.map((e) => ({
        title: e.title._value,
        url: e.link[0]?.href,
        summary: e.summary?._value ? stripHtml(e.summary._value).slice(0, 800) : undefined,
      })),
    };
  }

  private buildCodeRequest(
    params: Record<string, unknown>,
    codeSystem: string,
  ): { url: string; method: string; headers: Record<string, string> } {
    const code = encodeURIComponent(String(params.code ?? params.rxcui ?? ''));
    const lang = String(params.language ?? 'en').slice(0, 2);
    const displayName = params.display_name ? encodeURIComponent(String(params.display_name)) : '';

    const qs = new URLSearchParams();
    qs.set('mainSearchCriteria.v.c', code);
    qs.set('mainSearchCriteria.v.cs', codeSystem);
    if (displayName) qs.set('mainSearchCriteria.v.dn', displayName);
    if (lang !== 'en') qs.set('informationRecipient.languageCode.c', lang);
    qs.set('knowledgeResponseType', 'application/json');

    return {
      url: `${this.baseUrl}/service?${qs.toString()}`,
      method: 'GET',
      headers: { Accept: 'application/json' },
    };
  }
}
