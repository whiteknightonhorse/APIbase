import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { IfscLookupResponse } from './types';

/**
 * Razorpay IFSC adapter (UC-425).
 *
 * Supported tools:
 *   razorpayifsc.lookup → GET https://ifsc.razorpay.com/{IFSC_CODE}
 *
 * Auth: None (public, MIT-licensed open data).
 *
 * Error: invalid IFSC → 404 plain-text "Not Found".
 * BaseAdapter handles 4xx as INVALID_RESPONSE — the 404 body
 * text is included in the error message for the caller.
 */
export class RazorpayIfscAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'razorpayifsc',
      baseUrl: 'https://ifsc.razorpay.com',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'razorpayifsc.lookup': {
        const ifscCode = String(params.ifsc_code ?? '')
          .trim()
          .toUpperCase();
        if (!ifscCode) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 400,
            message: 'ifsc_code is required',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        return {
          url: `${this.baseUrl}/${encodeURIComponent(ifscCode)}`,
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        };
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
    switch (req.toolId) {
      case 'razorpayifsc.lookup': {
        const data = raw.body as IfscLookupResponse;
        return {
          ifsc: data.IFSC,
          bank: data.BANK,
          bankcode: data.BANKCODE,
          branch: data.BRANCH,
          address: data.ADDRESS,
          city: data.CITY,
          district: data.DISTRICT,
          state: data.STATE,
          centre: data.CENTRE,
          micr: data.MICR,
          contact: data.CONTACT,
          swift: data.SWIFT,
          iso3166: data.ISO3166,
          capabilities: {
            upi: data.UPI,
            rtgs: data.RTGS,
            neft: data.NEFT,
            imps: data.IMPS,
          },
        };
      }
      default:
        return raw.body;
    }
  }
}
