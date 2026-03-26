import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

/**
 * IBANAPI adapter (UC-212).
 *
 * Supported tools:
 *   iban.validate  → GET /v1/validate/{iban}
 *   iban.calculate → GET /v1/calculate
 *
 * Auth: query param api_key. 100 basic + 20 bank credits/30 days free.
 */
export class IbanApiAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'ibanapi',
      baseUrl: 'https://api.ibanapi.com/v1',
    });
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
      case 'iban.validate': {
        const iban = String(params.iban).replace(/\s/g, '').toUpperCase();
        return { url: `${this.baseUrl}/validate/${iban}?api_key=${this.apiKey}`, method: 'GET', headers };
      }

      case 'iban.calculate': {
        const qs = new URLSearchParams();
        qs.set('api_key', this.apiKey);
        qs.set('country_code', String(params.country_code));
        qs.set('bank_code', String(params.bank_code));
        qs.set('account_number', String(params.account_number));
        if (params.branch_code) qs.set('branch_code', String(params.branch_code));
        return { url: `${this.baseUrl}/calculate?${qs.toString()}`, method: 'GET', headers };
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
    const body = raw.body as Record<string, unknown>;
    const data = body.data as Record<string, unknown> | undefined;

    switch (req.toolId) {
      case 'iban.validate': {
        const bank = data?.bank_data as Record<string, unknown> | undefined;
        const sepa = data?.sepa as Record<string, string> | undefined;
        return {
          valid: body.result === 200,
          message: body.message,
          country_code: data?.country_code,
          country_name: data?.country_name,
          currency: data?.currency_code,
          sepa_member: data?.sepa_member === 'Yes',
          sepa_credit_transfer: sepa?.sepa_credit_transfer === 'Yes',
          sepa_direct_debit: sepa?.sepa_direct_debit === 'Yes',
          bank: bank ? {
            name: bank.bank_name,
            bic: bank.bic,
            branch: bank.branch,
            address: bank.address,
            city: bank.city,
            zip: bank.zip,
          } : null,
        };
      }

      case 'iban.calculate':
        return {
          success: body.result === 200,
          message: body.message,
          iban: data?.iban,
          country_code: data?.country_code,
          country_name: data?.country_name,
        };

      default:
        return body;
    }
  }
}
