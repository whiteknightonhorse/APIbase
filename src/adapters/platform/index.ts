import { BaseAdapter } from '../base.adapter';
import { type ProviderRequest, type ProviderRawResponse } from '../../types/provider';
import { ensureRedisConnected } from '../../services/redis.service';
import { runBatch, type BatchOptions } from '../../services/batch.service';
import { buildToolQuality } from '../../services/tool-quality.service';
import { TOOL_DEFINITIONS } from '../../mcp/tool-definitions';
import { logger } from '../../config/logger';
import type { ToolQualityResponse, ToolRankingEntry, BatchCallInput } from './types';

// Candidate tool_ids for platform.tool_rankings — the full active catalog,
// deduped (TOOL_DEFINITIONS is pure data, no side-effect imports, safe here).
// Paged through buildToolQuality below: one MGET per page, never
// `redis.keys()` (T-2: forbidden pattern on the shared prod instance).
const ALL_TOOL_IDS: string[] = Array.from(new Set(TOOL_DEFINITIONS.map((def) => def.toolId)));
const RANKINGS_PAGE_SIZE = 500;

/**
 * Platform adapter (F5: Tool Quality Index + F1: Batch API).
 *
 * Internal adapter — reads Redis quality data and orchestrates batch calls.
 * No external HTTP calls. Overrides call() to handle logic directly.
 */
export class PlatformAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'platform', baseUrl: 'internal://' });
  }

  protected buildRequest(): { url: string; method: string; headers: Record<string, string> } {
    return { url: '', method: 'GET', headers: {} };
  }

  protected parseResponse(raw: ProviderRawResponse): unknown {
    return raw.body;
  }

  async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    const start = performance.now();
    const params = req.params as Record<string, unknown>;
    let data: unknown;

    switch (req.toolId) {
      case 'platform.tool_quality':
        data = await this.getToolQuality(params);
        break;
      case 'platform.tool_rankings':
        data = await this.getToolRankings(params);
        break;
      case 'platform.call_batch':
        data = await this.executeBatch(req, params);
        break;
      default:
        throw {
          code: 'provider_invalid_response',
          httpStatus: 502,
          message: `Unsupported tool: ${req.toolId}`,
          provider: 'platform',
          toolId: req.toolId,
          durationMs: 0,
        };
    }

    const durationMs = Math.round(performance.now() - start);
    logger.info({ tool_id: req.toolId, duration_ms: durationMs }, 'Platform query completed');

    return {
      status: 200,
      headers: {},
      body: data,
      durationMs,
      byteLength: JSON.stringify(data).length,
    };
  }

  private async getToolQuality(
    params: Record<string, unknown>,
  ): Promise<ToolQualityResponse | { error: string }> {
    const toolId = params.tool_id as string;
    if (!toolId) {
      return { error: 'tool_id is required' };
    }

    const redis = await ensureRedisConnected();
    const quality = await buildToolQuality(redis, [toolId]);

    // `tool: null` means no measurement at all — never a fabricated 0 (T-2).
    return { tool_id: toolId, tool: quality[toolId] };
  }

  private async getToolRankings(params: Record<string, unknown>): Promise<ToolRankingEntry[]> {
    const sort = (params.sort as string) || 'uptime';
    const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 100);
    const category = params.category as string | undefined;

    const candidateIds = category
      ? ALL_TOOL_IDS.filter((id) => id.startsWith(`${category}.`))
      : ALL_TOOL_IDS;

    if (candidateIds.length === 0) {
      return [];
    }

    const redis = await ensureRedisConnected();
    const entries: ToolRankingEntry[] = [];

    for (let i = 0; i < candidateIds.length; i += RANKINGS_PAGE_SIZE) {
      const page = candidateIds.slice(i, i + RANKINGS_PAGE_SIZE);
      const quality = await buildToolQuality(redis, page);

      for (const toolId of page) {
        const q = quality[toolId];
        // No measurement, or not enough calls yet to trust a rate/percentile
        // (buildToolQuality nulls those below QUALITY_MIN_CALLS) — neither
        // can be meaningfully ranked, so skip rather than show a fabricated
        // number.
        if (!q || q.success_rate === null) continue;

        entries.push({
          tool_id: toolId,
          uptime_pct: q.success_rate,
          p50_ms: q.p50_ms,
          p95_ms: q.p95_ms,
          error_rate: Math.round((100 - q.success_rate) * 100) / 100,
          total_calls: q.calls,
        });
      }
    }

    // Sort
    switch (sort) {
      case 'latency':
        entries.sort((a, b) => (a.p50_ms ?? Infinity) - (b.p50_ms ?? Infinity));
        break;
      case 'error_rate':
        entries.sort((a, b) => a.error_rate - b.error_rate);
        break;
      default: // uptime
        entries.sort((a, b) => b.uptime_pct - a.uptime_pct);
        break;
    }

    return entries.slice(0, limit);
  }

  private async executeBatch(req: ProviderRequest, params: Record<string, unknown>) {
    const calls = params.calls as BatchCallInput[];
    const maxParallel = Math.min(Math.max(Number(params.max_parallel) || 10, 1), 10);

    if (!calls || !Array.isArray(calls) || calls.length === 0) {
      throw {
        code: 'provider_invalid_response',
        httpStatus: 400,
        message: 'calls array is required and must not be empty',
        provider: 'platform',
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    const opts: BatchOptions = {
      agentId: req.agentId,
      parentRequestId: req.requestId,
      calls,
      maxParallel,
    };
    return runBatch(opts);
  }
}
