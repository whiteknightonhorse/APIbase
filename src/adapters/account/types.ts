/**
 * Account adapter response types (F4: Usage Analytics API).
 */

export interface UsageStats {
  period: string;
  total_calls: number;
  total_cost_usd: number;
  cache_hits: number;
  cache_hit_rate: number;
  avg_latency_ms: number | null;
  unique_tools: number;
}

export interface ToolUsageEntry {
  tool_id: string;
  total_calls: number;
  total_cost_usd: number;
  cache_hits: number;
  avg_latency_ms: number | null;
  last_used: string;
}

export interface TimeseriesPoint {
  bucket: string;
  calls: number;
  cost_usd: number;
  cache_hits: number;
  avg_latency_ms: number | null;
}
