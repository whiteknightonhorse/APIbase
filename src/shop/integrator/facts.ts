import { DEFAULT_SANDBOX_STATUS } from './tokens';

/**
 * The `integrator` block of static/.well-known/mcp.json (T-INT-19, F-3/§13.4), built by
 * scripts/gen-discovery.ts. INTEGRATOR_FEE_BPS is the single fee source; fee_pct is 0 while the
 * fee is switched off.
 */
export function buildIntegratorBlock(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, unknown> {
  const num = (v: string | undefined, d: number) =>
    v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d;
  const bps = num(env.INTEGRATOR_FEE_BPS, 150);
  const fee_enabled = env.INTEGRATOR_FEE_ENABLED === 'true' && bps > 0;
  const rails: string[] = [];
  if (env.INTEGRATOR_BASE_ORDERS_ENABLED === 'true') rails.push('base');
  if (env.MPP_ENABLED === 'true') rails.push('tempo');
  return {
    fee_pct: fee_enabled ? bps / 100 : 0,
    fee_enabled,
    fee_min_usd: num(env.INTEGRATOR_FEE_MIN_USD, 0.05),
    min_order_usd: num(env.INTEGRATOR_MIN_ORDER_USD, 1),
    rails,
    test_sku_usd: 0.01,
    sandbox_status: env.SANDBOX_STATUS || DEFAULT_SANDBOX_STATUS,
  };
}
