import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

// T-0628: official upstream costs recorded for 13 paid tools; price must hold the F1/C-4 floor (cost x 1.3).
const TOOLS = [
  'stability.generate',
  'email.validate',
  'scrape.screenshot',
  'scrape.browser',
  'twilio.send_sms',
  'canopy.search',
  'canopy.product',
  'canopy.offers',
  'canopy.deals',
  'exa.search',
  'telnyx.send_sms_na',
  'tavily.search',
  'tavily.extract',
];

interface Tool {
  tool_id: string;
  price_usd?: string | number;
  upstream_cost_usd?: string | number;
  upstream_cost_status?: string;
}

const doc = parse(
  readFileSync(join(__dirname, '../../config/tool_provider_config.yaml'), 'utf8'),
) as {
  tools: Tool[];
};
const byId = new Map(doc.tools.map((t) => [t.tool_id, t]));

describe('T-0628 paid tool price >= upstream cost x 1.3', () => {
  it.each(TOOLS)('%s', (id) => {
    const t = byId.get(id);
    expect(t).toBeDefined();
    expect(t!.upstream_cost_status).toBeUndefined();
    const cost = Number(t!.upstream_cost_usd);
    const price = Number(t!.price_usd);
    expect(cost).toBeGreaterThan(0);
    expect(price).toBeGreaterThanOrEqual(cost * 1.3 - 1e-9);
  });
});
