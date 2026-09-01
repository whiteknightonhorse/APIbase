/**
 * F1/C-4 — runtime margin gate on TOOL_STATUS.
 *
 * The control this must pass (Fable-approved F1 plan): a synthetic tool priced
 * BELOW upstream_cost_usd * 1.3 must be served on the "before" code (no gate)
 * and REFUSED on the "after" code (this commit). A control that's green on
 * both sides has measured nothing — so this file pins both directions: the
 * underpriced tool is rejected, an adequately-priced tool still passes, and a
 * not-yet-migrated tool (upstream_cost_usd null) is unaffected — the gate's
 * rollout must never take down the ~322 providers still pending migration.
 */

import {
  toolStatusStage,
  __setToolCacheEntryForTest,
  __deleteToolCacheEntryForTest,
  failsMarginGate,
} from '../../src/pipeline/stages/tool-status.stage';
import { createPipelineContext } from '../../src/pipeline/types';

function ctxFor(toolId: string) {
  const ctx = createPipelineContext('req-1', 'POST', '/execute', {}, {});
  ctx.toolId = toolId;
  return ctx;
}

describe('TOOL_STATUS margin gate (F1/C-4)', () => {
  afterEach(() => {
    __deleteToolCacheEntryForTest('test.underpriced');
    __deleteToolCacheEntryForTest('test.adequate');
    __deleteToolCacheEntryForTest('test.unmigrated');
  });

  it('REJECTS a tool priced below cost + 30% margin (the required control, "after")', async () => {
    __setToolCacheEntryForTest({
      tool_id: 'test.underpriced',
      status: 'healthy',
      price_usd: 0.001, // upstream costs 0.001, so break-even needs >= 0.0013
      cache_ttl: 60,
      upstream_cost_usd: 0.001,
    });

    const result = await toolStatusStage.execute(ctxFor('test.underpriced'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(503);
      // Client-visible code must NOT leak that a margin gate exists.
      expect(result.error.error).toBe('provider_unavailable');
    }
  });

  it('PASSES a tool priced at exactly cost * 1.3 (boundary, inclusive)', async () => {
    __setToolCacheEntryForTest({
      tool_id: 'test.adequate',
      status: 'healthy',
      price_usd: 0.0013,
      cache_ttl: 60,
      upstream_cost_usd: 0.001,
    });

    const result = await toolStatusStage.execute(ctxFor('test.adequate'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.toolPrice).toBe(0.0013);
    }
  });

  it('does NOT gate a tool with no upstream_cost_usd on record yet (unmigrated)', async () => {
    __setToolCacheEntryForTest({
      tool_id: 'test.unmigrated',
      status: 'healthy',
      price_usd: 0.0001, // would fail any real margin check, but nothing to check against yet
      cache_ttl: 60,
      upstream_cost_usd: null,
    });

    const result = await toolStatusStage.execute(ctxFor('test.unmigrated'));

    expect(result.ok).toBe(true);
  });

  describe('failsMarginGate() unit behavior', () => {
    it('null upstream_cost_usd never fails', () => {
      expect(failsMarginGate({ price_usd: 0, upstream_cost_usd: null })).toBe(false);
    });

    it('price below threshold fails', () => {
      expect(failsMarginGate({ price_usd: 0.001, upstream_cost_usd: 0.001 })).toBe(true);
    });

    it('price at or above threshold passes', () => {
      expect(failsMarginGate({ price_usd: 0.0013, upstream_cost_usd: 0.001 })).toBe(false);
      expect(failsMarginGate({ price_usd: 1, upstream_cost_usd: 0.001 })).toBe(false);
    });

    it('zero-cost (genuinely free upstream) never fails regardless of price', () => {
      expect(failsMarginGate({ price_usd: 0.0001, upstream_cost_usd: 0 })).toBe(false);
    });
  });
});
