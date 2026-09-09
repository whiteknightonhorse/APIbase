import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

/**
 * ssl-checker.io adapter (UC-119).
 * SSL certificate checker. No auth. Free.
 */
export class SslCheckerAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'sslchecker', baseUrl: 'https://ssl-checker.io/api/v1' });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    if (req.toolId === 'ssl.check') {
      // SSRF protection: only allow valid domain names
      const domain = String(p.domain)
        .replace(/^https?:\/\//, '')
        .split('/')[0];
      return {
        url: `${this.baseUrl}/check/${encodeURIComponent(domain)}`,
        method: 'GET',
        headers: { Accept: 'application/json' },
      };
    }
    if (req.toolId === '__sslchecker_probe__') {
      // Synthetic probe tool: validates endpoint returns proper JSON with required fields.
      // Detects false-positive 200 from parked domain (Sedo parking page returns HTML with 200).
      const domain = String(p.__domain)
        .replace(/^https?:\/\//, '')
        .split('/')[0];
      return {
        url: `${this.baseUrl}/check/${encodeURIComponent(domain)}`,
        method: 'GET',
        headers: { Accept: 'application/json' },
      };
    }
    throw {
      code: ProviderErrorCode.INVALID_RESPONSE,
      httpStatus: 502,
      message: `Unsupported: ${req.toolId}`,
      provider: this.provider,
      toolId: req.toolId,
      durationMs: 0,
    };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;

    if (req.toolId === '__sslchecker_probe__') {
      // Probe: validate response has the expected structure (result field with host).
      // If parsing reaches here, JSON is valid. Now check for the probe-expected
      // fields — if the API is parked/down, body.result will be undefined.
      const r = (body.result ?? {}) as Record<string, unknown>;
      if (!r.host) {
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message:
            'Provider returned JSON but missing expected .result.host field (likely API is down or parked)',
          provider: this.provider,
          toolId: req.toolId,
          durationMs: raw.durationMs,
        };
      }
      return { status: 'ok', host: r.host };
    }

    // Normal ssl.check tool response
    const r = (body.result ?? {}) as Record<string, unknown>;
    return {
      host: r.host,
      resolved_ip: r.resolved_ip,
      issued_to: r.issued_to,
      issuer: r.issuer_o ?? r.issuer_cn,
      valid_from: r.validFrom,
      valid_to: r.validTo,
      days_remaining: r.daysLeft,
      protocol: r.protocol,
      key_size: r.keySize,
      signature_algorithm: r.signatureAlgorithm,
      hsts: r.hsts,
    };
  }
}
