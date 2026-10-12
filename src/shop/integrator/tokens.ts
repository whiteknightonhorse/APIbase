import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isLegalPublished, LEGAL_PUBLISHED_FILE } from '../legal/legal-docs';

export const MCP_BASELINE = resolve(__dirname, '../../../static/.well-known/mcp.json');

/** merchants_count from the sync-counts baseline (mcp.json) baked into the image at build time (same SHA as the nginx static release); read per render. */
function baselineMerchants(path: string): string {
  try {
    const n = Number(JSON.parse(readFileSync(path, 'utf8')).merchants_count);
    return String(Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0);
  } catch {
    return '0';
  }
}

/**
 * Token substitution for the /integrator pages. merchants_count comes from the sync-counts
 * baseline (mcp.json); fee/min order default from env. Numbers live only in tokens, never in the templates.
 */
export const DEFAULT_SANDBOX_STATUS =
  'Sandbox: not yet available — use the $0.01 test SKU on mainnet';

/** Facts key INTEGRATOR_BASE_FEE_MODE (T-INT-42): how the fee is collected on Base. */
export const INTEGRATOR_BASE_FEE_MODE = 'in-tx for fee-split clients, invoiced otherwise';

/**
 * Facts key stream_close_grace_s (T-0295): CLOSE_GRACE_PERIOD of the TIP-1034 escrow, in seconds.
 * Read from the TIP-1034 escrow by scripts/shop/probe-tip1034-payee.ts on 2026-10-06; re-run the
 * probe whenever escrow_contract changes.
 */
export const STREAM_CLOSE_GRACE_S = 900;

export const DRAFT_LEGAL_STATUS =
  'Drafts, not yet published. A page shows its banner until the operator publishes it.';

function legalStatus(file: string): string {
  const { published, published_at } = isLegalPublished(file);
  if (!published) return DRAFT_LEGAL_STATUS;
  return `Published on ${(published_at ?? '').slice(0, 10)}; the hashes are in /legal/index.json.`;
}

function feeState(): { on: boolean; pct: number } {
  const bps = Number(process.env.INTEGRATOR_FEE_BPS ?? 150);
  const on = process.env.INTEGRATOR_FEE_ENABLED === 'true' && Number.isFinite(bps) && bps > 0;
  return { on, pct: bps / 100 };
}

export function renderTokens(
  tpl: string,
  baselinePath: string = MCP_BASELINE,
  legalFile: string = LEGAL_PUBLISHED_FILE,
): string {
  const { on, pct } = feeState();
  const min = Number(process.env.INTEGRATOR_MIN_ORDER_USD ?? 1);
  const merchants = baselineMerchants(baselinePath);
  let s = tpl;
  if (!on) s = s.replace(/\{\{INTEGRATOR_FEE_PCT\}\} fee/g, '0% fee during the pilot');
  return s
    .replace(/\{\{INTEGRATOR_FEE_PCT\}\}/g, on ? `${pct}%` : '0% (pilot)')
    .replace(
      /\{\{INTEGRATOR_MIN_ORDER\}\}/g,
      () => `$${(Number.isFinite(min) ? min : 1).toFixed(2)}`,
    )
    .replace(/\{\{INTEGRATOR_BASE_FEE_MODE\}\}/g, () => INTEGRATOR_BASE_FEE_MODE)
    .replace(/\{\{STREAM_CLOSE_GRACE_S\}\}/g, () => String(STREAM_CLOSE_GRACE_S))
    .replace(/\{\{MERCHANTS_COUNT\}\}/g, () => merchants)
    .replace(/\{\{LEGAL_STATUS\}\}/g, () => legalStatus(legalFile))
    .replace(/\{\{SANDBOX_STATUS\}\}/g, () => process.env.SANDBOX_STATUS || DEFAULT_SANDBOX_STATUS);
}
