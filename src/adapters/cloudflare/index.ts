import { BaseAdapter } from '../base.adapter';
import type { ProviderRequest, ProviderRawResponse } from '../../types/provider';

export class CloudflareAdapter extends BaseAdapter {
  private readonly apiKey: string;
  private readonly email: string;

  constructor(apiKey: string, email: string) {
    super({ timeout: 10_000, maxRetries: 2, maxResponseSize: 512_000 });
    this.apiKey = apiKey;
    this.email = email;
  }

  private authHeaders(): Record<string, string> {
    return {
      'X-Auth-Email': this.email,
      'X-Auth-Key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;
    const base = 'https://api.cloudflare.com/client/v4';

    switch (req.toolId) {
      case 'cloudflare.zones_list': {
        const qs = new URLSearchParams();
        if (params.name) qs.set('name', String(params.name));
        if (params.status) qs.set('status', String(params.status));
        qs.set('per_page', String(params.limit ?? 20));
        return { url: `${base}/zones?${qs}`, method: 'GET', headers: this.authHeaders() };
      }

      case 'cloudflare.dns_list': {
        const zoneId = String(params.zone_id ?? '');
        const qs = new URLSearchParams();
        if (params.type) qs.set('type', String(params.type));
        if (params.name) qs.set('name', String(params.name));
        qs.set('per_page', String(params.limit ?? 50));
        return { url: `${base}/zones/${zoneId}/dns_records?${qs}`, method: 'GET', headers: this.authHeaders() };
      }

      case 'cloudflare.dns_create': {
        const zoneId = String(params.zone_id ?? '');
        const payload = {
          type: params.type,
          name: params.name,
          content: params.content,
          ttl: params.ttl ?? 1,
          proxied: params.proxied ?? false,
          priority: params.priority,
        };
        return { url: `${base}/zones/${zoneId}/dns_records`, method: 'POST', headers: this.authHeaders(), body: JSON.stringify(payload) };
      }

      case 'cloudflare.dns_delete': {
        const zoneId = String(params.zone_id ?? '');
        const recordId = String(params.record_id ?? '');
        return { url: `${base}/zones/${zoneId}/dns_records/${recordId}`, method: 'DELETE', headers: this.authHeaders() };
      }

      case 'cloudflare.zone_analytics': {
        const zoneId = String(params.zone_id ?? '');
        const since = params.since ?? -1440;
        return { url: `${base}/zones/${zoneId}/analytics/dashboard?since=${since}&continuous=true`, method: 'GET', headers: this.authHeaders() };
      }

      case 'cloudflare.purge_cache': {
        const zoneId = String(params.zone_id ?? '');
        const payload: Record<string, unknown> = {};
        if (params.purge_everything) payload.purge_everything = true;
        else if (params.files) payload.files = params.files;
        return { url: `${base}/zones/${zoneId}/purge_cache`, method: 'POST', headers: this.authHeaders(), body: JSON.stringify(payload) };
      }

      default:
        throw new Error(`Unknown tool: ${req.toolId}`);
    }
  }

  parseResponse(raw: ProviderRawResponse, req: ProviderRequest): ProviderRawResponse {
    const body = typeof raw.body === 'string' ? JSON.parse(raw.body) : raw.body;

    if (!body?.success) {
      const err = body?.errors?.[0];
      return { ...raw, status: 502, body: { error: err?.message ?? 'Cloudflare request failed', code: err?.code } };
    }

    if (req.toolId === 'cloudflare.zones_list') {
      const zones = (body.result ?? []).map((z: Record<string, unknown>) => ({
        id: z.id, name: z.name, status: z.status, plan: (z.plan as Record<string, unknown>)?.name,
        name_servers: z.name_servers, created_on: z.created_on,
      }));
      return { ...raw, body: { zones, count: zones.length, total: body.result_info?.total_count } };
    }

    if (req.toolId === 'cloudflare.dns_list') {
      const records = (body.result ?? []).map((r: Record<string, unknown>) => ({
        id: r.id, type: r.type, name: r.name, content: r.content,
        ttl: r.ttl, proxied: r.proxied, created_on: r.created_on,
      }));
      return { ...raw, body: { records, count: records.length, total: body.result_info?.total_count } };
    }

    if (req.toolId === 'cloudflare.dns_create') {
      const r = body.result ?? {};
      return { ...raw, body: { success: true, record_id: r.id, type: r.type, name: r.name, content: r.content, proxied: r.proxied } };
    }

    if (req.toolId === 'cloudflare.dns_delete') {
      return { ...raw, body: { success: true, deleted_id: body.result?.id } };
    }

    if (req.toolId === 'cloudflare.zone_analytics') {
      const totals = body.result?.totals ?? {};
      const requests = totals.requests ?? {};
      const bandwidth = totals.bandwidth ?? {};
      const threats = totals.threats ?? {};
      return {
        ...raw, body: {
          requests_total: requests.all, requests_cached: requests.cached, requests_uncached: requests.uncached,
          bandwidth_total: bandwidth.all, bandwidth_cached: bandwidth.cached,
          threats_total: threats.all, pageviews_total: totals.pageviews?.all,
        },
      };
    }

    if (req.toolId === 'cloudflare.purge_cache') {
      return { ...raw, body: { success: true, purge_id: body.result?.id } };
    }

    return raw;
  }
}
