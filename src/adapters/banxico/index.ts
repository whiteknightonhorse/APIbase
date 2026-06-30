import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

/**
 * Banco de México — SIE (Sistema de Información Económica) adapter (UC-544).
 * Official Mexican central bank data: FX rates, interest rates, inflation.
 * Token-based auth (Bmx-Token header). Free registration, no call limits documented.
 */

// SIE series IDs for each tool
const SERIES_CONFIG: Record<string, { ids: string[]; labels: Record<string, string> }> = {
  'banxico.fix_rate': {
    ids: ['SF43718'],
    labels: { SF43718: 'USD/MXN FIX (Bank of Mexico official rate)' },
  },
  'banxico.fx_rates': {
    ids: ['SF43718', 'SF46410', 'SF60632', 'SF60633'],
    labels: {
      SF43718: 'USD/MXN',
      SF46410: 'EUR/MXN',
      SF60632: 'CAD/MXN',
      SF60633: 'GBP/MXN',
    },
  },
  'banxico.target_rate': {
    ids: ['SF61745'],
    labels: { SF61745: 'Banxico overnight target rate (Tasa objetivo)' },
  },
  'banxico.tiie_rate': {
    ids: ['SF43783'],
    labels: { SF43783: 'TIIE 28-day interbank offered rate' },
  },
  'banxico.cpi': {
    ids: ['SP1'],
    labels: { SP1: 'INPC — Mexico consumer price index (base Jul 2018 = 100)' },
  },
};

interface SieSeries {
  idSerie: string;
  titulo: string;
  datos: Array<{ fecha: string; dato: string }>;
}

interface SieResponse {
  bmx: { series: SieSeries[] };
}

export class BanxicoAdapter extends BaseAdapter {
  private readonly token: string;

  constructor(token: string) {
    super({ provider: 'banxico', baseUrl: 'https://www.banxico.org.mx' });
    this.token = token;
  }

  protected buildRequest(req: ProviderRequest) {
    const cfg = SERIES_CONFIG[req.toolId];
    if (!cfg) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Unsupported tool: ${req.toolId}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    const p = req.params as Record<string, unknown>;
    const seriesIds = cfg.ids.join(',');
    const headers: Record<string, string> = {
      'Bmx-Token': this.token,
      Accept: 'application/json',
    };

    const startDate = p.start_date as string | undefined;
    const endDate = p.end_date as string | undefined;

    let path: string;
    if (startDate && endDate) {
      path = `/SieAPIRest/service/v1/series/${encodeURIComponent(seriesIds)}/datos/${encodeURIComponent(startDate)}/${encodeURIComponent(endDate)}`;
    } else {
      path = `/SieAPIRest/service/v1/series/${encodeURIComponent(seriesIds)}/datos/oportuno`;
    }

    return { url: `${this.baseUrl}${path}`, method: 'GET', headers };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const cfg = SERIES_CONFIG[req.toolId];
    const body = raw.body as SieResponse;
    const series = body?.bmx?.series ?? [];

    if (req.toolId === 'banxico.fx_rates') {
      const rates: Record<string, { value: number; date: string; label: string }> = {};
      for (const s of series) {
        const lbl = cfg.labels[s.idSerie] ?? s.idSerie;
        const latest = s.datos?.[s.datos.length - 1];
        if (latest) {
          rates[lbl] = {
            date: latest.fecha,
            value: parseFloat(latest.dato),
            label: lbl,
          };
        }
      }
      return { currency_base: 'MXN', rates };
    }

    // Single-series tools (fix_rate, target_rate, tiie_rate, cpi)
    const s = series[0];
    if (!s) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'Empty series response from Banxico SIE',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    const observations = (s.datos ?? []).map((d) => ({
      date: d.fecha,
      value: parseFloat(d.dato),
    }));

    const latest = observations[observations.length - 1] ?? null;

    return {
      series_id: s.idSerie,
      label: cfg.labels[s.idSerie] ?? s.titulo.trim(),
      count: observations.length,
      latest,
      observations,
    };
  }
}
