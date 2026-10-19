import { loadYamlTools } from '../../scripts/seed-plan';

// Upstream per-segment cost upper bounds from the T-0409 upstream_cost_note
// entries in config/tool_provider_config.yaml (measured 2026-10-14):
//   twilio.send_sms:     $0.0083 + max carrier fee $0.005 = $0.0133 -> 0.013
//   telnyx.send_sms_na:  $0.004 + max carrier fee $0.0045 = $0.0085
// T-0424: a two-segment message must never be sold below the 1.3x margin floor.
const MARGIN_FLOOR = 1.3;
const CASES: Array<[string, number, number]> = [
  ['twilio.send_sms', 0.02, 0.013],
  ['telnyx.send_sms_na', 0.016, 0.0085],
];

describe('T-0424 SMS price floor', () => {
  const tools = loadYamlTools();
  it.each(CASES)('%s price is %f and >= 1.3x upstream bound %f', (id, price, bound) => {
    const t = tools.find((x) => x.tool_id === id);
    expect(t).toBeDefined();
    const p = Number(t!.price_usd);
    expect(p).toBe(price);
    expect(p).toBeGreaterThanOrEqual(MARGIN_FLOOR * bound);
  });
});
