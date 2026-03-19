import { BaseAdapter } from '../base.adapter';
import { type ProviderRequest, type ProviderRawResponse, ProviderErrorCode } from '../../types/provider';

/**
 * Resend email adapter (UC-076).
 * Auth: Bearer token. Free: 3K emails/month.
 */
export class ResendAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ provider: 'resend', baseUrl: 'https://api.resend.com' });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    switch (req.toolId) {
      case 'resend.send_email': {
        const body: Record<string, unknown> = {
          from: p.from ?? 'APIbase <noreply@apibase.pro>',
          to: Array.isArray(p.to) ? p.to : [String(p.to)],
          subject: p.subject,
        };
        if (p.text) body.text = p.text;
        if (p.html) body.html = p.html;
        if (p.reply_to) body.reply_to = p.reply_to;
        return { url: `${this.baseUrl}/emails`, method: 'POST', headers: h, body: JSON.stringify(body) };
      }
      case 'resend.email_status': {
        return { url: `${this.baseUrl}/emails/${String(p.email_id)}`, method: 'GET', headers: h };
      }
      default:
        throw { code: ProviderErrorCode.INVALID_RESPONSE, httpStatus: 502, message: `Unsupported: ${req.toolId}`, provider: this.provider, toolId: req.toolId, durationMs: 0 };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;
    if (req.toolId === 'resend.send_email') {
      return { email_id: body.id, status: 'sent' };
    }
    // email_status
    return { id: body.id, from: body.from, to: body.to, subject: body.subject, created_at: body.created_at, last_event: body.last_event };
  }
}
