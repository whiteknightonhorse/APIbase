import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { WitsSdmxResponse } from './types';

const WITS_BASE = 'https://wits.worldbank.org/API/V1/SDMX/V21/datasource';

const CODE_RE = /^[A-Za-z0-9_-]{1,40}$/;
const YEAR_RE = /^\d{4}$/;

/**
 * World Bank WITS (World Integrated Trade Solution) adapter (UC-777).
 *
 * WITS SDMX-JSON API — trade flows (UN Comtrade) and tariffs (UNCTAD TRAINS).
 * No auth, no documented rate limit.
 *   wits-trade.trade_stats  -> GET /tradestats-trade/reporter/{r}/year/{y}/partner/{p}/product/{c}/indicator/{i}?format=JSON
 *   wits-trade.tariff_stats -> GET /tradestats-tariff/reporter/{r}/year/{y}/partner/{p}/product/{c}/indicator/{i}?format=JSON
 */
export class WitsTradeAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'wits-trade', baseUrl: WITS_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    let source: string;
    let defaultIndicator: string;
    switch (req.toolId) {
      case 'wits-trade.trade_stats':
        source = 'tradestats-trade';
        defaultIndicator = 'XPRT-TRD-VL';
        break;
      case 'wits-trade.tariff_stats':
        source = 'tradestats-tariff';
        defaultIndicator = 'MFN-WGHTD-AVRG';
        break;
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

    const reporter = this.code(req.toolId, 'reporter', params.reporter);
    const partner = this.code(req.toolId, 'partner', params.partner || 'wld');
    const product = this.code(req.toolId, 'product', params.product || 'Total');
    const indicator = this.code(req.toolId, 'indicator', params.indicator || defaultIndicator);

    const years = String(params.year || '')
      .split(/[;,]/)
      .map((y) => y.trim())
      .filter(Boolean);
    if (years.length === 0 || years.length > 10 || years.some((y) => !YEAR_RE.test(y))) {
      throw this.invalidInput(
        req.toolId,
        'year must be 1-10 four-digit years, e.g. "2020" or "2018,2019,2020"',
      );
    }

    const path = [
      source,
      'reporter',
      reporter,
      'year',
      years.join(';'),
      'partner',
      partner,
      'product',
      product,
      'indicator',
      indicator,
    ].join('/');
    return {
      url: `${WITS_BASE}/${path}?format=JSON`,
      method: 'GET',
      headers: { Accept: 'application/json' },
    };
  }

  protected parseResponse(raw: ProviderRawResponse, _req: ProviderRequest): unknown {
    const body = raw.body as WitsSdmxResponse;
    const seriesDims = body.structure?.dimensions?.series ?? [];
    const years = body.structure?.dimensions?.observation?.[0]?.values ?? [];
    const dim = (id: string) => seriesDims.find((d) => d.id === id)?.values?.[0];

    const series = body.dataSets?.[0]?.series ?? {};
    const first = Object.values(series)[0];
    const observations = Object.entries(first?.observations ?? {})
      .map(([idx, v]) => ({
        year: years[Number(idx)]?.id ?? null,
        value: v[0] ?? null,
      }))
      .sort((a, b) => String(a.year).localeCompare(String(b.year)));

    return {
      dataset: body.structure?.name ?? null,
      reporter: dim('REPORTER') ?? null,
      partner: dim('PARTNER') ?? null,
      product: dim('PRODUCTCODE') ?? null,
      indicator: dim('INDICATOR') ?? null,
      count: observations.length,
      observations,
    };
  }

  private code(toolId: string, field: string, value: unknown): string {
    const s = String(value ?? '').trim();
    if (!CODE_RE.test(s))
      throw this.invalidInput(toolId, `${field} is required and must be a valid code`);
    return s;
  }

  private invalidInput(toolId: string, message: string): never {
    throw {
      code: ProviderErrorCode.INPUT_REJECTED,
      httpStatus: 422,
      message,
      provider: this.provider,
      toolId,
      durationMs: 0,
    };
  }
}
