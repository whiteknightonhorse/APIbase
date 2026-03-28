import { BaseAdapter } from '../base.adapter';
import { type ProviderRequest, type ProviderRawResponse } from '../../types/provider';
import { ensureRedisConnected } from '../../services/redis.service';
import { runBatch, type BatchOptions } from '../../services/batch.service';
import { logger } from '../../config/logger';
import type { ToolQualityData, ToolRankingEntry, BatchCallInput } from './types';

const QUALITY_KEY_PREFIX = 'tool:quality:';

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

  private async getToolQuality(params: Record<string, unknown>): Promise<ToolQualityData | { error: string }> {
    const toolId = params.tool_id as string;
    if (!toolId) {
      return { error: 'tool_id is required' };
    }

    const redis = await ensureRedisConnected();
    const raw = await redis.get(`${QUALITY_KEY_PREFIX}${toolId}`);

    if (!raw) {
      return {
        tool_id: toolId,
        uptime_pct: 0,
        p50_ms: null,
        p95_ms: null,
        error_rate: 0,
        total_calls: 0,
        success_calls: 0,
        last_updated: '',
      };
    }

    return JSON.parse(raw) as ToolQualityData;
  }

  private async getToolRankings(params: Record<string, unknown>): Promise<ToolRankingEntry[]> {
    const sort = (params.sort as string) || 'uptime';
    const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 100);
    const category = params.category as string | undefined;

    const redis = await ensureRedisConnected();
    const keys = await redis.keys(`${QUALITY_KEY_PREFIX}*`);

    if (keys.length === 0) {
      return [];
    }

    const pipeline = redis.pipeline();
    for (const key of keys) {
      pipeline.get(key);
    }
    const results = await pipeline.exec();

    const entries: ToolRankingEntry[] = [];
    if (results) {
      for (let i = 0; i < results.length; i++) {
        const [redisErr, val] = results[i];
        if (redisErr || !val) continue;

        const quality = JSON.parse(val as string) as ToolQualityData;

        // Filter by category prefix if specified
        if (category && !quality.tool_id.startsWith(category + '.')) continue;

        entries.push({
          tool_id: quality.tool_id,
          uptime_pct: quality.uptime_pct,
          p50_ms: quality.p50_ms,
          p95_ms: quality.p95_ms,
          error_rate: quality.error_rate,
          total_calls: quality.total_calls,
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
