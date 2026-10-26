import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

// T-SITE-E: no paid tool enters the catalog without a cost model. Cost model notes live in the private repository apibase-internal.
const ROOT = join(__dirname, '../..');
const MODELS = ['free', 'free_tier', 'flat', 'subscription', 'metered'];

interface Tool {
  tool_id: string;
  provider: string;
  price_usd?: string | number;
  upstream_cost_usd?: string | number;
  upstream_cost_status?: string;
  upstream_cost_model?: string;
  upstream_cost_note?: string;
}

export function unknownProviders(md: string): Set<string> {
  return new Set([...md.matchAll(/^## (\S+)/gm)].map((m) => m[1]));
}

/** Returns one failure line per violated rule: "<tool_id> (<provider>): <rule>". */
export function costModelViolations(tools: Tool[], listed: Set<string>): string[] {
  const out: string[] = [];
  const costSet = new Set<string>();
  for (const t of tools) {
    const has = t.upstream_cost_usd !== undefined && t.upstream_cost_usd !== null;
    if (has) costSet.add(t.provider);
    const where = `${t.tool_id} (${t.provider})`;
    const note = typeof t.upstream_cost_note === 'string' ? t.upstream_cost_note.trim() : '';
    if (t.upstream_cost_model !== undefined) {
      if (!MODELS.includes(t.upstream_cost_model)) {
        out.push(
          `${where}: rule "model-enum" — upstream_cost_model "${t.upstream_cost_model}" is not one of ${MODELS.join('|')}`,
        );
      } else if (t.upstream_cost_model !== 'free' && !(note && note.includes('http'))) {
        out.push(
          `${where}: rule "note-required" — model ${t.upstream_cost_model} needs upstream_cost_note with a pricing URL (http...)`,
        );
      }
    }
    if (!(Number(t.price_usd) > 0)) continue;
    if (has) continue;
    const metered =
      t.upstream_cost_status === 'NOT_MEASURED' &&
      t.upstream_cost_model === 'metered' &&
      note !== '';
    if (metered || listed.has(t.provider)) continue;
    out.push(
      `${where}: rule "cost-model-required" — paid tool has no upstream_cost_usd, no NOT_MEASURED+metered+note block, and provider has no section in config/unknown-cost-providers.md`,
    );
  }
  for (const p of listed) {
    if (costSet.has(p)) {
      out.push(
        `provider ${p}: rule "list-only-shrinks" — a tool has upstream_cost_usd but config/unknown-cost-providers.md still has "## ${p}"`,
      );
    }
  }
  return out;
}

describe('T-SITE-E cost-model-required gate', () => {
  const tools = (
    parse(readFileSync(join(ROOT, 'config/tool_provider_config.yaml'), 'utf8')) as { tools: Tool[] }
  ).tools;
  const listed = unknownProviders(
    readFileSync(join(ROOT, 'config/unknown-cost-providers.md'), 'utf8'),
  );

  it('every paid tool has a cost, a metered block, or a listed provider', () => {
    expect(costModelViolations(tools, listed)).toEqual([]);
  });

  it('fails for a new paid tool with no cost model', () => {
    const fixture: Tool = { tool_id: 'x.paid', provider: 'x', price_usd: '0.001' };
    const v = costModelViolations([...tools, fixture], listed);
    expect(v).toHaveLength(1);
    expect(v[0]).toContain('x.paid (x)');
    expect(v[0]).toContain('cost-model-required');
  });

  it('rejects unknown model, missing note/URL, and stale md sections', () => {
    const base = { provider: 'y', price_usd: '0.001', upstream_cost_usd: '0.0005' };
    expect(
      costModelViolations(
        [{ ...base, tool_id: 'y.a', upstream_cost_model: 'bogus' }],
        new Set(),
      )[0],
    ).toContain('model-enum');
    expect(
      costModelViolations([{ ...base, tool_id: 'y.b', upstream_cost_model: 'flat' }], new Set())[0],
    ).toContain('note-required');
    expect(
      costModelViolations(
        [
          {
            ...base,
            tool_id: 'y.c',
            upstream_cost_model: 'flat',
            upstream_cost_note: 'https://y.example/pricing',
          },
        ],
        new Set(),
      ),
    ).toEqual([]);
    expect(costModelViolations([{ ...base, tool_id: 'y.d' }], new Set(['y']))[0]).toContain(
      'list-only-shrinks',
    );
  });
});
