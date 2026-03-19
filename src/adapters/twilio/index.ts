import { BaseAdapter } from '../base.adapter';
import { type ProviderRequest, type ProviderRawResponse, ProviderErrorCode } from '../../types/provider';

/**
 * Twilio adapter (UC-086).
 * SMS + Phone Lookup.
 * Auth: Account SID + Auth Token (HTTP Basic).
 * Trial: $15.50 credit.
 */
export class TwilioAdapter extends BaseAdapter {
  private readonly accountSid: string;
  private readonly authToken: string;

  constructor(accountSid: string, authToken: string) {
    super({ provider: 'twilio', baseUrl: 'https://api.twilio.com' });
    this.accountSid = accountSid;
    this.authToken = authToken;
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const basicAuth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');

    switch (req.toolId) {
      case 'twilio.lookup': {
        const phone = String(p.phone_number).startsWith('+') ? String(p.phone_number) : `+${String(p.phone_number)}`;
        const fields: string[] = [];
        if (p.include_carrier) fields.push('line_type_intelligence');
        if (p.include_caller_name) fields.push('caller_name');
        const qs = fields.length > 0 ? `?Fields=${fields.join(',')}` : '';
        return {
          url: `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phone)}${qs}`,
          method: 'GET',
          headers: { Authorization: `Basic ${basicAuth}`, Accept: 'application/json' },
        };
      }
      case 'twilio.send_sms': {
        const body = new URLSearchParams();
        body.set('To', String(p.to));
        body.set('From', String(p.from));
        body.set('Body', String(p.body));
        return {
          url: `${this.baseUrl}/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
          method: 'POST',
          headers: {
            Authorization: `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        };
      }
      default:
        throw { code: ProviderErrorCode.INVALID_RESPONSE, httpStatus: 502, message: `Unsupported: ${req.toolId}`, provider: this.provider, toolId: req.toolId, durationMs: 0 };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;

    if (req.toolId === 'twilio.lookup') {
      const lineType = (body.line_type_intelligence as Record<string, unknown>) ?? {};
      const callerName = (body.caller_name as Record<string, unknown>) ?? {};
      return {
        phone_number: body.phone_number,
        valid: body.valid,
        country_code: body.country_code,
        national_format: body.national_format,
        carrier_name: lineType.carrier_name ?? null,
        line_type: lineType.type ?? null,
        caller_name: callerName.caller_name ?? null,
        calling_country_code: body.calling_country_code,
      };
    }

    // send_sms
    return {
      sid: body.sid,
      status: body.status,
      to: body.to,
      from: body.from,
      date_created: body.date_created,
      price: body.price,
      error_code: body.error_code ?? null,
      error_message: body.error_message ?? null,
    };
  }
}
