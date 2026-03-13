import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  UsdaFoodSearchResponse,
  UsdaFoodDetailsResponse,
  OpenFdaDrugEventsResponse,
  OpenFdaFoodRecallsResponse,
  OpenFdaDrugLabelsResponse,
} from './types';

/**
 * Health & Nutrition adapter (UC-011).
 *
 * Routes to 3 upstream providers based on toolId:
 *   health.food_search / health.food_details    -> USDA FoodData Central
 *   health.drug_events / health.food_recalls / health.drug_labels -> OpenFDA
 *   health.supplement_search / health.supplement_details -> NIH DSLD
 *
 * Auth:
 *   USDA: query param ?api_key=KEY (required)
 *   OpenFDA: query param ?api_key=KEY (optional, higher rate limit with key)
 *   NIH DSLD: none (public)
 */
export class HealthAdapter extends BaseAdapter {
  private readonly usdaApiKey: string;
  private readonly openFdaApiKey: string;

  private static readonly USDA_BASE = 'https://api.nal.usda.gov/fdc/v1';
  private static readonly OPENFDA_BASE = 'https://api.fda.gov';
  private static readonly DSLD_BASE = 'https://api.ods.od.nih.gov/dsld/v9';

  constructor(usdaApiKey: string, openFdaApiKey?: string) {
    super({
      provider: 'health',
      baseUrl: 'https://api.nal.usda.gov/fdc/v1',
    });
    this.usdaApiKey = usdaApiKey;
    this.openFdaApiKey = openFdaApiKey ?? '';
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
      case 'health.food_search':
        return this.buildFoodSearch(params, headers);
      case 'health.food_details':
        return this.buildFoodDetails(params, headers);
      case 'health.drug_events':
        return this.buildDrugEvents(params, headers);
      case 'health.food_recalls':
        return this.buildFoodRecalls(params, headers);
      case 'health.drug_labels':
        return this.buildDrugLabels(params, headers);
      case 'health.supplement_search':
        return this.buildSupplementSearch(params, headers);
      case 'health.supplement_details':
        return this.buildSupplementDetails(params, headers);
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
      case 'health.food_search': {
        const data = body as UsdaFoodSearchResponse;
        if (!data.foods) {
          throw new Error('Missing foods in USDA search response');
        }
        return data;
      }
      case 'health.food_details': {
        const data = body as UsdaFoodDetailsResponse;
        if (!data.fdcId || !data.description) {
          throw new Error('Missing required fields in USDA food details response');
        }
        return data;
      }
      case 'health.drug_events': {
        const data = body as OpenFdaDrugEventsResponse;
        if (!data.results) {
          throw new Error('Missing results in OpenFDA drug events response');
        }
        return data;
      }
      case 'health.food_recalls': {
        const data = body as OpenFdaFoodRecallsResponse;
        if (!data.results) {
          throw new Error('Missing results in OpenFDA food recalls response');
        }
        return data;
      }
      case 'health.drug_labels': {
        const data = body as OpenFdaDrugLabelsResponse;
        if (!data.results) {
          throw new Error('Missing results in OpenFDA drug labels response');
        }
        return data;
      }
      case 'health.supplement_search': {
        // DSLD search-filter returns { hits: [...], stats: {...} }
        const raw = body as Record<string, unknown>;
        if (!Array.isArray(raw.hits)) {
          throw new Error('Missing hits in NIH DSLD search response');
        }
        return raw;
      }
      case 'health.supplement_details': {
        // DSLD label/{id} returns { id, fullName, brandName, ... }
        const raw = body as Record<string, unknown>;
        if (!raw.id && !raw.fullName) {
          throw new Error('Missing required fields in NIH DSLD supplement details response');
        }
        return raw;
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // USDA FoodData Central
  // ---------------------------------------------------------------------------

  /** POST /fdc/v1/foods/search — search USDA food database */
  private buildFoodSearch(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string>; body?: string } {
    const qs = new URLSearchParams();
    qs.set('api_key', this.usdaApiKey);

    const body: Record<string, unknown> = {
      query: String(params.query),
    };
    if (params.data_type && params.data_type !== 'all') {
      body.dataType = [String(params.data_type)];
    }
    if (params.brand_owner) body.brandOwner = String(params.brand_owner);
    if (params.page_size) body.pageSize = Number(params.page_size);
    if (params.page_number) body.pageNumber = Number(params.page_number);

    return {
      url: `${HealthAdapter.USDA_BASE}/foods/search?${qs.toString()}`,
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    };
  }

  /** GET /fdc/v1/food/{fdcId} — get detailed food data with nutrients */
  private buildFoodDetails(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const fdcId = String(params.fdc_id);
    const qs = new URLSearchParams();
    qs.set('api_key', this.usdaApiKey);

    return {
      url: `${HealthAdapter.USDA_BASE}/food/${encodeURIComponent(fdcId)}?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // OpenFDA
  // ---------------------------------------------------------------------------

  /** GET /drug/event.json — search FAERS adverse event reports */
  private buildDrugEvents(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (this.openFdaApiKey) qs.set('api_key', this.openFdaApiKey);
    qs.set('search', String(params.search));
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.skip) qs.set('skip', String(params.skip));

    return {
      url: `${HealthAdapter.OPENFDA_BASE}/drug/event.json?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  /** GET /food/enforcement.json — search FDA food recalls */
  private buildFoodRecalls(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (this.openFdaApiKey) qs.set('api_key', this.openFdaApiKey);

    const searchParts: string[] = [];
    if (params.search) searchParts.push(String(params.search));
    if (params.status) searchParts.push(`status:"${String(params.status)}"`);

    if (searchParts.length > 0) {
      qs.set('search', searchParts.join('+AND+'));
    }
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.skip) qs.set('skip', String(params.skip));

    return {
      url: `${HealthAdapter.OPENFDA_BASE}/food/enforcement.json?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  /** GET /drug/label.json — search drug labeling data */
  private buildDrugLabels(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (this.openFdaApiKey) qs.set('api_key', this.openFdaApiKey);
    qs.set('search', String(params.search));
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.skip) qs.set('skip', String(params.skip));

    return {
      url: `${HealthAdapter.OPENFDA_BASE}/drug/label.json?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // NIH DSLD (Dietary Supplement Label Database)
  // ---------------------------------------------------------------------------

  /** NIH DSLD search-filter — search supplement labels */
  private buildSupplementSearch(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('q', String(params.query));
    if (params.limit) qs.set('size', String(params.limit));
    if (params.offset) qs.set('from', String(params.offset));

    return {
      url: `${HealthAdapter.DSLD_BASE}/search-filter?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  /** NIH DSLD label/{id} — get supplement label details */
  private buildSupplementDetails(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const dsldId = String(params.dsld_id);

    return {
      url: `${HealthAdapter.DSLD_BASE}/label/${encodeURIComponent(dsldId)}`,
      method: 'GET',
      headers,
    };
  }
}
