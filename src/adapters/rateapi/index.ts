import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

const PRODUCT_MAP: Record<string, string> = {
  'rateapi.mortgage': 'mortgage',
  'rateapi.auto_loan': 'auto_loan',
  'rateapi.heloc': 'heloc',
  'rateapi.personal_loan': 'personal_loan',
};

/**
 * RateAPI adapter (UC-197).
 *
 * Supported tools:
 *   rateapi.mortgage      → POST /v1/decisions (product_type: mortgage)
 *   rateapi.auto_loan     → POST /v1/decisions (product_type: auto_loan)
 *   rateapi.heloc         → POST /v1/decisions (product_type: heloc)
 *   rateapi.personal_loan → POST /v1/decisions (product_type: personal_loan)
 *
 * Auth: Bearer token. MCP-native API designed for AI agents.
 */
export class RateApiAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'rateapi',
      baseUrl: 'https://api.rateapi.dev/v1',
    });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const productType = PRODUCT_MAP[req.toolId];
    if (!productType) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Unsupported tool: ${req.toolId}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    const params = req.params as Record<string, unknown>;

    const productRequest: Record<string, unknown> = {
      product_type: productType,
    };

    // Common fields
    if (params.amount) productRequest.amount = Number(params.amount);
    if (params.term_months) productRequest.term_months = Number(params.term_months);
    if (params.intent) productRequest.intent = String(params.intent);
    if (params.rate_type) productRequest.rate_type = String(params.rate_type);

    // Mortgage-specific
    if (params.loan_type) productRequest.rate_type = String(params.loan_type);

    // Auto-specific
    if (params.vehicle_type) productRequest.vehicle_type = String(params.vehicle_type);

    // HELOC-specific
    if (params.cltv) productRequest.cltv = Number(params.cltv);

    const context: Record<string, unknown> = {
      request_id: req.requestId || `apibase-${Date.now()}`,
    };

    // Geo context
    if (params.state || params.credit_score) {
      const geo: Record<string, unknown> = {};
      if (params.state) geo.state = String(params.state);
      context.geo = geo;
    }

    if (params.credit_score) {
      context.credit_score = String(params.credit_score);
    }

    const body = JSON.stringify({
      decision_type: 'financing',
      context,
      product_request: productRequest,
    });

    return {
      url: `${this.baseUrl}/decisions`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body,
    };
  }

  protected parseResponse(raw: ProviderRawResponse, _req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;

    return {
      request_id: body.request_id,
      decision_type: body.decision_type,
      as_of: body.as_of,
      summary: body.summary,
      actions: body.actions,
      disclosures: body.disclosures,
    };
  }
}
