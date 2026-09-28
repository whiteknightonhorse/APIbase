// T-0218: OpenWeather's licensor (CC BY-SA 4.0 / ODbL) requires attribution
// "in any reasonable manner based on the medium" — for an M2M JSON response
// the response body is the only medium an agent sees, so RESPONSE stamps a
// machine-readable `metadata.attribution` for tools it applies to and
// deliberately omits it for everything else (provider-attribution.ts's map
// is the single source of truth for which tools qualify).

import { responseStage } from '../../../src/pipeline/stages/response.stage';
import { createPipelineContext } from '../../../src/pipeline/types';

function makeCtx(toolId: string) {
  const ctx = createPipelineContext('req-1', 'POST', '/api/v1/tools/x/call', {}, {});
  ctx.toolId = toolId;
  ctx.executionId = 'exec-1';
  ctx.providerResponse = { data: { ok: true } };
  ctx.billingStatus = 'PAID';
  ctx.finalCost = 0.001;
  return ctx;
}

describe('responseStage attribution (T-0218)', () => {
  it('stamps metadata.attribution for an OpenWeather tool', async () => {
    const result = await responseStage.execute(makeCtx('weather.get_current'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      const body = result.value.responseBody as { metadata: Record<string, unknown> };
      expect(body.metadata.attribution).toEqual({
        provider: 'OpenWeather',
        text: 'Weather data provided by OpenWeather',
        url: 'https://openweathermap.org',
        license: 'CC BY-SA 4.0 / ODbL',
      });
    }
  });

  it('omits metadata.attribution for a tool with no documented attribution requirement', async () => {
    const result = await responseStage.execute(makeCtx('crypto.get_price'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      const body = result.value.responseBody as { metadata: Record<string, unknown> };
      expect(body.metadata).not.toHaveProperty('attribution');
    }
  });
});
