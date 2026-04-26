import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

/**
 * Telnyx adapter (UC-395).
 * SMS + Voice (CPaaS), v2 REST API.
 * Auth: Bearer API Key v2 (KEY01...).
 * Trial: $10 credit. ToS AUP explicitly permits ISV resale of A2P messaging + voice.
 */
export class TelnyxAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ provider: 'telnyx', baseUrl: 'https://api.telnyx.com' });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const baseHeaders: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'telnyx.send_sms': {
        const body: Record<string, unknown> = {
          to: String(p.to),
          from: String(p.from),
          text: String(p.text),
        };
        if (p.messaging_profile_id) body.messaging_profile_id = String(p.messaging_profile_id);
        return {
          url: `${this.baseUrl}/v2/messages`,
          method: 'POST',
          headers: { ...baseHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        };
      }
      case 'telnyx.message_status': {
        const id = encodeURIComponent(String(p.message_id));
        return {
          url: `${this.baseUrl}/v2/messages/${id}`,
          method: 'GET',
          headers: baseHeaders,
        };
      }
      case 'telnyx.list_messages': {
        // Telnyx uses Detail Records (MDR) for message history, not /v2/messages
        const qs = new URLSearchParams();
        qs.set('filter[record_type]', 'mdr');
        if (p.limit !== undefined && p.limit !== null) qs.set('page[size]', String(p.limit));
        if (p.direction) qs.set('filter[direction]', String(p.direction));
        if (p.date_from) qs.set('filter[date][gte]', String(p.date_from));
        return {
          url: `${this.baseUrl}/v2/detail_records?${qs.toString()}`,
          method: 'GET',
          headers: baseHeaders,
        };
      }
      case 'telnyx.balance':
        return {
          url: `${this.baseUrl}/v2/balance`,
          method: 'GET',
          headers: baseHeaders,
        };
      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;
    const data = (body.data as Record<string, unknown>) ?? {};

    switch (req.toolId) {
      case 'telnyx.send_sms': {
        const errors = data.errors as Array<Record<string, unknown>> | undefined;
        const fromObj = (data.from as Record<string, unknown>) ?? {};
        const toArr = (data.to as Array<Record<string, unknown>>) ?? [];
        return {
          message_id: data.id,
          direction: data.direction,
          type: data.type,
          from: fromObj.phone_number,
          to: toArr.map((t) => ({ phone_number: t.phone_number, status: t.status })),
          text: data.text,
          parts: data.parts,
          sent_at: data.sent_at,
          created_at: data.created_at,
          cost: data.cost ?? null,
          errors: errors && errors.length > 0 ? errors : null,
        };
      }
      case 'telnyx.message_status': {
        const errors = data.errors as Array<Record<string, unknown>> | undefined;
        const toArr = (data.to as Array<Record<string, unknown>>) ?? [];
        return {
          message_id: data.id,
          direction: data.direction,
          status_per_recipient: toArr.map((t) => ({
            phone_number: t.phone_number,
            status: t.status,
          })),
          sent_at: data.sent_at,
          completed_at: data.completed_at,
          parts: data.parts,
          cost: data.cost ?? null,
          errors: errors && errors.length > 0 ? errors : null,
        };
      }
      case 'telnyx.list_messages': {
        // Telnyx Detail Records (MDR) — flat string fields, not nested objects
        const items = (body.data as Array<Record<string, unknown>>) ?? [];
        const meta = (body.meta as Record<string, unknown>) ?? {};
        return {
          messages: items.map((m) => ({
            message_id: m.id,
            direction: m.direction,
            status: m.status,
            from: m.from,
            to: m.to,
            message_type: m.message_type,
            parts: m.parts,
            rate: m.rate,
            currency: m.currency,
            created_at: m.created_at,
            sent_at: m.sent_at,
            completed_at: m.completed_at,
            country_code: m.country_code,
          })),
          total: meta.total_results ?? items.length,
          page: meta.page_number ?? 1,
        };
      }
      case 'telnyx.balance':
        return {
          balance: data.balance,
          available_credit: data.available_credit,
          currency: data.currency,
          pending: data.pending,
          frozen: data.frozen,
          credit_limit: data.credit_limit,
        };
      default:
        return body;
    }
  }
}
