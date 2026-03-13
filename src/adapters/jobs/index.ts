import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  BlsTimeseriesResponse,
  OnetSearchResponse,
  OnetOccupationDetails,
  OnetSummaryResponse,
  EscoSearchResponse,
  EscoOccupation,
  EscoSkill,
  CareerJetResponse,
} from './types';

/**
 * Jobs / Career Intelligence adapter (UC-015).
 *
 * Routes to 4 upstream providers based on toolId:
 *   jobs.salary_data        -> BLS POST /publicAPI/v2/timeseries/data/ (US salary/employment data)
 *   jobs.occupation_search  -> O*NET GET /ws/online/search (occupation taxonomy search)
 *   jobs.occupation_details -> O*NET GET /ws/online/occupations/{code} (occupation details + sections)
 *   jobs.esco_search        -> ESCO GET /search (EU skills/occupations search)
 *   jobs.esco_details       -> ESCO GET /resource/occupation or /resource/skill (EU resource details)
 *   jobs.job_search         -> CareerJet GET /v4/query (global job listings)
 */
export class JobsAdapter extends BaseAdapter {
  private readonly onetApiKey: string;
  private readonly blsApiKey: string;
  private readonly careerjetApiKey: string;
  private readonly onetAuth: string;
  private readonly careerjetAuth: string;

  private static readonly BLS_BASE = 'https://api.bls.gov/publicAPI/v2';
  private static readonly ONET_BASE = 'https://services.onetcenter.org/ws';
  private static readonly ESCO_BASE = 'https://ec.europa.eu/esco/api';
  private static readonly CAREERJET_BASE = 'https://search.api.careerjet.net/v4';
  private static readonly UA = 'APIbase/1.0 (https://apibase.pro; contact@apibase.pro)';

