import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const MCP_BASELINE = resolve(__dirname, '../../../static/.well-known/mcp.json');

/** merchants_count from the sync-counts baseline (mcp.json); read per render so a sync is picked up live. */
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

function feeState(): { on: boolean; pct: number } {
  const bps = Number(process.env.INTEGRATOR_FEE_BPS ?? 150);
  const on = process.env.INTEGRATOR_FEE_ENABLED === 'true' && Number.isFinite(bps) && bps > 0;
  return { on, pct: bps / 100 };
}

export function renderTokens(tpl: string, baselinePath: string = MCP_BASELINE): string {
  const { on, pct } = feeState();
  const min = Number(process.env.INTEGRATOR_MIN_ORDER_USD ?? 1);
  const merchants = baselineMerchants(baselinePath);
  let s = tpl;
  if (on) {
    s = s.replace(
      /Комиссия \{\{INTEGRATOR_FEE_PCT\}\}/g,
      `Комиссия ${String(pct).replace('.', ',')} %`,
    );
  } else {
    s = s
      .replace(/Комиссия \{\{INTEGRATOR_FEE_PCT\}\}/g, 'Комиссия 0 % в пилоте')
      .replace(/\{\{INTEGRATOR_FEE_PCT\}\} fee/g, '0% fee during the pilot');
  }
  return s
    .replace(/\{\{INTEGRATOR_FEE_PCT\}\}/g, on ? `${pct}%` : '0% (pilot)')
    .replace(
      /\{\{INTEGRATOR_MIN_ORDER\}\}/g,
      () => `$${(Number.isFinite(min) ? min : 1).toFixed(2)}`,
    )
    .replace(/\{\{MERCHANTS_COUNT\}\}/g, () => merchants)
    .replace(/\{\{SANDBOX_STATUS\}\}/g, () => process.env.SANDBOX_STATUS || DEFAULT_SANDBOX_STATUS);
}
