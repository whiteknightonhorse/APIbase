/**
 * Platform adapter response types (F5: Tool Quality + F1: Batch).
 */

import type { ToolQualityResult } from '../../services/tool-quality.service';

/** `platform.tool_quality` response — `tool` is `null` when the tool has no
 *  measurement at all (T-2/Q-1: never a fabricated 0). See
 *  `services/tool-quality.service.ts` for what "no measurement" vs.
 *  "not enough calls yet" mean. */
export interface ToolQualityResponse {
  tool_id: string;
  tool: ToolQualityResult | null;
}

export interface ToolRankingEntry {
  tool_id: string;
  uptime_pct: number;
  p50_ms: number | null;
  p95_ms: number | null;
  error_rate: number;
  total_calls: number;
}

export interface BatchCallInput {
  tool_id: string;
  params: unknown;
  idempotency_key?: string;
}

export interface BatchCallResult {
  tool_id: string;
  status: 'success' | 'error';
  data?: unknown;
  error?: string;
  cost_usd: number;
  duration_ms: number;
}

export interface BatchResponse {
  results: BatchCallResult[];
  total_cost_usd: number;
  total_duration_ms: number;
}
