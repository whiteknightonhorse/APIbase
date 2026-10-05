/**
 * Token substitution for the /integrator pages. Real values come from sync-counts (INT-19);
 * until then the defaults are read from env. Numbers live only in tokens, never in the templates.
 */
export const DEFAULT_SANDBOX_STATUS =
  'Sandbox: not yet available — use the $0.01 test SKU on mainnet';

function feeState(): { on: boolean; pct: number } {
  const bps = Number(process.env.INTEGRATOR_FEE_BPS ?? 150);
  const on = process.env.INTEGRATOR_FEE_ENABLED === 'true' && Number.isFinite(bps) && bps > 0;
  return { on, pct: bps / 100 };
}

export function renderTokens(tpl: string): string {
  const { on, pct } = feeState();
  const min = Number(process.env.INTEGRATOR_MIN_ORDER_USD ?? 1);
  const merchants = String(Number(process.env.MERCHANTS_COUNT ?? 0) || 0);
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
