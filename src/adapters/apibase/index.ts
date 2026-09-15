import { BaseAdapter } from '../base.adapter';
import { type ProviderRequest, type ProviderRawResponse } from '../../types/provider';
import { discover, type DiscoverResponse } from '../../services/discovery.service';
import { logger } from '../../config/logger';

/**
 * `apibase` adapter — internal, no external HTTP calls (ZZ-03-05, 03-SPECIFICATION.md P-1/M-1).
 *
 * Same shape as `PlatformAdapter` (src/adapters/platform/index.ts): overrides `call()` directly
 * instead of using buildRequest/parseResponse, because there is no upstream HTTP round trip.
 * A separate provider from `platform` on purpose — `apibase.discover` is the ONE MCP-tool-facing
 * discovery contract (zz-03 Q1 ruling-1), not another platform-introspection tool alongside
 * `platform.tool_quality`/`platform.tool_rankings`.
 *
 * Runs through the same 13-stage pipeline as every other tool (registered generically by
 * src/mcp/tool-adapter.ts from TOOL_DEFINITIONS) — this is what makes each call produce exactly
 * one `execution_ledger` row at `price_usd: 0` (acceptance criterion e), instead of a
 * pipeline-bypassing special case.
 */
export class ApibaseAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'apibase', baseUrl: 'internal://' });
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
    let data: DiscoverResponse;

    switch (req.toolId) {
      case 'apibase.discover':
        data = await discover({
          intent: params.intent as string | undefined,
          category: params.category as string | undefined,
          max_price_usd: params.max_price_usd as number | undefined,
          limit: params.limit as number | undefined,
          include_unavailable: params.include_unavailable as boolean | undefined,
        });
        break;
      default:
        throw {
          code: 'provider_invalid_response',
          httpStatus: 502,
          message: `Unsupported tool: ${req.toolId}`,
          provider: 'apibase',
          toolId: req.toolId,
          durationMs: 0,
        };
    }

    const durationMs = Math.round(performance.now() - start);
    logger.info(
      { tool_id: req.toolId, duration_ms: durationMs, total_matches: data.total_matches },
      'Discovery query completed',
    );

    return {
      status: 200,
      headers: {},
      body: data,
      durationMs,
      byteLength: JSON.stringify(data).length,
    };
  }
}