  constructor(onetApiKey: string, blsApiKey?: string, careerjetApiKey?: string) {
    super({
      provider: 'jobs',
      baseUrl: 'https://services.onetcenter.org/ws',
    });
    this.onetApiKey = onetApiKey;
    this.blsApiKey = blsApiKey ?? '';
    this.careerjetApiKey = careerjetApiKey ?? '';
    // O*NET Basic Auth: username = API key, password = empty string
    this.onetAuth = 'Basic ' + Buffer.from(`${this.onetApiKey}:`).toString('base64');
    // CareerJet Basic Auth: username = API key, password = empty string
    this.careerjetAuth = this.careerjetApiKey
      ? 'Basic ' + Buffer.from(`${this.careerjetApiKey}:`).toString('base64')
      : '';
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'jobs.salary_data':
        return this.buildSalaryData(params, headers);
      case 'jobs.occupation_search':
        return this.buildOccupationSearch(params, headers);
      case 'jobs.occupation_details':
        return this.buildOccupationDetails(params, headers);
      case 'jobs.esco_search':
        return this.buildEscoSearch(params, headers);
      case 'jobs.esco_details':
        return this.buildEscoDetails(params, headers);
      case 'jobs.job_search':
        return this.buildJobSearch(params, headers);
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
    const body = raw.body;

    switch (req.toolId) {
      case 'jobs.salary_data': {
        const data = body as BlsTimeseriesResponse;
        if (!data.Results?.series) {
          throw new Error('Missing Results.series in BLS response');
        }
        return data;
      }
      case 'jobs.occupation_search': {
        const data = body as OnetSearchResponse;
        if (!data.occupation) {
          throw new Error('Missing occupation array in O*NET search response');
        }
        return data;
      }
      case 'jobs.occupation_details': {
        const params = req.params as Record<string, unknown>;
        if (params.section) {
          // Summary section response
          const data = body as OnetSummaryResponse;
          if (!data.element) {
            throw new Error('Missing element array in O*NET summary response');
          }
          return data;
        }
        // Overview response
        const data = body as OnetOccupationDetails;
        if (!data.code || !data.title) {
          throw new Error('Missing code/title in O*NET occupation details response');
        }
        return data;
      }
      case 'jobs.esco_search': {
        const data = body as EscoSearchResponse;
        if (!data._embedded?.results) {
          throw new Error('Missing _embedded.results in ESCO search response');
        }
        return data;
      }
      case 'jobs.esco_details': {
        const params = req.params as Record<string, unknown>;
        if (params.type === 'skill') {
          const data = body as EscoSkill;
          if (!data.uri || !data.title) {
            throw new Error('Missing uri/title in ESCO skill response');
          }
          return data;
        }
        const data = body as EscoOccupation;
        if (!data.uri || !data.title) {
          throw new Error('Missing uri/title in ESCO occupation response');
        }
        return data;
      }
      case 'jobs.job_search': {
        const data = body as CareerJetResponse;
        if (!data.jobs) {
          throw new Error('Missing jobs array in CareerJet response');
        }
        return data;
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // BLS — Bureau of Labor Statistics (salary/employment timeseries)
  // ---------------------------------------------------------------------------

  private buildSalaryData(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string>; body?: string } {
    const requestBody: Record<string, unknown> = {
      seriesid: params.series_ids as string[],
    };
    if (params.start_year) requestBody.startyear = String(params.start_year);
    if (params.end_year) requestBody.endyear = String(params.end_year);
    if (this.blsApiKey) requestBody.registrationkey = this.blsApiKey;

    headers['Content-Type'] = 'application/json';

    return {
      url: `${JobsAdapter.BLS_BASE}/timeseries/data/`,
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    };
  }

  // ---------------------------------------------------------------------------
  // O*NET — Occupation Search
  // ---------------------------------------------------------------------------

  private buildOccupationSearch(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    headers['Authorization'] = this.onetAuth;

    const qs = new URLSearchParams();
    qs.set('keyword', String(params.keyword));
    if (params.start != null) qs.set('start', String(params.start));
    if (params.end != null) qs.set('end', String(params.end));

    return {
      url: `${JobsAdapter.ONET_BASE}/online/search?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // O*NET — Occupation Details (overview or section summary)
  // ---------------------------------------------------------------------------

  private buildOccupationDetails(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    headers['Authorization'] = this.onetAuth;

    const code = encodeURIComponent(String(params.code));
    const section = params.section ? String(params.section) : undefined;

    const url = section
      ? `${JobsAdapter.ONET_BASE}/online/occupations/${code}/summary/${encodeURIComponent(section)}`
      : `${JobsAdapter.ONET_BASE}/online/occupations/${code}`;

    return {
      url,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // ESCO — EU Skills/Occupations Search
  // ---------------------------------------------------------------------------

  private buildEscoSearch(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('text', String(params.text));
    qs.set('type', String(params.type || 'occupation'));
    qs.set('language', String(params.language || 'en'));
    qs.set('limit', String(params.limit || 25));
    if (params.offset != null) qs.set('offset', String(params.offset));

    return {
      url: `${JobsAdapter.ESCO_BASE}/search?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // ESCO — EU Resource Details (occupation or skill by URI)
  // ---------------------------------------------------------------------------

  private buildEscoDetails(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const type = String(params.type || 'occupation');
    const uri = String(params.uri);
    const language = String(params.language || 'en');

    const qs = new URLSearchParams();
    qs.set('uri', uri);
    qs.set('language', language);

    const endpoint = type === 'skill' ? 'skill' : 'occupation';

    return {
      url: `${JobsAdapter.ESCO_BASE}/resource/${endpoint}?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // CareerJet v4 — Global Job Listings Search
  // ---------------------------------------------------------------------------

  private buildJobSearch(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    if (!this.careerjetAuth) {
      throw {
        code: ProviderErrorCode.UNAVAILABLE,
        httpStatus: 502,
        message: 'CareerJet API key not configured (PROVIDER_KEY_CAREERJET)',
        provider: this.provider,
        toolId: 'jobs.job_search',
        durationMs: 0,
      };
    }

    headers['Authorization'] = this.careerjetAuth;
    // CareerJet requires Referer header matching registered publisher domain
    headers['Referer'] = 'https://apibase.pro';

    const qs = new URLSearchParams();
    qs.set('keywords', String(params.keywords));
    if (params.location) qs.set('location', String(params.location));
    qs.set('locale_code', String(params.locale_code || 'en_US'));
    if (params.contract_type) qs.set('contracttype', String(params.contract_type));
    if (params.work_hours) {
      // CareerJet expects "f" for full_time, "p" for part_time
      const wh = String(params.work_hours);
      qs.set('contractperiod', wh === 'full_time' ? 'f' : wh === 'part_time' ? 'p' : wh);
    }
    qs.set('sort', String(params.sort || 'relevance'));
    qs.set('page', String(params.page || 1));
    qs.set('pagesize', String(params.page_size || 20));
    // Required fraud prevention params — server-side defaults
    qs.set('user_ip', '5.78.135.159');
    qs.set('user_agent', JobsAdapter.UA);

    return {
      url: `${JobsAdapter.CAREERJET_BASE}/query?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }
}
