import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

/**
 * BrasilAPI adapter (UC-403). MIT license, no auth, Vercel CDN.
 * Brazilian gov data: CNPJ, CEP, banks, rates, PIX, IBGE municipalities, DDD, holidays.
 */
export class BrasilApiAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'brasilapi', baseUrl: 'https://brasilapi.com.br' });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'brasilapi.cnpj': {
        const cnpj = String(p.cnpj).replace(/\D/g, '');
        return {
          url: `${this.baseUrl}/api/cnpj/v1/${encodeURIComponent(cnpj)}`,
          method: 'GET',
          headers,
        };
      }
      case 'brasilapi.cep': {
        const cep = String(p.cep).replace(/\D/g, '');
        return {
          url: `${this.baseUrl}/api/cep/v2/${encodeURIComponent(cep)}`,
          method: 'GET',
          headers,
        };
      }
      case 'brasilapi.banks':
        return { url: `${this.baseUrl}/api/banks/v1`, method: 'GET', headers };
      case 'brasilapi.rates':
        return { url: `${this.baseUrl}/api/taxas/v1`, method: 'GET', headers };
      case 'brasilapi.holidays': {
        const year = encodeURIComponent(String(p.year));
        return { url: `${this.baseUrl}/api/feriados/v1/${year}`, method: 'GET', headers };
      }
      case 'brasilapi.ddd': {
        const ddd = encodeURIComponent(String(p.ddd));
        return { url: `${this.baseUrl}/api/ddd/v1/${ddd}`, method: 'GET', headers };
      }
      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, _req: ProviderRequest): unknown {
    return raw.body;
  }
}
