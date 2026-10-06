import type { HealthCheckResult } from './health.service';

/** Shown when /health/ready cannot be evaluated; nginx SSI uses the same text as its stub. */
export const STATUS_LINE_FALLBACK = 'status: see /health/ready';
export const STATUS_LINE_TTL_MS = 10_000;

type Readiness = () => Promise<HealthCheckResult>;

let cached: { at: number; line: string } | null = null;

/** One-line homepage status rendered from the readiness check, cached for 10 s. */
export async function getStatusLine(
  readiness?: Readiness,
  now: number = Date.now(),
): Promise<string> {
  if (cached && now - cached.at < STATUS_LINE_TTL_MS) return cached.line;
  let line: string;
  try {
    // Lazy: health.service pulls in config (env validation), which unit tests do not carry.
    const check = readiness ?? (await import('./health.service')).getReadiness;
    line = (await check()).status === 'ready' ? 'status: ready' : 'status: degraded';
  } catch {
    line = STATUS_LINE_FALLBACK;
  }
  cached = { at: now, line };
  return line;
}

export function resetStatusLineCache(): void {
  cached = null;
}
