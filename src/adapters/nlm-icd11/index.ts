import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { Icd11ApiResponse, Icd11Result } from './types';

/**
 * NLM Clinical Tables ICD-11 adapter (UC-560).
 *
 * Supported tools:
 *   icd11.search         → search codes by clinical term
 *   icd11.lookup         → look up a specific ICD-11 code (sf=code)
 *   icd11.autocomplete   → quick typeahead suggestions (small maxList)
 *   icd11.primary_search → search stem (primary) codes only
 *
 * Auth: None — US NLM public domain, unlimited free.
 * Base: https://clinicaltables.nlm.nih.gov/api/icd11_codes/v3/search
 */
export class NlmIcd11Adapter extends BaseAdapter {
  private static readonly SEARCH_URL =
    'https://clinicaltables.nlm.nih.gov/api/icd11_codes/v3/search';

  constructor() {
    super({
      provider: 'nlm-icd11',
      baseUrl: 'https://clinicaltables.nlm.nih.gov',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'icd11.search': {
        const terms = encodeURIComponent(String(params.terms ?? ''));
        const maxList = Math.min(Math.max(Number(params.max_results) || 10, 1), 25);
        return {
          url: `${NlmIcd11Adapter.SEARCH_URL}?terms=${terms}&maxList=${maxList}`,
          method: 'GET',
          headers,
        };
      }
      case 'icd11.lookup': {
        const code = encodeURIComponent(String(params.code ?? '').toUpperCase());
        return {
          url: `${NlmIcd11Adapter.SEARCH_URL}?terms=${code}&sf=code&maxList=5`,
          method: 'GET',
          headers,
        };
      }
      case 'icd11.autocomplete': {
        const terms = encodeURIComponent(String(params.terms ?? ''));
        const maxList = Math.min(Math.max(Number(params.max_results) || 5, 1), 10);
        return {
          url: `${NlmIcd11Adapter.SEARCH_URL}?terms=${terms}&maxList=${maxList}`,
          method: 'GET',
          headers,
        };
      }
      case 'icd11.primary_search': {
        const terms = encodeURIComponent(String(params.terms ?? ''));
        // Fetch 50 to have enough stem results after filtering
        return {
          url: `${NlmIcd11Adapter.SEARCH_URL}?terms=${terms}&maxList=50`,
          method: 'GET',
          headers,
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
    const data = raw.body as unknown as Icd11ApiResponse;

    if (!Array.isArray(data) || data.length < 4) {
      throw new Error('Unexpected ICD-11 API response format');
    }

    const [totalMatches, , , displayData] = data;
    const params = req.params as Record<string, unknown>;

    const toResults = (rows: [string, string, string][]): Icd11Result[] =>
      rows.map(([code, title, type]) => ({ code, title, type }));

    switch (req.toolId) {
      case 'icd11.search': {
        const results = toResults(displayData ?? []);
        return { total_matches: totalMatches, result_count: results.length, results };
      }

      case 'icd11.lookup': {
        const rows = displayData ?? [];
        const codeParam = String(params.code ?? '').toUpperCase();
        // Find exact match first; fall back to first result
        const exact = rows.find(([c]) => c.toUpperCase() === codeParam);
        const row = exact ?? rows[0];
        if (!row) {
          return { found: false, code: codeParam, result: null };
        }
        const [code, title, type] = row;
        return { found: true, code, title, type };
      }

      case 'icd11.autocomplete': {
        const results = (displayData ?? []).map(([code, title]) => ({ code, title }));
        return { total_matches: totalMatches, suggestions: results };
      }

      case 'icd11.primary_search': {
        const maxResults = Math.min(Math.max(Number(params.max_results) || 10, 1), 25);
        const stems = toResults(displayData ?? []).filter((r) => r.type === 'stem');
        const limited = stems.slice(0, maxResults);
        return {
          total_matches: totalMatches,
          primary_count: limited.length,
          results: limited,
        };
      }

      default:
        return { total_matches: totalMatches, results: toResults(displayData ?? []) };
    }
  }
}
