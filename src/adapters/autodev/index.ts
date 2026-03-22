import { BaseAdapter } from '../base.adapter';
import type { ProviderRequest, ProviderRawResponse } from '../../types/provider';

export class AutoDevAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ timeout: 10_000, maxRetries: 2, maxResponseSize: 512_000 });
    this.apiKey = apiKey;
  }

  buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;

    switch (req.toolId) {
      case 'autodev.vin_decode': {
        const vin = String(params.vin ?? '');
        return {
          url: `https://api.auto.dev/vin/${encodeURIComponent(vin)}?apiKey=${this.apiKey}`,
          method: 'GET',
          headers: {},
        };
      }

      default:
        throw new Error(`Unknown tool: ${req.toolId}`);
    }
  }

  parseResponse(raw: ProviderRawResponse, _req: ProviderRequest): ProviderRawResponse {
    const body =
      typeof raw.body === 'string' ? JSON.parse(raw.body) : raw.body;

    if (!body?.vin || body?.vinValid === false) {
      return {
        ...raw,
        status: raw.status >= 200 && raw.status < 300 ? 502 : raw.status,
        body: { error: body?.message ?? 'Auto.dev VIN decode failed', vin_valid: false },
      };
    }

    const v = body.vehicle ?? {};

    return {
      ...raw,
      body: {
        vin: body.vin,
        vin_valid: body.vinValid,
        origin: body.origin,
        type: body.type,
        make: body.make,
        model: body.model,
        year: v.year,
        trim: body.trim,
        body_style: body.body,
        engine: body.engine,
        drive: body.drive,
        transmission: body.transmission,
        manufacturer: v.manufacturer,
        style: body.style,
      },
    };
  }
}
