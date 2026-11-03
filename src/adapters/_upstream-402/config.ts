import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { logger } from '../../config/logger';
import { upstreamGate, type GateRefusal } from '../../payments/upstream-payer';

/**
 * T-0655: `upstream_pay` config, locked price and the pre-payment gate of the upstream-paid
 * adapter kind. Kept apart from the adapter class so TOOL_STATUS can import it without loading
 * the adapter stack (base.adapter -> redis -> startup config).
 */

// ---------------------------------------------------------------------------
// Config (closed set, zod)
// ---------------------------------------------------------------------------

const ADDR = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const USD = z
  .string()
  .regex(/^\d+(\.\d{1,6})?$/)
  .refine((s) => Number(s) > 0, 'must be > 0');

export const upstreamPaySchema = z
  .object({
    rail: z.enum(['x402', 'mpp']),
    /** CAIP-2: eip155:8453 / eip155:84532 (x402 on Base), eip155:4217 / eip155:42431 (MPP on Tempo). */
    network: z.enum(['eip155:8453', 'eip155:84532', 'eip155:4217', 'eip155:42431']),
    asset: ADDR,
    /** The provider's listed per-call price (input of upstreamToolPriceUsd). */
    listed_price_usd: USD,
    /** The most APIbase pays per call; a challenge above it is refused. */
    max_price_usd: USD,
    pay_to_allowlist: z.array(ADDR).min(1).max(5),
    tools: z
      .record(
        z.string().regex(/^[a-z0-9-]+\.[a-z0-9_]+$/),
        z
          .object({ method: z.enum(['GET', 'POST']), url: z.string().url().startsWith('https://') })
          .strict(),
      )
      .refine((t) => Object.keys(t).length > 0, 'at least one tool'),
  })
  .strict()
  .superRefine((v, ctx) => {
    const chain = Number(v.network.split(':')[1]);
    const base = chain === 8453 || chain === 84532;
    if ((v.rail === 'x402') !== base) {
      ctx.addIssue({ code: 'custom', message: `rail ${v.rail} does not run on ${v.network}` });
    }
    if (Number(v.max_price_usd) < Number(v.listed_price_usd)) {
      ctx.addIssue({ code: 'custom', message: 'max_price_usd below listed_price_usd' });
    }
  });

export type UpstreamPayConfig = z.infer<typeof upstreamPaySchema>;

interface YamlTool {
  tool_id?: unknown;
  provider?: unknown;
  price_usd?: unknown;
}

/**
 * Parse and validate every `upstream_pay` block. Throws on any invalid block, on a tool that
 * is not in `tools:` with the same provider, or on a tool whose price_usd is below max_price_usd
 * (APIbase never pays upstream more than it charges).
 */
export function parseUpstreamConfig(doc: {
  tools?: YamlTool[];
  upstream_pay?: unknown;
}): Map<string, UpstreamPayConfig> {
  const out = new Map<string, UpstreamPayConfig>();
  const raw = doc.upstream_pay ?? {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('upstream_pay must be a map of provider -> block');
  }
  const byId = new Map((doc.tools ?? []).map((t) => [String(t.tool_id), t]));
  for (const [provider, block] of Object.entries(raw)) {
    const cfg = upstreamPaySchema.parse(block);
    for (const toolId of Object.keys(cfg.tools)) {
      const t = byId.get(toolId);
      if (!t || t.provider !== provider || toolId.split('.')[0] !== provider) {
        throw new Error(`upstream_pay.${provider}: tool ${toolId} missing or not of this provider`);
      }
      if (!(Number(t.price_usd) >= Number(cfg.max_price_usd))) {
        throw new Error(`upstream_pay.${provider}: ${toolId} price_usd below max_price_usd`);
      }
    }
    out.set(provider, cfg);
  }
  return out;
}

let cached: Map<string, UpstreamPayConfig> | null = null;

export function loadUpstreamConfig(): Map<string, UpstreamPayConfig> {
  if (cached) return cached;
  const path = resolve(__dirname, '..', '..', '..', 'config', 'tool_provider_config.yaml');
  try {
    cached = parseUpstreamConfig(parse(readFileSync(path, 'utf-8')));
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : 'error' }, 'upstream_pay config invalid');
    cached = new Map();
  }
  return cached;
}

/** Test seam. */
export function setUpstreamConfig(m: Map<string, UpstreamPayConfig> | null): void {
  cached = m;
}

export function upstreamConfigFor(provider: string): UpstreamPayConfig | undefined {
  return loadUpstreamConfig().get(provider);
}

// ---------------------------------------------------------------------------
// Price (fixed at onboarding)
// ---------------------------------------------------------------------------

/** Our price grid: $0.001. */
export const PRICE_GRID_USD = 0.001;

/** ceil_to_grid(listed x (1 + bps/10000)), as the decimal string written to price_usd. */
export function upstreamToolPriceUsd(listedUsd: number, markupBps: number): string {
  const micro = Math.round(listedUsd * 1e6) * (10_000 + markupBps);
  const gridMicro = PRICE_GRID_USD * 1e6 * 10_000;
  const steps = Math.ceil(micro / gridMicro);
  return (steps * PRICE_GRID_USD).toFixed(3);
}

export const toMicro = (usd: string): number => Math.round(Number(usd) * 1e6);
export const chainOf = (network: string): number => Number(network.split(':')[1]);

/** TOOL_STATUS pre-check: null = the payer can pay for this tool now. */
export async function upstreamGateForTool(toolId: string): Promise<GateRefusal | null> {
  const provider = toolId.split('.')[0];
  const cfg = upstreamConfigFor(provider);
  if (!cfg || !cfg.tools[toolId]) return null;
  return upstreamGate({
    provider,
    rail: cfg.rail,
    chainId: chainOf(cfg.network),
    asset: cfg.asset,
    maxPriceMicro: toMicro(cfg.max_price_usd),
  });
}
