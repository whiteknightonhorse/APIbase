import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

/**
 * IBGE adapter (UC-404) — Brazilian Institute of Geography and Statistics.
 * Brazilian gov open data, CC BY 4.0. No auth.
 */
export class IbgeAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'ibge', baseUrl: 'https://servicodados.ibge.gov.br' });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'ibge.states':
        return { url: `${this.baseUrl}/api/v1/localidades/estados`, method: 'GET', headers };
      case 'ibge.municipalities': {
        const uf = p.uf ? `/${encodeURIComponent(String(p.uf))}` : '';
        return {
          url: `${this.baseUrl}/api/v1/localidades/estados${uf}/municipios`,
          method: 'GET',
          headers,
        };
      }
      case 'ibge.name_frequency': {
        const name = encodeURIComponent(String(p.name));
        return { url: `${this.baseUrl}/api/v2/censos/nomes/${name}`, method: 'GET', headers };
      }
      case 'ibge.cnae':
        return { url: `${this.baseUrl}/api/v2/cnae/classes`, method: 'GET', headers };
      case 'ibge.regions':
        return { url: `${this.baseUrl}/api/v1/localidades/regioes`, method: 'GET', headers };
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

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body;
    const params = req.params as Record<string, unknown>;

    if (req.toolId === 'ibge.municipalities') {
      const list = (body as Array<Record<string, unknown>>) ?? [];
      const limit = Math.max(1, Math.min(2000, Number(params.limit ?? 200)));
      return {
        total: list.length,
        returned: Math.min(limit, list.length),
        municipalities: list.slice(0, limit).map((m) => ({
          id: m.id,
          name: m.nome,
        })),
      };
    }

    if (req.toolId === 'ibge.cnae') {
      const list = (body as Array<Record<string, unknown>>) ?? [];
      const limit = Math.max(1, Math.min(500, Number(params.limit ?? 100)));
      return {
        total: list.length,
        returned: Math.min(limit, list.length),
        classes: list.slice(0, limit),
      };
    }

    return body;
  }
}
