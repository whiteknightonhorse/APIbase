import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { AphiaRecord, AphiaClassificationNode, AphiaVernacular } from './types';

/**
 * World Register of Marine Species (WoRMS) adapter (UC-502).
 *
 * Supported tools:
 *   worms.species.search         → GET /AphiaRecordsByName/{name}
 *   worms.species.details        → GET /AphiaRecordByAphiaID/{id}
 *   worms.species.classification → GET /AphiaClassificationByAphiaID/{id}
 *   worms.species.vernaculars    → GET /AphiaVernacularsByAphiaID/{id}
 *
 * Auth: none (CC BY 4.0, open access, 240K+ accepted marine species).
 */
export class WormsAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'worms',
      baseUrl: 'https://www.marinespecies.org/rest',
    });
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
      case 'worms.species.search':
        return this.buildSearchRequest(params, headers);
      case 'worms.species.details':
        return this.buildDetailsRequest(params, headers);
      case 'worms.species.classification':
        return this.buildClassificationRequest(params, headers);
      case 'worms.species.vernaculars':
        return this.buildVernacularsRequest(params, headers);
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
      case 'worms.species.search': {
        const data = body as AphiaRecord[];
        if (!Array.isArray(data)) {
          throw new Error('Expected array in AphiaRecordsByName response');
        }
        return { records: data, count: data.length };
      }
      case 'worms.species.details': {
        const data = body as AphiaRecord;
        if (!data.AphiaID) {
          throw new Error('Missing AphiaID in AphiaRecordByAphiaID response');
        }
        return data;
      }
      case 'worms.species.classification': {
        const data = body as AphiaClassificationNode;
        if (!data.AphiaID) {
          throw new Error('Missing AphiaID in AphiaClassificationByAphiaID response');
        }
        return data;
      }
      case 'worms.species.vernaculars': {
        const data = body as AphiaVernacular[];
        if (!Array.isArray(data)) {
          throw new Error('Expected array in AphiaVernacularsByAphiaID response');
        }
        return { vernaculars: data, count: data.length };
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildSearchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const name = encodeURIComponent(String(params.name ?? ''));
    const like = params.like !== false ? 'true' : 'false';
    const marineOnly = params.marine_only !== false ? 'true' : 'false';
    const offset = params.offset ? `&offset=${params.offset}` : '';
    return {
      url: `${this.baseUrl}/AphiaRecordsByName/${name}?like=${like}&marine_only=${marineOnly}${offset}`,
      method: 'GET',
      headers,
    };
  }

  private buildDetailsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const id = encodeURIComponent(String(params.aphia_id ?? ''));
    return {
      url: `${this.baseUrl}/AphiaRecordByAphiaID/${id}`,
      method: 'GET',
      headers,
    };
  }

  private buildClassificationRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const id = encodeURIComponent(String(params.aphia_id ?? ''));
    return {
      url: `${this.baseUrl}/AphiaClassificationByAphiaID/${id}`,
      method: 'GET',
      headers,
    };
  }

  private buildVernacularsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const id = encodeURIComponent(String(params.aphia_id ?? ''));
    return {
      url: `${this.baseUrl}/AphiaVernacularsByAphiaID/${id}`,
      method: 'GET',
      headers,
    };
  }
}
