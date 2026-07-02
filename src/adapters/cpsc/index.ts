import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { CpscRecall, CpscRecallList } from './types';

/**
 * US Consumer Product Safety Commission (CPSC) SaferProducts.gov adapter (UC-562).
 *
 * Supported tools (read-only, no auth):
 *   cpsc.search          → GET /RestWebServices/Recall?format=json — multi-filter recall search
 *   cpsc.detail          → GET /RestWebServices/Recall?format=json&RecallID=N — single recall
 *   cpsc.recent          → GET /RestWebServices/Recall?format=json&RecallDateStart=N days ago
 *   cpsc.by_manufacturer → GET /RestWebServices/Recall?format=json&Manufacturer=name
 *
 * Auth: None (US Gov public domain — 15 USC §2051 et seq.).
 * Note: API returns all matching records; adapter slices to requested limit client-side.
 */
export class CpscAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'cpsc',
      baseUrl: 'https://www.saferproducts.gov',
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
      'User-Agent': 'APIbase/1.0 (https://apibase.pro)',
    };

    switch (req.toolId) {
      case 'cpsc.search':
        return this.buildSearchRequest(params, headers);
      case 'cpsc.detail':
        return this.buildDetailRequest(params, headers);
      case 'cpsc.recent':
        return this.buildRecentRequest(params, headers);
      case 'cpsc.by_manufacturer':
        return this.buildByManufacturerRequest(params, headers);
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
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'cpsc.search':
      case 'cpsc.recent':
      case 'cpsc.by_manufacturer': {
        const list = body as unknown as CpscRecallList;
        const limit = typeof params.limit === 'number' ? Math.min(params.limit, 100) : 20;
        const sliced = list.slice(0, limit);
        return {
          total_matching: list.length,
          returned: sliced.length,
          recalls: sliced.map((r) => this.summarizeRecall(r)),
        };
      }
      case 'cpsc.detail': {
        const list = body as unknown as CpscRecallList;
        if (!list || list.length === 0) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: 'No recall found for the given ID or recall number',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        return this.fullRecallDetail(list[0]);
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
    const qs = new URLSearchParams({ format: 'json' });
    if (params.product_name) qs.set('ProductName', String(params.product_name));
    if (params.product_type) qs.set('ProductType', String(params.product_type));
    if (params.manufacturer) qs.set('Manufacturer', String(params.manufacturer));
    if (params.date_start) qs.set('RecallDateStart', String(params.date_start));
    if (params.date_end) qs.set('RecallDateEnd', String(params.date_end));
    if (params.hazard) qs.set('Hazard', String(params.hazard));
    if (params.country) qs.set('ManufacturerCountry', String(params.country));
    return { url: `${this.baseUrl}/RestWebServices/Recall?${qs}`, method: 'GET', headers };
  }

  private buildDetailRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams({ format: 'json' });
    if (params.recall_id !== undefined) {
      qs.set('RecallID', String(params.recall_id));
    } else if (params.recall_number) {
      qs.set('RecallNumber', String(params.recall_number));
    } else {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: 'Either recall_id or recall_number is required',
        provider: this.provider,
        toolId: 'cpsc.detail',
        durationMs: 0,
      };
    }
    return { url: `${this.baseUrl}/RestWebServices/Recall?${qs}`, method: 'GET', headers };
  }

  private buildRecentRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const days = typeof params.days === 'number' ? Math.min(params.days, 365) : 30;
    const start = new Date();
    start.setDate(start.getDate() - days);
    const dateStr = start.toISOString().slice(0, 10);
    const qs = new URLSearchParams({ format: 'json', RecallDateStart: dateStr });
    if (params.product_type) qs.set('ProductType', String(params.product_type));
    return { url: `${this.baseUrl}/RestWebServices/Recall?${qs}`, method: 'GET', headers };
  }

  private buildByManufacturerRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    if (!params.manufacturer) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: 'manufacturer is required',
        provider: this.provider,
        toolId: 'cpsc.by_manufacturer',
        durationMs: 0,
      };
    }
    const qs = new URLSearchParams({
      format: 'json',
      Manufacturer: String(params.manufacturer),
    });
    if (params.date_start) qs.set('RecallDateStart', String(params.date_start));
    if (params.date_end) qs.set('RecallDateEnd', String(params.date_end));
    return { url: `${this.baseUrl}/RestWebServices/Recall?${qs}`, method: 'GET', headers };
  }

  // ---------------------------------------------------------------------------
  // Response formatters
  // ---------------------------------------------------------------------------

  private summarizeRecall(r: CpscRecall): Record<string, unknown> {
    return {
      recall_id: r.RecallID,
      recall_number: r.RecallNumber,
      recall_date: r.RecallDate ? r.RecallDate.slice(0, 10) : null,
      last_updated: r.LastPublishDate ? r.LastPublishDate.slice(0, 10) : null,
      title: r.Title,
      description: r.Description,
      url: r.URL,
      products: (r.Products ?? []).map((p) => ({
        name: p.Name,
        model: p.Model || undefined,
        units: p.NumberOfUnits || undefined,
        type: p.Type || undefined,
      })),
      hazards: (r.Hazards ?? []).map((h) => h.Name),
      remedy_options: (r.RemedyOptions ?? []).map((ro) => ro.Option),
      manufacturers: (r.Manufacturers ?? []).map((m) => m.Name),
      manufacturer_countries: (r.ManufacturerCountries ?? []).map((c) => c.Country),
    };
  }

  private fullRecallDetail(r: CpscRecall): Record<string, unknown> {
    return {
      recall_id: r.RecallID,
      recall_number: r.RecallNumber,
      recall_date: r.RecallDate ? r.RecallDate.slice(0, 10) : null,
      last_updated: r.LastPublishDate ? r.LastPublishDate.slice(0, 10) : null,
      title: r.Title,
      description: r.Description,
      url: r.URL,
      consumer_contact: r.ConsumerContact,
      products: r.Products ?? [],
      hazards: r.Hazards ?? [],
      injuries: (r.Injuries ?? []).map((i) => i.Name),
      remedies: (r.Remedies ?? []).map((rem) => rem.Name),
      remedy_options: (r.RemedyOptions ?? []).map((ro) => ro.Option),
      manufacturers: r.Manufacturers ?? [],
      importers: r.Importers ?? [],
      retailers: r.Retailers ?? [],
      distributors: r.Distributors ?? [],
      manufacturer_countries: (r.ManufacturerCountries ?? []).map((c) => c.Country),
      upcs: (r.ProductUPCs ?? []).map((u) => u.UPC),
      images: r.Images ?? [],
      in_conjunctions: (r.Inconjunctions ?? []).map((i) => i.Name),
    };
  }
}
