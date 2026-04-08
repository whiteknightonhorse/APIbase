import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { EmailVerifyOutput } from './types';

/**
 * WhoisXML Email Verification adapter (UC-363).
 *
 * SMTP + DNS + disposable + catch-all + free provider detection.
 * Reuses PROVIDER_KEY_WHOISXML (same account, different endpoint).
 */
export class EmailVerifyAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'email_verify',
      baseUrl: 'https://emailverification.whoisxmlapi.com',
    });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;

    if (req.toolId !== 'email_verify.check') {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Unsupported tool: ${req.toolId}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    const email = encodeURIComponent(String(params.email));
    return {
      url: `https://emailverification.whoisxmlapi.com/api/v3?apiKey=${this.apiKey}&emailAddress=${email}`,
      method: 'GET',
      headers: { Accept: 'application/json' },
    };
  }

  protected parseResponse(raw: ProviderRawResponse): unknown {
    const body = raw.body as Record<string, unknown>;

    const output: EmailVerifyOutput = {
      email: String(body.emailAddress ?? ''),
      format_valid: body.formatCheck === 'true' || body.formatCheck === true,
      smtp_check: body.smtpCheck === 'true' || body.smtpCheck === true,
      dns_check: body.dnsCheck === 'true' || body.dnsCheck === true,
      free_provider: body.freeCheck === 'true' || body.freeCheck === true,
      disposable: body.disposableCheck === 'true' || body.disposableCheck === true,
      catch_all: body.catchAllCheck === 'true' || body.catchAllCheck === true,
      role_account: body.roleCheck === 'true' || body.roleCheck === true,
      audit_created: String((body.audit as Record<string, unknown>)?.auditCreatedDate ?? ''),
      audit_updated: String((body.audit as Record<string, unknown>)?.auditUpdatedDate ?? ''),
    };

    return output;
  }
}
