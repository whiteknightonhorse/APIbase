import { BaseAdapter } from '../base.adapter';
import type { ProviderRequest, ProviderRawResponse } from '../../types/provider';

export class BrowserbaseAdapter extends BaseAdapter {
  private readonly apiKey: string;
  private readonly projectId: string;

  constructor(apiKey: string, projectId: string) {
    super({ timeout: 30_000, maxRetries: 1, maxResponseSize: 1_048_576 });
    this.apiKey = apiKey;
    this.projectId = projectId;
  }

  private headers(): Record<string, string> {
    return { 'x-bb-api-key': this.apiKey, 'Content-Type': 'application/json' };
  }

  buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;
    const base = 'https://www.browserbase.com/v1';

    switch (req.toolId) {
      case 'browser.create_session': {
        const payload: Record<string, unknown> = { projectId: this.projectId };
        if (params.proxy) payload.proxies = true;
        if (params.region) payload.region = params.region;
        return { url: `${base}/sessions`, method: 'POST', headers: this.headers(), body: JSON.stringify(payload) };
      }

      case 'browser.session_status': {
        const sessionId = String(params.session_id ?? '');
        return { url: `${base}/sessions/${sessionId}`, method: 'GET', headers: this.headers() };
      }

      case 'browser.session_content': {
        const sessionId = String(params.session_id ?? '');
        return { url: `${base}/sessions/${sessionId}/downloads`, method: 'GET', headers: this.headers() };
      }

      case 'browser.list_sessions': {
        return { url: `${base}/sessions?status=${params.status ?? 'RUNNING'}`, method: 'GET', headers: this.headers() };
      }

      default:
        throw new Error(`Unknown tool: ${req.toolId}`);
    }
  }

  parseResponse(raw: ProviderRawResponse, req: ProviderRequest): ProviderRawResponse {
    const body = typeof raw.body === 'string' ? JSON.parse(raw.body) : raw.body;

    if (body?.error) {
      return { ...raw, status: 502, body: { error: body.error?.message ?? body.error ?? 'Browserbase request failed' } };
    }

    if (req.toolId === 'browser.create_session') {
      return {
        ...raw,
        body: {
          session_id: body.id,
          status: body.status,
          region: body.region,
          started_at: body.startedAt,
          expires_at: body.expiresAt,
          connect_url: `wss://connect.browserbase.com?apiKey=${this.apiKey}&sessionId=${body.id}`,
          message: 'Session created. Use session_id with Puppeteer/Playwright to control the browser, or check status with browser.session_status.',
        },
      };
    }

    if (req.toolId === 'browser.session_status') {
      return {
        ...raw,
        body: {
          session_id: body.id,
          status: body.status,
          region: body.region,
          started_at: body.startedAt,
          ended_at: body.endedAt,
          expires_at: body.expiresAt,
          proxy_bytes: body.proxyBytes,
          avg_cpu: body.avg_cpu_usage,
          memory: body.memory_usage,
        },
      };
    }

    if (req.toolId === 'browser.list_sessions') {
      const sessions = (Array.isArray(body) ? body : []).map((s: Record<string, unknown>) => ({
        session_id: s.id,
        status: s.status,
        region: s.region,
        started_at: s.startedAt,
        expires_at: s.expiresAt,
      }));
      return { ...raw, body: { sessions, count: sessions.length } };
    }

    return raw;
  }
}
