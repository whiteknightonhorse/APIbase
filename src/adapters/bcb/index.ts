import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

/**
 * Banco Central do Brasil — SGS Time Series adapter (UC-405).
 * Brazilian gov open data (ODbL). No auth.
 *
 * IMPORTANT: Use api.bcb.gov.br (SGS) — olinda.bcb.gov.br (PTAX) is geo-blocked from Hetzner DE.
 */
const SERIES: Record<string, { id: number; label: string }> = {
  'bcb.selic': { id: 11, label: 'SELIC daily rate' },
  'bcb.cdi': { id: 12, label: 'CDI daily rate' },
  'bcb.ipca': { id: 433, label: 'IPCA monthly inflation' },
  'bcb.usd_brl': { id: 1, label: 'USD/BRL daily exchange rate' },
  'bcb.eur_brl': { id: 21619, label: 'EUR/BRL daily exchange rate' },
  'bcb.selic_target': { id: 4389, label: 'SELIC target (COPOM)' },
};

export class BcbAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'bcb', baseUrl: 'https://api.bcb.gov.br' });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    const series = SERIES[req.toolId];
    if (!series) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Unsupported: ${req.toolId}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    const n = Math.max(1, Math.min(500, Number(p.last_n ?? 30)));
    return {
      url: `${this.baseUrl}/dados/serie/bcdata.sgs.${series.id}/dados/ultimos/${n}?formato=json`,
      method: 'GET',
      headers,
    };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const series = SERIES[req.toolId];
    const list = (raw.body as Array<{ data: string; valor: string }>) ?? [];
    return {
      series_id: series?.id,
      label: series?.label,
      count: list.length,
      observations: list.map((o) => ({
        date: o.data,
        value: parseFloat(o.valor),
      })),
      latest:
        list.length > 0
          ? { date: list[list.length - 1].data, value: parseFloat(list[list.length - 1].valor) }
          : null,
    };
  }
}
