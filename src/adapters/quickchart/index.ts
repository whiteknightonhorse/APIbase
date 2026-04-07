import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { ChartCreateOutput } from './types';

const QC_BASE = 'https://quickchart.io';

/**
 * QuickChart adapter (UC-new).
 *
 * Chart.js → PNG image URL. No auth, free, MIT license.
 * Agent sends chart config, gets permanent image URL back.
 */
export class QuickchartAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'chart', baseUrl: QC_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;

    if (req.toolId !== 'chart.create') {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Unsupported tool: ${req.toolId}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    const datasets = (params.datasets as { label: string; data: number[] }[]).map((ds) => ({
      label: ds.label,
      data: ds.data,
    }));

    const chartConfig: Record<string, unknown> = {
      type: String(params.type),
      data: {
        labels: params.labels,
        datasets,
      },
    };

    if (params.title) {
      chartConfig.options = {
        plugins: {
          title: { display: true, text: String(params.title) },
        },
      };
    }

    return {
      url: `${QC_BASE}/chart/create`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        chart: chartConfig,
        width: Number(params.width) || 500,
        height: Number(params.height) || 300,
        format: 'png',
        backgroundColor: 'white',
      }),
    };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;
    const params = req.params as Record<string, unknown>;

    if (!body.success || !body.url) {
      return { url: '', width: 0, height: 0, chart_type: '' };
    }

    const output: ChartCreateOutput = {
      url: String(body.url),
      width: Number(params.width) || 500,
      height: Number(params.height) || 300,
      chart_type: String(params.type),
    };

    return output;
  }
}
