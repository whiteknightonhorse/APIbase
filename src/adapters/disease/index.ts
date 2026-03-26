import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

/**
 * disease.sh adapter (UC-192).
 *
 * Supported tools:
 *   disease.covid_global  → GET /covid-19/all
 *   disease.covid_country → GET /covid-19/countries/{country}
 *   disease.covid_history → GET /covid-19/historical/{country}
 *   disease.influenza     → GET /influenza/cdc/ILINet
 *
 * Auth: None (MIT open-source).
 */
export class DiseaseAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'disease',
      baseUrl: 'https://disease.sh/v3',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'disease.covid_global': {
        const qs = new URLSearchParams();
        if (params.yesterday) qs.set('yesterday', 'true');
        if (params.twoDaysAgo) qs.set('twoDaysAgo', 'true');
        const q = qs.toString();
        return { url: `${this.baseUrl}/covid-19/all${q ? '?' + q : ''}`, method: 'GET', headers };
      }

      case 'disease.covid_country': {
        const country = encodeURIComponent(String(params.country || 'US'));
        const qs = new URLSearchParams();
        if (params.yesterday) qs.set('yesterday', 'true');
        if (params.strict) qs.set('strict', 'true');
        const q = qs.toString();
        return { url: `${this.baseUrl}/covid-19/countries/${country}${q ? '?' + q : ''}`, method: 'GET', headers };
      }

      case 'disease.covid_history': {
        const country = encodeURIComponent(String(params.country || 'all'));
        const lastdays = params.lastdays ?? 30;
        return { url: `${this.baseUrl}/covid-19/historical/${country}?lastdays=${lastdays}`, method: 'GET', headers };
      }

      case 'disease.influenza': {
        return { url: `${this.baseUrl}/influenza/cdc/ILINet`, method: 'GET', headers };
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

    switch (req.toolId) {
      case 'disease.covid_global':
        return {
          cases: body.cases,
          today_cases: body.todayCases,
          deaths: body.deaths,
          today_deaths: body.todayDeaths,
          recovered: body.recovered,
          active: body.active,
          critical: body.critical,
          cases_per_million: body.casesPerOneMillion,
          deaths_per_million: body.deathsPerOneMillion,
          tests: body.tests,
          tests_per_million: body.testsPerOneMillion,
          population: body.population,
          affected_countries: body.affectedCountries,
          updated: body.updated ? new Date(body.updated as number).toISOString() : null,
        };

      case 'disease.covid_country': {
        const info = body.countryInfo as Record<string, unknown> | undefined;
        return {
          country: body.country,
          iso2: info?.iso2,
          iso3: info?.iso3,
          continent: body.continent,
          cases: body.cases,
          today_cases: body.todayCases,
          deaths: body.deaths,
          today_deaths: body.todayDeaths,
          recovered: body.recovered,
          active: body.active,
          critical: body.critical,
          cases_per_million: body.casesPerOneMillion,
          deaths_per_million: body.deathsPerOneMillion,
          tests: body.tests,
          population: body.population,
          flag: info?.flag,
          updated: body.updated ? new Date(body.updated as number).toISOString() : null,
        };
      }

      case 'disease.covid_history': {
        const timeline = body.timeline as Record<string, Record<string, number>> | undefined;
        if (timeline) {
          return {
            country: body.country,
            timeline: {
              cases: timeline.cases,
              deaths: timeline.deaths,
              recovered: timeline.recovered,
            },
          };
        }
        // Global historical returns timeline at top level
        return {
          country: 'global',
          timeline: {
            cases: body.cases,
            deaths: body.deaths,
            recovered: body.recovered,
          },
        };
      }

      case 'disease.influenza':
        return body;

      default:
        return body;
    }
  }
}
