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
    __deleteToolCacheEntryForTest('test.below-floor');
    __deleteToolCacheEntryForTest('test.at-floor');
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

  // T-01 (2026-09-05, Fable ruling-1 decision C1): price_floor_usd is a SEPARATE lock from
  // upstream_cost_usd -- it must reject a tool even when upstream_cost_usd is NULL (never
  // measured), which is exactly the scrape.screenshot case this lock exists for.
  it('REJECTS a tool priced below price_floor_usd even with upstream_cost_usd null', async () => {
    __setToolCacheEntryForTest({
      tool_id: 'test.below-floor',
      status: 'healthy',
      price_usd: 0.005,
      cache_ttl: 60,
      upstream_cost_usd: null,
      price_floor_usd: 0.024,
    });

    const result = await toolStatusStage.execute(ctxFor('test.below-floor'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(503);
      expect(result.error.error).toBe('provider_unavailable');
    }
  });

  it('PASSES a tool priced at or above price_floor_usd', async () => {
    __setToolCacheEntryForTest({
      tool_id: 'test.at-floor',
      status: 'healthy',
      price_usd: 0.024,
      cache_ttl: 60,
      upstream_cost_usd: null,
      price_floor_usd: 0.024,
    });

    const result = await toolStatusStage.execute(ctxFor('test.at-floor'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.toolPrice).toBe(0.024);
    }
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

    // T-01 (2026-09-05, Fable ruling-1 decision C1): price_floor_usd is a second,
    // independent lock. These pin the mutant that would delete just the floor check and
    // leave the cost check intact -- every case below has upstream_cost_usd null or
    // otherwise passing, so ONLY the floor check can be what fails them.
    it('null price_floor_usd never fails on its own (undefined or null)', () => {
      expect(
        failsMarginGate({ price_usd: 0.005, upstream_cost_usd: null, price_floor_usd: null }),
      ).toBe(false);
      expect(failsMarginGate({ price_usd: 0.005, upstream_cost_usd: null })).toBe(false);
    });

    it('price below price_floor_usd fails even with upstream_cost_usd null', () => {
      expect(
        failsMarginGate({ price_usd: 0.005, upstream_cost_usd: null, price_floor_usd: 0.024 }),
      ).toBe(true);
    });

    it('price at or above price_floor_usd passes when upstream_cost_usd is null', () => {
      expect(
        failsMarginGate({ price_usd: 0.024, upstream_cost_usd: null, price_floor_usd: 0.024 }),
      ).toBe(false);
      expect(
        failsMarginGate({ price_usd: 1, upstream_cost_usd: null, price_floor_usd: 0.024 }),
      ).toBe(false);
    });

    it('fails if EITHER the cost check or the floor check fails, even when the other passes', () => {
      // cost check passes (0.0013 >= 0.001 * 1.3), floor check must still catch it
      expect(
        failsMarginGate({ price_usd: 0.0013, upstream_cost_usd: 0.001, price_floor_usd: 0.02 }),
      ).toBe(true);
      // floor check passes, cost check must still catch it
      expect(
        failsMarginGate({ price_usd: 0.001, upstream_cost_usd: 0.001, price_floor_usd: 0.0001 }),
      ).toBe(true);
      // both pass
      expect(
        failsMarginGate({ price_usd: 0.03, upstream_cost_usd: 0.001, price_floor_usd: 0.02 }),
      ).toBe(false);
    });
  });
});
