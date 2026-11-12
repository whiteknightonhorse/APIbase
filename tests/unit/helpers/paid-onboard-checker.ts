// T-NOP1112B: pure checker for providers onboarded through the paid path (billing.paid_onboard === true).
export interface PaidTool {
  tool_id: string;
  provider: string;
  price_usd?: string | number;
  upstream_cost_usd?: string | number;
  upstream_cost_model?: string;
  upstream_cost_remeasure_by?: unknown;
  [k: string]: unknown;
}

type Limits = Record<string, Record<string, unknown> | undefined>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(v: unknown): boolean {
  if (typeof v !== 'string' || !ISO_DATE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** One line per violation: `<provider>[/<tool_id>]: rule "<name>" - <detail>`. Empty = clean. */
export function paidOnboardViolations(
  limits: Limits,
  tools: PaidTool[],
  marginMultiplier: number,
): string[] {
  const out: string[] = [];
  for (const [provider, cfg] of Object.entries(limits)) {
    if (!cfg || typeof cfg !== 'object') continue;
    const billing = cfg.billing as Record<string, unknown> | undefined;
    if (!billing || typeof billing !== 'object' || billing.paid_onboard !== true) continue;
    if (cfg.retired && typeof cfg.retired === 'object') continue;
    const cap = billing.cap_usd_month;
    if (typeof cap !== 'number' || !(cap > 0 && cap <= 100)) {
      out.push(
        `${provider}: rule "cap-range" - billing.cap_usd_month must be a number in (0, 100]`,
      );
    }
    if (billing.spend_source !== 'ledger_estimate') {
      out.push(`${provider}: rule "spend-source" - billing.spend_source must be "ledger_estimate"`);
    }
    if (billing.monthly_fee_usd !== 0) {
      out.push(`${provider}: rule "monthly-fee" - billing.monthly_fee_usd must be 0`);
    }
    if (cfg.paid_balance !== true) {
      out.push(`${provider}: rule "paid-balance" - paid_balance must be true`);
    }
    const mine = tools.filter((t) => t.provider === provider);
    if (mine.length === 0) {
      out.push(`${provider}: rule "no-tools" - no tool in config/tool_provider_config.yaml`);
    }
    for (const t of mine) {
      const where = `${provider}/${t.tool_id}`;
      if (t.upstream_cost_model !== 'metered') {
        out.push(`${where}: rule "cost-model" - upstream_cost_model must be "metered"`);
      }
      const cost =
        typeof t.upstream_cost_usd === 'number' || typeof t.upstream_cost_usd === 'string'
          ? Number(t.upstream_cost_usd)
          : NaN;
      if (!(cost > 0)) {
        out.push(`${where}: rule "cost-number" - upstream_cost_usd must be a number > 0`);
      }
      if ('upstream_cost_status' in t) {
        out.push(
          `${where}: rule "cost-status" - upstream_cost_status must be absent (cost is measured)`,
        );
      }
      if (!isIsoDate(t.upstream_cost_remeasure_by)) {
        out.push(`${where}: rule "remeasure-by" - upstream_cost_remeasure_by must be an ISO date`);
      }
      const price = Number(t.price_usd);
      const required = Math.round(cost * marginMultiplier * 1e8) / 1e8;
      if (!(cost > 0) || !(price >= required - 1e-12)) {
        out.push(
          `${where}: rule "price-floor" - price_usd must be >= upstream_cost_usd x MARGIN_MULTIPLIER (${required})`,
        );
      }
    }
  }
  return out;
}
