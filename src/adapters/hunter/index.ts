import { BaseAdapter } from '../base.adapter';
import type { ProviderRequest, ProviderRawResponse } from '../../types/provider';

export class HunterAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ timeout: 10_000, maxRetries: 2, maxResponseSize: 512_000 });
    this.apiKey = apiKey;
  }

  buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;

    switch (req.toolId) {
      case 'hunter.company': {
        const qs = new URLSearchParams();
        qs.set('domain', String(params.domain ?? ''));
        qs.set('api_key', this.apiKey);
        if (params.limit) qs.set('limit', String(params.limit));
        if (params.department) qs.set('department', String(params.department));
        if (params.type) qs.set('type', String(params.type));
        return {
          url: `https://api.hunter.io/v2/domain-search?${qs.toString()}`,
          method: 'GET',
          headers: {},
        };
      }

      default:
        throw new Error(`Unknown tool: ${req.toolId}`);
    }
  }

  parseResponse(raw: ProviderRawResponse, _req: ProviderRequest): ProviderRawResponse {
    const body =
      typeof raw.body === 'string' ? JSON.parse(raw.body) : raw.body;

    if (body?.errors || !body?.data) {
      return {
        ...raw,
        status: raw.status >= 200 && raw.status < 300 ? 502 : raw.status,
        body: { error: body?.errors?.[0]?.details ?? 'Hunter.io request failed' },
      };
    }

    const d = body.data;
    const meta = body.meta ?? {};

    return {
      ...raw,
      body: {
        domain: d.domain,
        organization: d.organization,
        disposable: d.disposable,
        webmail: d.webmail,
        accept_all: d.accept_all,
        pattern: d.pattern,
        emails: (d.emails ?? []).map((e: Record<string, unknown>) => ({
          email: e.value,
          type: e.type,
          confidence: e.confidence,
          first_name: e.first_name,
          last_name: e.last_name,
          position: e.position,
          department: e.department,
          seniority: e.seniority,
          linkedin: e.linkedin,
          phone: e.phone_number,
          verified: (e.verification as Record<string, unknown>)?.status ?? null,
        })),
        total_emails: meta.results ?? d.emails?.length ?? 0,
        credits_used: meta.params?.limit ?? null,
      },
    };
  }
}
