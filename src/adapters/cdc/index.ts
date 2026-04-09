import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { CdcDatasetsOutput, CdcDatasetResult, CdcQueryOutput } from './types';

const CDC_DOMAIN = 'data.cdc.gov';
const SOCRATA_DISCOVERY = 'https://api.us.socrata.com/api/catalog/v1';

/**
 * CDC Open Data adapter (UC-371).
 *
 * 1,487 public health datasets via Socrata SODA API — COVID, chronic disease,
 * vaccination, mortality. US Gov public domain, no auth.
 */
export class CdcAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'cdc', baseUrl: `https://${CDC_DOMAIN}` });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'cdc.datasets': {
        const qp = new URLSearchParams();
        qp.set('domains', CDC_DOMAIN);
        qp.set('search_context', CDC_DOMAIN);
        qp.set('limit', String(Math.min(Number(params.limit) || 20, 50)));
        if (params.query) qp.set('q', String(params.query));
        if (params.category) qp.set('categories', String(params.category));
        qp.set('only', 'datasets');
        return { url: `${SOCRATA_DISCOVERY}?${qp.toString()}`, method: 'GET', headers };
      }

      case 'cdc.query': {
        const datasetId = String(params.dataset_id);
        if (!/^[a-z0-9]{4}-[a-z0-9]{4}$/.test(datasetId)) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 400,
            message: `Invalid dataset ID format: "${datasetId}". Expected xxxx-xxxx (e.g. "9bhg-hcku")`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        const qp = new URLSearchParams();
        qp.set('$limit', String(Math.min(Number(params.limit) || 100, 1000)));
        if (params.where) qp.set('$where', String(params.where));
        if (params.select) qp.set('$select', String(params.select));
        if (params.order) qp.set('$order', String(params.order));
        if (params.group) qp.set('$group', String(params.group));
        return {
          url: `https://${CDC_DOMAIN}/resource/${datasetId}.json?${qp.toString()}`,
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
    const body = raw.body;

    switch (req.toolId) {
      case 'cdc.datasets':
        return this.parseDatasets(body as Record<string, unknown>);
      case 'cdc.query':
        return this.parseQuery(body, req.params as Record<string, unknown>);
      default:
        return body;
    }
  }

  private parseDatasets(body: Record<string, unknown>): CdcDatasetsOutput {
    const results = (body.results ?? []) as Array<Record<string, unknown>>;
    const total = Number(body.resultSetSize ?? 0);

    return {
      total,
      results: results.map((r): CdcDatasetResult => {
        const res = (r.resource ?? {}) as Record<string, unknown>;
        const classification = (r.classification ?? {}) as Record<string, unknown>;
        const categories = (classification.categories ?? []) as string[];
        return {
          id: String(res.id ?? ''),
          name: String(res.name ?? ''),
          description: String(res.description ?? '').slice(0, 300),
          category: categories[0] ?? '',
          updated_at: String(res.updatedAt ?? ''),
          page_views: Number((res.page_views as Record<string, unknown>)?.page_views_total ?? 0),
        };
      }),
    };
  }

  private parseQuery(body: unknown, params: Record<string, unknown>): CdcQueryOutput {
    if (!Array.isArray(body)) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `CDC returned non-array: ${JSON.stringify(body).slice(0, 200)}`,
        provider: this.provider,
        durationMs: 0,
      };
    }

    const data = body as Record<string, unknown>[];
    const columns = data.length > 0 ? Object.keys(data[0]) : [];

    return {
      dataset_id: String(params.dataset_id ?? ''),
      rows: data.length,
      columns,
      data: data.slice(0, 100),
    };
  }
}
