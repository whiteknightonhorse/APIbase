/**
 * T-0425: per-audio-minute pricing for transcribe.submit (AssemblyAI).
 *
 * Mechanism: the request DECLARES `duration_seconds` (required, <= 4 h). The charge is computed
 * from the declaration before the upstream call (x402/MPP pay first), and the adapter cuts the
 * job at the declared duration (AssemblyAI `audio_end_at`), so the real upstream cost can never
 * exceed what was paid. No media probing is done: the audio URL is untrusted and a HEAD/Range
 * read cannot give a duration for every container.
 *
 * price = max($0.01, ceil(duration_minutes) x $0.005), rounded UP to a whole cent.
 */

/** Tools priced per audio minute, keyed by tool_id. */
export const PER_AUDIO_MINUTE_TOOLS: ReadonlySet<string> = new Set(['transcribe.submit']);

/** Upper bound of upstream cost: Universal-3.5 Pro, $0.21 per hour. */
export const UPSTREAM_USD_PER_MINUTE_MAX = 0.0035;
/** Our rate: >= 1.3 x UPSTREAM_USD_PER_MINUTE_MAX (0.00455). */
export const RATE_MICRO_USD_PER_MINUTE = 5000;
export const MIN_PRICE_USD = 0.01;
export const MAX_DURATION_SECONDS = 4 * 3600;

const MICRO_PER_CENT = 10_000;

/** Billable price in USD for a declared duration; undefined when the value is not billable. */
export function audioMinutePriceUsd(durationSeconds: unknown): number | undefined {
  if (typeof durationSeconds !== 'number' || !Number.isInteger(durationSeconds)) return undefined;
  if (durationSeconds < 1 || durationSeconds > MAX_DURATION_SECONDS) return undefined;
  const minutes = Math.ceil(durationSeconds / 60);
  const cents = Math.ceil((minutes * RATE_MICRO_USD_PER_MINUTE) / MICRO_PER_CENT);
  return Math.max(MIN_PRICE_USD * 100, cents) / 100;
}

/**
 * The price to charge for this call. Flat tools return their sticker price unchanged; a
 * per-minute tool whose body carries no billable duration returns the sticker too (the schema
 * stage rejects such a body with 422 before any charge, this is only the fallback).
 */
export function resolveToolPriceUsd(toolId: string, stickerUsd: number, body: unknown): number {
  if (!PER_AUDIO_MINUTE_TOOLS.has(toolId)) return stickerUsd;
  const d =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)['duration_seconds']
      : undefined;
  return audioMinutePriceUsd(d) ?? stickerUsd;
}

/** A schema failure on the declared duration is a 422 (unbillable input), other tools stay 400. */
export function schemaFailureStatus(toolId: string, issuePaths: string[]): 400 | 422 {
  return PER_AUDIO_MINUTE_TOOLS.has(toolId) && issuePaths.includes('duration_seconds') ? 422 : 400;
}
