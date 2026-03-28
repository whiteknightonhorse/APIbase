import { BaseAdapter } from '../base.adapter';
import { type ProviderRequest, type ProviderRawResponse } from '../../types/provider';
import { getPrisma } from '../../services/prisma.service';
import { logger } from '../../config/logger';
import type { UsageStats, ToolUsageEntry, TimeseriesPoint } from './types';

/**
 * Account adapter (F4: Usage Analytics API).
 *
 * Internal adapter — queries execution_ledger for the authenticated agent.
 * No external HTTP calls. Overrides call() to query DB directly.
 * Agent sees ONLY their own data (agentId from AUTH stage, never from body).
 */
export class AccountAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'account', baseUrl: 'internal://' });
  }

  protected buildRequest(): { url: string; method: string; headers: Record<string, string> } {
    // Not used — call() is overridden
    return { url: '', method: 'GET', headers: {} };
  }

  protected parseResponse(raw: ProviderRawResponse): unknown {
    return raw.body;
  }

  async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    const start = performance.now();
    const agentId = req.agentId;

    if (!agentId) {
      throw {
        code: 'provider_invalid_response',
        httpStatus: 401,
        message: 'Agent authentication required for account tools',
        provider: 'account',
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    const params = req.params as Record<string, unknown>;
    let data: unknown;

    switch (req.toolId) {
      case 'account.usage':
        data = await this.getUsage(agentId, params);
        break;
      case 'account.tools':
        data = await this.getTools(agentId, params);
        break;
      case 'account.timeseries':
        data = await this.getTimeseries(agentId, params);
        break;
      default:
        throw {
          code: 'provider_invalid_response',
          httpStatus: 502,
          message: `Unsupported tool: ${req.toolId}`,
          provider: 'account',
          toolId: req.toolId,
          durationMs: 0,
        };
    }

    const durationMs = Math.round(performance.now() - start);
    logger.info({ tool_id: req.toolId, agent_id: agentId, duration_ms: durationMs }, 'Account query completed');

    return {
      status: 200,
      headers: {},
      body: data,
      durationMs,
      byteLength: JSON.stringify(data).length,
    };
  }

  private periodToInterval(period: string): string {
    switch (period) {
      case '1d': return '1 day';
      case '7d': return '7 days';
      case '30d': return '30 days';
      default: return '7 days';
    }
  }

  private async getUsage(agentId: string, params: Record<string, unknown>): Promise<UsageStats> {
    const period = (params.period as string) || '7d';
    const interval = this.periodToInterval(period);
    const db = getPrisma();

    const rows: Array<{
      total_calls: bigint;
      total_cost: { toNumber(): number } | null;
      cache_hits: bigint;
      avg_latency: number | null;
      unique_tools: bigint;
    }> = await db.$queryRawUnsafe(`
      SELECT
        COUNT(*) AS total_calls,
        SUM(cost_usd) AS total_cost,
        COUNT(*) FILTER (WHERE cache_status = 'HIT') AS cache_hits,
        AVG(provider_latency_ms) FILTER (WHERE provider_called = true) AS avg_latency,
        COUNT(DISTINCT tool_id) AS unique_tools
      FROM execution_ledger
      WHERE agent_id = $1::uuid
        AND created_at >= NOW() - $2::interval
    `, agentId, interval);

    const row = rows[0];
    const totalCalls = Number(row?.total_calls || 0);
    const cacheHits = Number(row?.cache_hits || 0);

    return {
      period,
      total_calls: totalCalls,
      total_cost_usd: row?.total_cost ? row.total_cost.toNumber() : 0,
      cache_hits: cacheHits,
      cache_hit_rate: totalCalls > 0 ? Math.round((cacheHits / totalCalls) * 10000) / 10000 : 0,
      avg_latency_ms: row?.avg_latency ? Math.round(row.avg_latency) : null,
      unique_tools: Number(row?.unique_tools || 0),
    };
  }

  private async getTools(agentId: string, params: Record<string, unknown>): Promise<ToolUsageEntry[]> {
    const sort = (params.sort as string) || 'calls';
    const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 100);
    const db = getPrisma();

    let orderBy: string;
    switch (sort) {
      case 'cost': orderBy = 'total_cost DESC NULLS LAST'; break;
      case 'latency': orderBy = 'avg_latency DESC NULLS LAST'; break;
      default: orderBy = 'total_calls DESC'; break;
    }

    const rows: Array<{
      tool_id: string;
      total_calls: bigint;
      total_cost: { toNumber(): number } | null;
      cache_hits: bigint;
      avg_latency: number | null;
      last_used: Date;
    }> = await db.$queryRawUnsafe(`
      SELECT
        tool_id,
        COUNT(*) AS total_calls,
        SUM(cost_usd) AS total_cost,
        COUNT(*) FILTER (WHERE cache_status = 'HIT') AS cache_hits,
        AVG(provider_latency_ms) FILTER (WHERE provider_called = true) AS avg_latency,
        MAX(created_at) AS last_used
      FROM execution_ledger
      WHERE agent_id = $1::uuid
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY tool_id
      ORDER BY ${orderBy}
      LIMIT $2
    `, agentId, limit);

    return rows.map((r) => ({
      tool_id: r.tool_id,
      total_calls: Number(r.total_calls),
      total_cost_usd: r.total_cost ? r.total_cost.toNumber() : 0,
      cache_hits: Number(r.cache_hits),
      avg_latency_ms: r.avg_latency ? Math.round(r.avg_latency) : null,
      last_used: r.last_used.toISOString(),
    }));
  }

  private async getTimeseries(agentId: string, params: Record<string, unknown>): Promise<TimeseriesPoint[]> {
    const period = (params.period as string) || '7d';
    const granularity = (params.granularity as string) || 'day';
    const interval = this.periodToInterval(period);
    const trunc = granularity === 'hour' ? 'hour' : 'day';
    const db = getPrisma();

    const rows: Array<{
      bucket: Date;
      calls: bigint;
      cost: { toNumber(): number } | null;
      cache_hits: bigint;
      avg_latency: number | null;
    }> = await db.$queryRawUnsafe(`
      SELECT
        date_trunc('${trunc}', created_at) AS bucket,
        COUNT(*) AS calls,
        SUM(cost_usd) AS cost,
        COUNT(*) FILTER (WHERE cache_status = 'HIT') AS cache_hits,
        AVG(provider_latency_ms) FILTER (WHERE provider_called = true) AS avg_latency
      FROM execution_ledger
      WHERE agent_id = $1::uuid
        AND created_at >= NOW() - $2::interval
      GROUP BY bucket
      ORDER BY bucket ASC
    `, agentId, interval);

    return rows.map((r) => ({
      bucket: r.bucket.toISOString(),
      calls: Number(r.calls),
      cost_usd: r.cost ? r.cost.toNumber() : 0,
      cache_hits: Number(r.cache_hits),
      avg_latency_ms: r.avg_latency ? Math.round(r.avg_latency) : null,
    }));
  }
}
