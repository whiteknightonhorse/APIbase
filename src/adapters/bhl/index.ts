import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  BhlRawPublication,
  BhlRawResponse,
  BhlPublication,
  BhlLiteratureSearchOutput,
  BhlNameSearchOutput,
  BhlSubjectSearchOutput,
} from './types';

const BHL_BASE = 'https://www.biodiversitylibrary.org/api3';

export class BhlAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ provider: 'bhl', baseUrl: BHL_BASE });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'bhl.literature.search': {
        const qp = new URLSearchParams();
        qp.set('op', 'PublicationSearch');
        qp.set('searchterm', encodeURIComponent(String(params.query)));
        qp.set('searchtype', 'C');
        qp.set('page', String(Math.max(1, Number(params.page) || 1)));
        qp.set('pagesize', String(Math.min(Number(params.limit) || 10, 50)));
        qp.set('format', 'json');
        qp.set('apikey', this.apiKey);
        return { url: `${BHL_BASE}?${qp.toString()}`, method: 'GET', headers };
      }

      case 'bhl.literature.fulltext': {
        const qp = new URLSearchParams();
        qp.set('op', 'PublicationSearch');
        qp.set('searchterm', encodeURIComponent(String(params.query)));
        qp.set('searchtype', 'F');
        qp.set('page', String(Math.max(1, Number(params.page) || 1)));
        qp.set('pagesize', String(Math.min(Number(params.limit) || 10, 50)));
        qp.set('format', 'json');
        qp.set('apikey', this.apiKey);
        return { url: `${BHL_BASE}?${qp.toString()}`, method: 'GET', headers };
      }

      case 'bhl.taxonomy.name_search': {
        const qp = new URLSearchParams();
        qp.set('op', 'NameSearch');
        qp.set('name', encodeURIComponent(String(params.name)));
        qp.set('format', 'json');
        qp.set('apikey', this.apiKey);
        return { url: `${BHL_BASE}?${qp.toString()}`, method: 'GET', headers };
      }

      case 'bhl.literature.by_subject': {
        const qp = new URLSearchParams();
        qp.set('op', 'SubjectSearch');
        qp.set('subject', encodeURIComponent(String(params.subject)));
        qp.set('format', 'json');
        qp.set('apikey', this.apiKey);
        return { url: `${BHL_BASE}?${qp.toString()}`, method: 'GET', headers };
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
    const body = raw.body as BhlRawResponse;

    if (body.Status && body.Status !== 'ok') {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: body.ErrorMessage ?? `BHL API error: ${body.Status}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }

    const results = (body.Result ?? []) as Record<string, unknown>[];

    switch (req.toolId) {
      case 'bhl.literature.search':
      case 'bhl.literature.fulltext': {
        const params = req.params as Record<string, unknown>;
        return this.parseLiteratureSearch(results, Number(params.page) || 1);
      }
      case 'bhl.taxonomy.name_search':
        return this.parseNameSearch(results);
      case 'bhl.literature.by_subject':
        return this.parseSubjectSearch(results);
      default:
        return body;
    }
  }

  private parseLiteratureSearch(
    results: Record<string, unknown>[],
    page: number,
  ): BhlLiteratureSearchOutput {
    return {
      total: results.length,
      page,
      results: results.map((r) => this.toPublication(r as BhlRawPublication)),
    };
  }

  private parseNameSearch(results: Record<string, unknown>[]): BhlNameSearchOutput {
    return {
      total: results.length,
      results: results.map((r) => ({
        name_confirmed: String(r['NameConfirmed'] ?? ''),
      })),
    };
  }

  private parseSubjectSearch(results: Record<string, unknown>[]): BhlSubjectSearchOutput {
    return {
      total: results.length,
      results: results.map((r) => ({
        subject: String(r['SubjectText'] ?? ''),
      })),
    };
  }

  private toPublication(r: BhlRawPublication): BhlPublication {
    const authors = (r.Authors ?? []).map((a) => (a.Name ?? '').replace(/,$/, '').trim());
    return {
      item_id: r.ItemID ?? '',
      title_id: r.TitleID ?? '',
      title: r.Title ?? '',
      authors,
      publisher_name: r.PublisherName ?? '',
      publisher_place: r.PublisherPlace ?? '',
      publication_date: r.PublicationDate ?? '',
      material_type: r.MaterialType ?? '',
      genre: r.Genre ?? '',
      found_in: r.FoundIn ?? '',
      item_url: r.ItemUrl ?? '',
      title_url: r.TitleUrl ?? '',
    };
  }
}
