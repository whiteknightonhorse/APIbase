import { BaseAdapter } from '../base.adapter';
import { type ProviderRequest, type ProviderRawResponse, ProviderErrorCode } from '../../types/provider';

/**
 * ExchangeRate-API adapter (UC-115).
 * Currency conversion. API key in URL. Free: 1,500/mo.
 */
export class ExchangeRateAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ provider: 'exchangerate', baseUrl: 'https://v6.exchangerate-api.com/v6' });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const h: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'exchangerate.latest':
        return { url: `${this.baseUrl}/${this.apiKey}/latest/${String(p.base ?? 'USD').toUpperCase()}`, method: 'GET', headers: h };
      case 'exchangerate.convert': {
        const from = String(p.from).toUpperCase();
        const to = String(p.to).toUpperCase();
        const amount = Number(p.amount ?? 1);
        return { url: `${this.baseUrl}/${this.apiKey}/pair/${from}/${to}/${amount}`, method: 'GET', headers: h };
      }
      default:
        throw { code: ProviderErrorCode.INVALID_RESPONSE, httpStatus: 502, message: `Unsupported: ${req.toolId}`, provider: this.provider, toolId: req.toolId, durationMs: 0 };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;
    if (req.toolId === 'exchangerate.convert') {
      return { from: body.base_code, to: body.target_code, rate: body.conversion_rate, amount: body.conversion_result, last_update: body.time_last_update_utc };
    }
    const rates = (body.conversion_rates ?? {}) as Record<string, number>;
    return { base: body.base_code, last_update: body.time_last_update_utc, rates };
  }
}
