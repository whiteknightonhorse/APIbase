import { BaseAdapter } from '../base.adapter';
import { type ProviderRequest, type ProviderRawResponse, ProviderErrorCode } from '../../types/provider';

export class RestCountriesAdapter extends BaseAdapter {
  constructor() { super({ provider: 'restcountries', baseUrl: 'https://restcountries.com/v3.1' }); }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const h: Record<string, string> = { Accept: 'application/json' };
    const fields = 'name,capital,population,area,currencies,languages,timezones,flags,region,subregion,borders,cca2,cca3,callingCodes,tld';
    switch (req.toolId) {
      case 'country.search':
        return { url: `${this.baseUrl}/name/${encodeURIComponent(String(p.name))}?fields=${fields}`, method: 'GET', headers: h };
      case 'country.by_code':
        return { url: `${this.baseUrl}/alpha/${encodeURIComponent(String(p.code))}?fields=${fields}`, method: 'GET', headers: h };
      default: throw { code: ProviderErrorCode.INVALID_RESPONSE, httpStatus: 502, message: `Unsupported: ${req.toolId}`, provider: this.provider, toolId: req.toolId, durationMs: 0 };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, _req: ProviderRequest): unknown {
    const data = Array.isArray(raw.body) ? raw.body : [raw.body];
    return { count: data.length, countries: (data as Array<Record<string, unknown>>).slice(0, 10).map(c => {
      const name = (c.name as Record<string, unknown>) ?? {};
      return { name: name.common, official_name: name.official, code: c.cca2, code3: c.cca3, capital: ((c.capital ?? []) as string[])[0], population: c.population, area_km2: c.area, region: c.region, subregion: c.subregion, languages: c.languages, currencies: c.currencies, timezones: c.timezones, flag_emoji: (c.flags as Record<string, unknown>)?.emoji ?? null, flag_svg: (c.flags as Record<string, unknown>)?.svg ?? null, borders: c.borders };
    })};
  }
}
