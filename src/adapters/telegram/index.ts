import { BaseAdapter } from '../base.adapter';
import type { ProviderRequest, ProviderRawResponse } from '../../types/provider';

export class TelegramAdapter extends BaseAdapter {
  private readonly token: string;

  constructor(token: string) {
    super({ timeout: 10_000, maxRetries: 1, maxResponseSize: 512_000 });
    this.token = token;
  }

  private baseUrl(): string {
    return `https://api.telegram.org/bot${this.token}`;
  }

  buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;
    const headers = { 'Content-Type': 'application/json' };

    switch (req.toolId) {
      case 'telegram.send_message': {
        const payload: Record<string, unknown> = {
          chat_id: params.chat_id,
          text: params.text,
        };
        if (params.parse_mode) payload.parse_mode = params.parse_mode;
        if (params.disable_notification) payload.disable_notification = true;
        return { url: `${this.baseUrl()}/sendMessage`, method: 'POST', headers, body: JSON.stringify(payload) };
      }

      case 'telegram.send_photo': {
        const payload: Record<string, unknown> = {
          chat_id: params.chat_id,
          photo: params.photo,
        };
        if (params.caption) payload.caption = params.caption;
        return { url: `${this.baseUrl()}/sendPhoto`, method: 'POST', headers, body: JSON.stringify(payload) };
      }

      case 'telegram.send_document': {
        const payload: Record<string, unknown> = {
          chat_id: params.chat_id,
          document: params.document,
        };
        if (params.caption) payload.caption = params.caption;
        return { url: `${this.baseUrl()}/sendDocument`, method: 'POST', headers, body: JSON.stringify(payload) };
      }

      case 'telegram.get_updates': {
        const qs = new URLSearchParams();
        qs.set('limit', String(params.limit ?? 10));
        if (params.offset) qs.set('offset', String(params.offset));
        return { url: `${this.baseUrl()}/getUpdates?${qs}`, method: 'GET', headers: {} };
      }

      case 'telegram.get_chat': {
        return {
          url: `${this.baseUrl()}/getChat`,
          method: 'POST',
          headers,
          body: JSON.stringify({ chat_id: params.chat_id }),
        };
      }

      default:
        throw new Error(`Unknown tool: ${req.toolId}`);
    }
  }

  parseResponse(raw: ProviderRawResponse, req: ProviderRequest): ProviderRawResponse {
    const body = typeof raw.body === 'string' ? JSON.parse(raw.body) : raw.body;

    if (!body?.ok) {
      return { ...raw, status: 502, body: { error: body?.description ?? 'Telegram API error', code: body?.error_code } };
    }

    if (req.toolId === 'telegram.send_message' || req.toolId === 'telegram.send_photo' || req.toolId === 'telegram.send_document') {
      const msg = body.result;
      return {
        ...raw,
        body: {
          success: true,
          message_id: msg.message_id,
          chat_id: msg.chat?.id,
          chat_type: msg.chat?.type,
          date: msg.date,
          text: msg.text ?? msg.caption ?? null,
        },
      };
    }

    if (req.toolId === 'telegram.get_updates') {
      const updates = (body.result ?? []).map((u: Record<string, unknown>) => {
        const msg = u.message as Record<string, unknown> | undefined;
        const from = msg?.from as Record<string, unknown> | undefined;
        const chat = msg?.chat as Record<string, unknown> | undefined;
        return {
          update_id: u.update_id,
          from_user: from ? `${from.first_name ?? ''} ${from.last_name ?? ''}`.trim() : null,
          from_username: from?.username ?? null,
          chat_id: chat?.id,
          chat_type: chat?.type,
          text: msg?.text ?? null,
          date: msg?.date,
        };
      });
      return { ...raw, body: { updates, count: updates.length } };
    }

    if (req.toolId === 'telegram.get_chat') {
      const c = body.result;
      return {
        ...raw,
        body: {
          id: c.id,
          type: c.type,
          title: c.title ?? null,
          username: c.username ?? null,
          first_name: c.first_name ?? null,
          description: c.description ?? null,
          member_count: c.member_count ?? null,
          invite_link: c.invite_link ?? null,
        },
      };
    }

    return raw;
  }
}
