import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  HfModelsOutput,
  HfModelDetailOutput,
  HfDatasetsOutput,
  HfModelResult,
  HfDatasetResult,
} from './types';

const HF_BASE = 'https://huggingface.co/api';

/**
 * HuggingFace Hub adapter (UC-367).
 *
 * Largest ML model + dataset registry. 1M+ models, 200K+ datasets.
 * No auth for read, unlimited.
 */
export class HfAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'hf', baseUrl: HF_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'hf.models': {
        const qp = new URLSearchParams();
        qp.set('search', String(params.search));
        if (params.task) qp.set('pipeline_tag', String(params.task));
        if (params.library) qp.set('library', String(params.library));
        qp.set('limit', String(Math.min(Number(params.limit) || 10, 20)));
        qp.set('sort', 'downloads');
        qp.set('direction', '-1');
        return {
          url: `${HF_BASE}/models?${qp.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'hf.model_details': {
        const modelId = String(params.model_id);
        return {
          url: `${HF_BASE}/models/${modelId}`,
          method: 'GET',
          headers,
        };
      }

      case 'hf.datasets': {
        const qp = new URLSearchParams();
        qp.set('search', String(params.search));
        qp.set('limit', String(Math.min(Number(params.limit) || 10, 20)));
        qp.set('sort', 'downloads');
        qp.set('direction', '-1');
        return {
          url: `${HF_BASE}/datasets?${qp.toString()}`,
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
      case 'hf.models':
        return this.parseModels(body);
      case 'hf.model_details':
        return this.parseModelDetail(body as Record<string, unknown>);
      case 'hf.datasets':
        return this.parseDatasets(body);
      default:
        return body;
    }
  }

  private parseModels(body: unknown): HfModelsOutput {
    const models = Array.isArray(body) ? body : [];
    return {
      total: models.length,
      results: models.map(
        (m): HfModelResult => ({
          model_id: String(m.modelId ?? m.id ?? ''),
          pipeline_tag: String(m.pipeline_tag ?? ''),
          downloads: Number(m.downloads ?? 0),
          likes: Number(m.likes ?? 0),
          tags: ((m.tags ?? []) as string[]).slice(0, 10),
          last_modified: String(m.lastModified ?? ''),
        }),
      ),
    };
  }

  private parseModelDetail(m: Record<string, unknown>): HfModelDetailOutput {
    return {
      model_id: String(m.modelId ?? m.id ?? ''),
      pipeline_tag: String(m.pipeline_tag ?? ''),
      library_name: String(m.library_name ?? ''),
      downloads: Number(m.downloads ?? 0),
      likes: Number(m.likes ?? 0),
      tags: ((m.tags ?? []) as string[]).slice(0, 15),
      author: String(m.author ?? ''),
      last_modified: String(m.lastModified ?? ''),
      card_data: (m.cardData ?? {}) as Record<string, unknown>,
    };
  }

  private parseDatasets(body: unknown): HfDatasetsOutput {
    const datasets = Array.isArray(body) ? body : [];
    return {
      total: datasets.length,
      results: datasets.map(
        (d): HfDatasetResult => ({
          id: String(d.id ?? ''),
          downloads: Number(d.downloads ?? 0),
          likes: Number(d.likes ?? 0),
          tags: ((d.tags ?? []) as string[]).slice(0, 10),
          last_modified: String(d.lastModified ?? ''),
        }),
      ),
    };
  }
}
