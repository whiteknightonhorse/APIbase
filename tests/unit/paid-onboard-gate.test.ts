import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import { paidOnboardViolations, PaidTool } from './helpers/paid-onboard-checker';

// T-NOP1112B: a provider onboarded through the paid path (billing.paid_onboard === true) must carry a
// dollar cap, a ledger-estimate spend source and a measured, margin-safe cost on every tool.
const ROOT = join(__dirname, '../..');
const MULT = (
  JSON.parse(readFileSync(join(ROOT, 'src/config/margin.json'), 'utf8')) as {
    MARGIN_MULTIPLIER: number;
  }
).MARGIN_MULTIPLIER;

const limits = JSON.parse(readFileSync(join(ROOT, 'src/config/provider-limits.json'), 'utf8'));
const tools = (
  parse(readFileSync(join(ROOT, 'config/tool_provider_config.yaml'), 'utf8')) as {
    tools: PaidTool[];
  }
).tools;

const goodBilling = {
  paid_onboard: true,
  cap_usd_month: 20,
  spend_source: 'ledger_estimate',
  monthly_fee_usd: 0,
};
const goodProvider = { paid_balance: true, billing: goodBilling };
const goodTool = (over: Partial<PaidTool> = {}): PaidTool => ({
  tool_id: 'fx.call',
  provider: 'fx',
  price_usd: '0.0013',
  upstream_cost_usd: '0.001',
  upstream_cost_model: 'metered',
  upstream_cost_remeasure_by: '2027-01-31',
  ...over,
});
const run = (provider: unknown, t: PaidTool[]) =>
  paidOnboardViolations({ fx: provider as never }, t, MULT);

describe('T-NOP1112B paid-onboard gate', () => {
  it('real files: every paid-onboarded provider is clean (vacuous while none exists)', () => {
    expect(paidOnboardViolations(limits, tools, MULT)).toEqual([]);
  });

  it('a good provider passes', () => {
    expect(run(goodProvider, [goodTool()])).toEqual([]);
  });

  it('a retired paid-onboarded provider is skipped', () => {
    expect(
      run(
        {
          ...goodProvider,
          retired: { at: '2026-11-01' },
          billing: { ...goodBilling, cap_usd_month: 500 },
        },
        [],
      ),
    ).toEqual([]);
  });

  const billingCases: Array<[string, unknown, string]> = [
    ['cap-range', { ...goodProvider, billing: { ...goodBilling, cap_usd_month: 0 } }, 'cap-range'],
    [
      'cap-range',
      { ...goodProvider, billing: { ...goodBilling, cap_usd_month: 101 } },
      'cap-range',
    ],
    [
      'cap-range',
      { ...goodProvider, billing: { ...goodBilling, cap_usd_month: '20' } },
      'cap-range',
    ],
    [
      'spend-source',
      { ...goodProvider, billing: { ...goodBilling, spend_source: 'zyte' } },
      'spend-source',
    ],
    [
      'monthly-fee',
      { ...goodProvider, billing: { ...goodBilling, monthly_fee_usd: 1 } },
      'monthly-fee',
    ],
    ['paid-balance', { billing: goodBilling }, 'paid-balance'],
  ];
  it.each(billingCases)('reports %s by name', (_n, provider, rule) => {
    const v = run(provider, [goodTool()]);
    expect(v).toHaveLength(1);
    expect(v[0]).toContain(`fx: rule "${rule}"`);
  });

  const toolCases: Array<[string, Partial<PaidTool>]> = [
    ['cost-model', { upstream_cost_model: 'flat' }],
    ['cost-number', { upstream_cost_usd: 0, price_usd: '0.01' }],
    ['cost-status', { upstream_cost_status: 'NOT_MEASURED' }],
    ['remeasure-by', { upstream_cost_remeasure_by: 'soon' }],
    ['price-floor', { price_usd: '0.0012' }],
  ];
  it.each(toolCases)('reports %s by name', (rule, over) => {
    const v = run(goodProvider, [goodTool(over)]);
    expect(v.some((l) => l.startsWith('fx/fx.call: rule "' + rule + '"'))).toBe(true);
  });

  it('reports a paid-onboarded provider with no tools', () => {
    expect(run(goodProvider, [])[0]).toContain('rule "no-tools"');
  });
});
