import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  SEValidationResult,
  SERate,
  SECarrier,
  ValidateOutput,
  RatesOutput,
  CarriersOutput,
} from './types';

/**
 * ShipEngine adapter (UC-246).
 *
 * Supported tools:
 *   shipengine.rates    → POST /rates/estimate
 *   shipengine.validate → POST /addresses/validate
 *   shipengine.carriers → GET /carriers
 *
 * Auth: API-Key header. Free plan $0/mo.
 * 200+ carriers (USPS, UPS, FedEx, DHL).
 */
export class ShipEngineAdapter extends BaseAdapter {
  private readonly apiKey: string;
  private carrierIds: string[] | null = null;

  constructor(apiKey: string) {
    super({
      provider: 'shipengine',
      baseUrl: 'https://api.shipengine.com/v1',
    });
    this.apiKey = apiKey;
  }

  private async fetchCarrierIds(): Promise<string[]> {
    if (this.carrierIds) return this.carrierIds;
    try {
      const res = await fetch(`${this.baseUrl}/carriers`, {
        headers: { 'API-Key': this.apiKey },
        signal: AbortSignal.timeout(5000),
      });
      const data = (await res.json()) as { carriers: SECarrier[] };
      this.carrierIds = (data.carriers ?? []).map((c) => c.carrier_id);
    } catch {
      this.carrierIds = [];
    }
    return this.carrierIds;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      'API-Key': this.apiKey,
      'Content-Type': 'application/json',
    };

    switch (req.toolId) {
      case 'shipengine.validate':
        return {
          url: `${this.baseUrl}/addresses/validate`,
          method: 'POST',
          headers,
          body: JSON.stringify([
            {
              address_line1: params.address_line1 ?? '',
              address_line2: params.address_line2 ?? '',
              city_locality: params.city ?? '',
              state_province: params.state ?? '',
              postal_code: params.postal_code ?? '',
              country_code: params.country ?? 'US',
            },
          ]),
        };

      case 'shipengine.rates':
        // carrier_ids injected in call() override
        return {
          url: `${this.baseUrl}/rates/estimate`,
          method: 'POST',
          headers,
          body: JSON.stringify({
            carrier_ids: [], // replaced in call()
            from_country_code: params.from_country ?? 'US',
            from_postal_code: String(params.from_zip ?? ''),
            to_country_code: params.to_country ?? 'US',
            to_postal_code: String(params.to_zip ?? ''),
            weight: {
              value: Number(params.weight_lb ?? 1),
              unit: 'pound',
            },
            dimensions: params.length
              ? {
                  length: Number(params.length),
                  width: Number(params.width ?? params.length),
                  height: Number(params.height ?? 6),
                  unit: 'inch',
                }
              : undefined,
          }),
        };

      case 'shipengine.carriers':
        return {
          url: `${this.baseUrl}/carriers`,
          method: 'GET',
          headers,
        };

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

  async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    // For rates: inject carrier_ids before calling super
    if (req.toolId === 'shipengine.rates') {
      const ids = await this.fetchCarrierIds();
      const built = this.buildRequest(req);
      if (built.body) {
        const bodyObj = JSON.parse(built.body);
        bodyObj.carrier_ids = ids;
        built.body = JSON.stringify(bodyObj);
      }
      const start = performance.now();
      const response = await fetch(built.url, {
        method: built.method,
        headers: built.headers,
        body: built.body,
        signal: AbortSignal.timeout(10_000),
      });
      const body = await response.json();
      const durationMs = Math.round(performance.now() - start);
      const raw: ProviderRawResponse = {
        status: response.status,
        headers: {},
        body,
        durationMs,
        byteLength: JSON.stringify(body).length,
      };
      return {
        ...raw,
        body: this.parseResponse(raw, req),
      };
    }
    return super.call(req);
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body;

    switch (req.toolId) {
      case 'shipengine.validate':
        return this.parseValidation(body as unknown as SEValidationResult[]);
      case 'shipengine.rates':
        return this.parseRates(body as unknown as SERate[]);
      case 'shipengine.carriers':
        return this.parseCarriers(
          (body as Record<string, unknown>)?.carriers as unknown as SECarrier[],
        );
      default:
        return body;
    }
  }

  private parseValidation(body: SEValidationResult[]): ValidateOutput {
    const r = Array.isArray(body) ? body[0] : body;
    if (!r)
      return {
        status: 'error',
        address: { line1: '', line2: '', city: '', state: '', postal_code: '', country: '' },
        messages: [],
      };
    const m = r.matched_address ?? r.original_address;
    return {
      status: r.status ?? 'unknown',
      address: {
        line1: m?.address_line1 ?? '',
        line2: m?.address_line2 ?? '',
        city: m?.city_locality ?? '',
        state: m?.state_province ?? '',
        postal_code: m?.postal_code ?? '',
        country: m?.country_code ?? '',
      },
      messages: (r.messages ?? []).map((msg) => ({ code: msg.code, message: msg.message })),
    };
  }

  private parseRates(body: SERate[]): RatesOutput {
    const rates = Array.isArray(body) ? body : [];
    // Deduplicate by carrier+service and sort by price
    const seen = new Set<string>();
    const unique = rates.filter((r) => {
      const key = `${r.carrier_friendly_name}:${r.service_type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    unique.sort((a, b) => (a.shipping_amount?.amount ?? 0) - (b.shipping_amount?.amount ?? 0));

    return {
      rates: unique.map((r) => ({
        carrier: r.carrier_friendly_name ?? '',
        service: r.service_type ?? '',
        price_usd: r.shipping_amount?.amount ?? 0,
        delivery_days: r.delivery_days,
        estimated_delivery: r.estimated_delivery_date,
      })),
      total: unique.length,
    };
  }

  private parseCarriers(body: SECarrier[]): CarriersOutput {
    const carriers = Array.isArray(body) ? body : [];
    return {
      carriers: carriers.map((c) => ({
        id: c.carrier_id,
        name: c.friendly_name ?? c.nickname ?? '',
        code: c.carrier_code ?? '',
      })),
      total: carriers.length,
    };
  }
}
