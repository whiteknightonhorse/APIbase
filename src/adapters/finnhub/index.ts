import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  FinnhubQuote,
  FinnhubCompanyProfile,
  FinnhubNewsArticle,
  FinnhubCandleResponse,
} from './types';

/**
 * Finnhub stock market adapter (UC-074).
 *
 * Supported tools (read-only):
 *   finnhub.quote           → GET /quote
 *   finnhub.company_profile → GET /stock/profile2
 *   finnhub.company_news    → GET /company-news
 *   finnhub.candles          → GET /stock/candle
 *   finnhub.market_news     → GET /news
 *
 * Auth: token query parameter.
 * Free tier: 60 req/min (~86,400/day).
 */
export class FinnhubAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'finnhub',
      baseUrl: 'https://finnhub.io/api/v1',
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
      case 'finnhub.quote':
        return this.buildQuoteRequest(params, headers);
      case 'finnhub.company_profile':
        return this.buildProfileRequest(params, headers);
      case 'finnhub.company_news':
        return this.buildCompanyNewsRequest(params, headers);
      case 'finnhub.candles':
        return this.buildCandlesRequest(params, headers);
      case 'finnhub.market_news':
        return this.buildMarketNewsRequest(params, headers);
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
    switch (req.toolId) {
      case 'finnhub.quote':
        return this.parseQuote(raw);
      case 'finnhub.company_profile':
        return this.parseProfile(raw);
      case 'finnhub.company_news':
      case 'finnhub.market_news':
        return this.parseNews(raw);
      case 'finnhub.candles':
        return this.parseCandles(raw);
      default:
        return raw.body;
    }
  }

  private qs(_params: Record<string, unknown>): URLSearchParams {
    const qs = new URLSearchParams();
    qs.set('token', this.apiKey);
    return qs;
  }

  private buildQuoteRequest(p: Record<string, unknown>, h: Record<string, string>) {
    const qs = this.qs(p);
    qs.set('symbol', String(p.symbol).toUpperCase());
    return { url: `${this.baseUrl}/quote?${qs}`, method: 'GET', headers: h };
  }

  private buildProfileRequest(p: Record<string, unknown>, h: Record<string, string>) {
    const qs = this.qs(p);
    qs.set('symbol', String(p.symbol).toUpperCase());
    return { url: `${this.baseUrl}/stock/profile2?${qs}`, method: 'GET', headers: h };
  }

  private buildCompanyNewsRequest(p: Record<string, unknown>, h: Record<string, string>) {
    const qs = this.qs(p);
    qs.set('symbol', String(p.symbol).toUpperCase());
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    qs.set('from', String(p.from ?? weekAgo.toISOString().split('T')[0]));
    qs.set('to', String(p.to ?? now.toISOString().split('T')[0]));
    return { url: `${this.baseUrl}/company-news?${qs}`, method: 'GET', headers: h };
  }

  private buildCandlesRequest(p: Record<string, unknown>, h: Record<string, string>) {
    const qs = this.qs(p);
    qs.set('symbol', String(p.symbol).toUpperCase());
    qs.set('resolution', String(p.resolution ?? 'D'));
    const now = Math.floor(Date.now() / 1000);
    qs.set('from', String(p.from ?? now - 30 * 86400));
    qs.set('to', String(p.to ?? now));
    return { url: `${this.baseUrl}/stock/candle?${qs}`, method: 'GET', headers: h };
  }

  private buildMarketNewsRequest(p: Record<string, unknown>, h: Record<string, string>) {
    const qs = this.qs(p);
    qs.set('category', String(p.category ?? 'general'));
    return { url: `${this.baseUrl}/news?${qs}`, method: 'GET', headers: h };
  }

  private parseQuote(raw: ProviderRawResponse): unknown {
    const d = raw.body as unknown as FinnhubQuote;
    return {
      price: d.c,
      change: d.d,
      change_percent: d.dp,
      high: d.h,
      low: d.l,
      open: d.o,
      previous_close: d.pc,
      timestamp: d.t ? new Date(d.t * 1000).toISOString() : null,
    };
  }

  private parseProfile(raw: ProviderRawResponse): unknown {
    const d = raw.body as unknown as FinnhubCompanyProfile;
    return {
      name: d.name,
      ticker: d.ticker,
      exchange: d.exchange,
      industry: d.finnhubIndustry,
      country: d.country,
      currency: d.currency,
      market_cap_millions: d.marketCapitalization,
      shares_outstanding: d.shareOutstanding,
      ipo_date: d.ipo,
      logo: d.logo,
      website: d.weburl,
    };
  }

  private parseNews(raw: ProviderRawResponse): unknown {
    const articles = raw.body as unknown as FinnhubNewsArticle[];
    return {
      count: articles.length,
      articles: (articles ?? []).slice(0, 20).map((a) => ({
        headline: a.headline,
        source: a.source,
        url: a.url,
        summary: a.summary,
        image: a.image || null,
        datetime: a.datetime ? new Date(a.datetime * 1000).toISOString() : null,
        category: a.category,
      })),
    };
  }

  private parseCandles(raw: ProviderRawResponse): unknown {
    const d = raw.body as unknown as FinnhubCandleResponse;
    if (d.s !== 'ok' || !d.c) return { status: 'no_data', candles: [] };
    return {
      status: 'ok',
      candles: d.c.map((_, i) => ({
        open: d.o[i],
        high: d.h[i],
        low: d.l[i],
        close: d.c[i],
        volume: d.v[i],
        timestamp: new Date(d.t[i] * 1000).toISOString(),
      })),
    };
  }
}
